from typing import Dict, List, Optional, Any
from app.models.persona import Persona, RESPONSE_FORMAT_V2, STRUCTURE_HINTS, tidy_markdown
from app.core.session_manager import ConversationContext, get_session_manager
from app.core.context_manager import get_context_manager
from app.core.rag_manager import get_rag_manager
from app.config import get_settings
from app.llm.llm_client import LLMClient, ToolCallResult
from app.sources import academics
from app.tools import ToolContext, get_tool_definitions, get_tool_executor

import asyncio
import dataclasses
import json
import logging
import os
import re

logger = logging.getLogger(__name__)

_BASE_TOOL_PROMPT = (
    "You are a helpful assistant with access to external tools. "
    "Use the available tools when the user's question can be answered "
    "by one of them. Call the tool before you answer; never state a "
    "grade, GPA, time, place or distance from memory. If no tool is "
    "relevant, respond with a brief text answer. "
    "If a tool response includes 'truncated': true, let the user know "
    "how many total results were found and suggest they narrow their "
    "search for more specific results. "
    "Format your responses using markdown."
)

_BULLETS_PROMPT = (
    "Use bullet points to present structured data like course listings or "
    "professor ratings."
)

# Course tools that can attach inline course cards when the school's academics
# provider has course detail pages.
_COURSE_CARD_TOOLS = (
    "course_grades",
    "course_sections",
    "course_prerequisites",
    "course_next",
)

# Tools whose results always show as cards (built from the result itself).
_SELF_CONTAINED_CARD_TOOLS = ("events_search", "find_place")

# What the card for each tool shows, so the answer can leave it out.
_CARD_CONTENTS = {
    "course_grades": "the grade distribution, GPA and class size for the latest term",
    "course_sections": "sections, seats left and instructor ratings",
    "course_prerequisites": "the prerequisite tree",
    "course_next": "the courses it leads to",
    "events_search": "each event's date, time, place and link",
    "find_place": "each place's map link and walking time",
}


def _card_answer_prompt(card_tools: List[str]) -> str:
    """Tell the model the cards carry the data, so the text gives the verdict.

    Answers used to restate every number the cards below them already show
    (grade-by-grade bullets, per-event time and place lists, coordinates).
    """
    shows = "; ".join(f"{name}: {_CARD_CONTENTS[name]}" for name in card_tools)
    prompt = (
        "The app shows the results of these tools as cards right under your "
        f"answer ({shows}). When you used one of them, answer in at most three "
        "short sentences of plain prose: lead with the verdict (is the course "
        "hard, which event fits, how long the walk is), cite at most one or "
        "two numbers that support it, and add "
        "advice the cards cannot show. Do not repeat the cards: no lists of "
        "grades or percentages, no bullet lists of events with their times, "
        "locations or calendars, no coordinates and no map links. "
    )
    if "course_grades" in card_tools:
        prompt += (
            "If you cite grade numbers, use the most recent term in the result, "
            "which is the term the card shows, and name that term. "
        )
    return prompt + (
        "For results of other tools, use bullet points to present structured "
        "data like course listings or professor ratings."
    )


def _tool_guidance_prompt(
    tools_enabled: List[str], institution: str, *, link_courses: bool = True
) -> str:
    """Build the tool-step system prompt from the tools this school enables.

    Guidance for a tool is only included when that tool is enabled, so a
    deployment is never told about tools it does not have. Course links and
    cards are only described when the provider has course detail pages.
    """
    course_tools = [name for name in _COURSE_CARD_TOOLS if name in tools_enabled]
    card_tools = [
        *(course_tools if link_courses else []),
        *(name for name in _SELF_CONTAINED_CARD_TOOLS if name in tools_enabled),
    ]
    style = _card_answer_prompt(card_tools) if card_tools else _BULLETS_PROMPT
    prompt = f"{_BASE_TOOL_PROMPT} {style}"
    if not course_tools:
        return prompt
    tool_list = ", ".join(course_tools)
    if not link_courses:
        return (
            f"{prompt} "
            "When the user asks about course GPA, grade distribution, sections, "
            f"or instructors, call the matching course tool ({tool_list}). "
            "If a tool result includes data_as_of or data_note, tell the user "
            "how old the data is, and describe enrollment and seats as "
            "historical, not current availability."
        )
    school = f"{institution} " if institution else ""
    return (
        f"{prompt} "
        f"Whenever you mention a specific {school}course, render its "
        "identifier as a markdown link using the 'course:' scheme, e.g. "
        "[COMP SCI 300](course:COMP SCI 300) or [MATH 240](course:MATH 240). "
        "Use the real course identifier (subject and number) in both the link "
        "text and the target. "
        "When the user asks about course GPA, completion/A rates, class size, "
        "grade distribution, historical grade trends, schedules/sections, "
        "instructors, prerequisites, or what to take next / what a course "
        "unlocks / post-requisites, call the matching course tool "
        f"({tool_list}). "
        "Those tool calls attach interactive course cards inline in chat."
    )


# Which domain each tool belongs to. Tools not listed share a "general" pass.
DOMAIN_OF_TOOL = {
    "search_courses": "academics",
    "rate_my_professor": "academics",
    "course_search": "academics",
    "course_grades": "academics",
    "course_sections": "academics",
    "course_prerequisites": "academics",
    "course_next": "academics",
    "events_search": "student_life",
    "find_place": "campus",
    "plan_edit": "planning",
    "plan_suggest": "planning",
}
DOMAIN_DESCRIPTIONS = {
    "academics": "courses, grades, sections, professors, prerequisites",
    "student_life": "campus events, things to do, deadlines on the events calendar",
    "campus": "where buildings, libraries, dining or bus stops are; how to get somewhere",
    "planning": "the student's semester plan: adding, dropping, moving courses, what to take, requirements",
    "general": "anything else the remaining tools cover",
}
# Local models (e.g. Ollama on a laptop) need longer; set these in the environment.
CLASSIFIER_TIMEOUT_S = float(os.getenv("CLASSIFIER_TIMEOUT_S", "5"))
TOOL_PASS_TIMEOUT_S = float(os.getenv("TOOL_PASS_TIMEOUT_S", "20"))


PLANNING_TOOLS = tuple(name for name, domain in DOMAIN_OF_TOOL.items() if domain == "planning")
# How much of the conversation the planning pass sees (R15).
PLANNING_EXCHANGES = 6
PLANNING_TURN_CHARS = 400
PLAN_RETRY_TEXT = (
    "Your plan changed while I was checking that change. Please send your "
    "request again and I'll check it against the latest plan."
)

_PLANNING_PROMPT = (
    "You help a student change their semester plan at {school}. You can only "
    "propose: plan_edit stores your change as a proposal the student accepts "
    "or discards with buttons on a card under your answer. Never say a change "
    "was made, applied or saved; say what you proposed. "
    "Call plan_edit for adding, dropping, moving or swapping courses, using "
    "course identifiers exactly as they appear in the plan or the shortlist; "
    "pass the student's own words as `asked`. If the student refers to a "
    "shortlist option ('the second one', 'option 2'), use that option's "
    "course. Call plan_suggest when the student asks what to take or wants "
    "ideas. "
    "Explain a proposal only with what the tool result states: its heading, "
    "its diff (courses, rule counts, credits, difficulty, clashes) and its "
    "unknowns, and for suggestions only the item labels. Never claim a "
    "course fills a requirement, a gen-ed or a prerequisite unless the tool "
    "result says so; if it says unknown, say unknown. "
    "If what you propose differs from what the student literally asked "
    "(for example they said drop and you moved the course to a later term), "
    "say so plainly in the first sentence and why. "
    "If a tool returns an error such as unknown_course or "
    "couldnt_verify_course, reply in one or two plain sentences (for example "
    "\"I couldn't find ECON 3999 at {school}\") and do not invent a course. "
    "Keep the answer to at most three short sentences; the card shows the "
    "details."
)


def _clip(text: str, limit: int = PLANNING_TURN_CHARS) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def planning_exchanges(history: Optional[List[Dict[str, Any]]], limit: int = PLANNING_EXCHANGES) -> List[Dict[str, str]]:
    """The last *limit* (student, reply) pairs whose reply was a planning reply."""
    pairs: List[Dict[str, str]] = []
    last_user = ""
    for msg in history or []:
        if not isinstance(msg, dict):
            continue
        if msg.get("role") == "user":
            last_user = msg.get("content") or ""
        elif msg.get("planning"):
            pairs.append({"student": last_user, "reply": msg.get("content") or ""})
            last_user = ""
    return pairs[-limit:]


def current_shortlist(history: Optional[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    """The most recent shortlist shown in this chat, with its option ids."""
    for msg in reversed(list(history or [])):
        if isinstance(msg, dict) and (msg.get("planning") or {}).get("shortlist"):
            return list(msg["planning"]["shortlist"])
    return []


def previous_planning_reply(history: Optional[List[Dict[str, Any]]]) -> Optional[str]:
    """The previous assistant turn, when it was a planning reply (for the classifier)."""
    for msg in reversed(list(history or [])):
        if not isinstance(msg, dict) or msg.get("role") == "user":
            continue
        return msg.get("content") if msg.get("planning") else None
    return None


def planning_note(result: ToolCallResult) -> Optional[Dict[str, Any]]:
    """What the session remembers about a planning reply: its shortlist and proposal.

    ``None`` when no planning tool ran. The chat route stores it on the
    orchestrator message so later passes can resolve "the second one".
    """
    outputs = [o for o in result.tool_outputs or [] if o.get("name") in PLANNING_TOOLS]
    if not outputs:
        return None
    note: Dict[str, Any] = {"tools": [o["name"] for o in outputs]}
    for output in outputs:
        found = output.get("result") or {}
        if not isinstance(found, dict) or found.get("error"):
            continue
        if output["name"] == "plan_suggest" and found.get("items"):
            note["shortlist"] = [
                {"option": item.get("option_id"), "id": item.get("id"), "title": item.get("title") or ""}
                for item in found["items"]
                if item.get("option_id") and item.get("id")
            ]
        elif output["name"] == "plan_edit" and found.get("proposal"):
            note["proposal_id"] = found["proposal"].get("id")
    return note


def planning_prompt(
    institution: str,
    summary: str,
    revision: int,
    exchanges: List[Dict[str, str]],
    shortlist: List[Dict[str, str]],
) -> str:
    """System prompt for the planning pass: rules, plan summary, recent turns, shortlist."""
    parts = [
        _PLANNING_PROMPT.format(school=institution or "this school"),
        f"The student's plan (revision {revision}):\n{summary}",
    ]
    if exchanges:
        turns = "\n".join(
            f"Student: {_clip(e['student'])}\nYou: {_clip(e['reply'])}" for e in exchanges
        )
        parts.append(f"Recent planning conversation, oldest first:\n{turns}")
    if shortlist:
        rows = "\n".join(
            f"{item['option']}: {item['id']}" + (f" ({item['title']})" if item.get("title") else "")
            for item in shortlist
        )
        parts.append(
            "The shortlist the student was last shown (option ids in order; "
            f"'the second one' is option-2):\n{rows}"
        )
    return "\n\n".join(parts)


def _revision_conflicted(result: ToolCallResult) -> bool:
    return any(
        o.get("name") == "plan_edit" and isinstance(o.get("result"), dict)
        and o["result"].get("code") == "revision_conflict"
        for o in result.tool_outputs or []
    )


def tools_by_domain(tools: List[str]) -> Dict[str, List[str]]:
    grouped: Dict[str, List[str]] = {}
    for name in tools:
        grouped.setdefault(DOMAIN_OF_TOOL.get(name, "general"), []).append(name)
    return grouped


def event_venues(result: ToolCallResult, limit: int = 5) -> List[str]:
    venues: List[str] = []
    for output in result.tool_outputs or []:
        for event in (output.get("result") or {}).get("events") or []:
            location = (event.get("location") or "").strip()
            if location and location not in venues:
                venues.append(location)
    return venues[:limit]


def merge_tool_results(results: List[ToolCallResult]) -> ToolCallResult:
    used = [r for r in results if r.used_tool]
    if not used:
        return ToolCallResult(text="", used_tool=False)
    return ToolCallResult(
        text="\n\n".join(r.text.strip() for r in used if r.text and r.text.strip()),
        used_tool=True,
        tool_name=used[0].tool_name,
        tool_args=used[0].tool_args,
        tool_calls_made=[call for r in used for call in r.tool_calls_made],
        tool_outputs=[output for r in used for output in r.tool_outputs],
    )


class ImprovedChatOrchestrator:
    """
    Enhanced orchestrator with document awareness and improved context handling
    """
    
    def __init__(self, llm_client: LLMClient = None):
        self.personas: Dict[str, Persona] = {}
        self.llm_client = llm_client
        self.session_manager = get_session_manager()
        self.context_manager = get_context_manager()
    
    def register_persona(self, persona: Persona):
        """Register or update a persona in the orchestrator."""
        is_new = persona.id not in self.personas
        self.personas[persona.id] = persona
        if is_new:
            logger.info(f"Registered persona: {persona.id} ({persona.name})")
    
    def unregister_persona(self, persona_id: str):
        """Remove a persona from the orchestrator."""
        removed = self.personas.pop(persona_id, None)
        if removed:
            logger.info(f"Unregistered persona: {persona_id} ({removed.name})")

    def get_persona(self, persona_id: str) -> Optional[Persona]:
        """Get a specific persona"""
        return self.personas.get(persona_id)
    
    def list_personas(self) -> List[str]:
        """List all available persona IDs"""
        return list(self.personas.keys())

    async def get_tool_response(self, user_message: str,
                               llm_client: LLMClient = None,
                               context: Optional[ToolContext] = None,
                               history: Optional[List[Dict[str, Any]]] = None) -> ToolCallResult:
        """Check whether a tool can handle *user_message*.

        Tools are grouped by domain (academics, student life, campus). With
        one enabled domain this is a single tool pass. With several, a short
        classifier call picks the domains the message needs, and each picked
        domain gets its own tool pass with only its tools::

            message ─► classify ── error/timeout/empty ─► all enabled domains
                          │ picked domains
                          ├─ independent ─► gather(pass per domain, timeout each)
                          └─ student_life + campus ─► events pass ─► venues ─► campus pass
                                                   ▼
                                    merged ToolCallResult (text, tool outputs)

        *context* is the signed-in student (``ToolContext``), built by the chat
        route; without it the planning domain is left out. *history* is the
        chat session's earlier messages, which the planning pass and the
        classifier read (R15).

        Returns ``ToolCallResult(used_tool=False)`` when tools are disabled,
        no LLM client is available, or no pass used a tool.
        """
        effective_llm = llm_client or self.llm_client
        if effective_llm is None:
            return ToolCallResult(text="", used_tool=False)

        settings = get_settings()
        tools_enabled = settings.tools.get_enabled_names()
        if context is None:
            # Planning tools act on a signed-in student's plan.
            tools_enabled = [name for name in tools_enabled if name not in PLANNING_TOOLS]
        if not tools_enabled or not get_tool_definitions(enabled=tools_enabled):
            return ToolCallResult(text="", used_tool=False)

        by_domain = tools_by_domain(tools_enabled)
        if len(by_domain) == 1:
            (tools,) = by_domain.values()
            return await self._tool_pass(effective_llm, tools, user_message, context=context, history=history)

        previous = previous_planning_reply(history) if "planning" in by_domain else None
        selected = await self._classify_domains(effective_llm, user_message, list(by_domain), previous=previous)
        if not selected:
            return ToolCallResult(text="", used_tool=False)
        tasks = []
        if "student_life" in selected and "campus" in selected:
            # Times each of its two passes itself, so events survive a slow campus pass.
            tasks.append(self._events_then_campus(effective_llm, by_domain, user_message))
            selected = [d for d in selected if d not in ("student_life", "campus")]
        tasks += [
            asyncio.wait_for(
                self._tool_pass(effective_llm, by_domain[d], user_message, context=context, history=history),
                TOOL_PASS_TIMEOUT_S,
            )
            for d in selected
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        passes: List[ToolCallResult] = []
        for result in results:
            if isinstance(result, BaseException):
                logger.warning("Tool pass dropped: %r", result)
                continue
            passes.extend(result if isinstance(result, list) else [result])
        return merge_tool_results(passes)

    async def _tool_pass(
        self,
        llm: LLMClient,
        tools: List[str],
        user_message: str,
        context: Optional[ToolContext] = None,
        history: Optional[List[Dict[str, Any]]] = None,
    ) -> ToolCallResult:
        settings = get_settings()
        if context is not None and any(name in PLANNING_TOOLS for name in tools):
            return await self._planning_pass(llm, tools, user_message, context, history)
        return await llm.generate_with_tools(
            system_prompt=_tool_guidance_prompt(
                tools,
                settings.app.institution,
                link_courses=academics.links_to_course_pages(),
            ),
            user_message=user_message,
            tool_definitions=get_tool_definitions(enabled=tools),
            tool_executor=get_tool_executor(enabled=tools, context=context),
        )

    async def _planning_pass(
        self,
        llm: LLMClient,
        tools: List[str],
        user_message: str,
        context: ToolContext,
        history: Optional[List[Dict[str, Any]]],
    ) -> ToolCallResult:
        """The planning domain's pass: the model sees the plan and proposes.

        The prompt carries the plan summary and the revision it was built from
        (R3, R9), the last planning exchanges and the current shortlist (R15).
        The revision and the shortlist's option ids go into the tool context,
        so the model never supplies them. On ``revision_conflict`` the summary
        is re-read and the pass runs once more; a second conflict stops and
        asks the student to retry.
        """
        from app.planner import service as planner_service

        institution = get_settings().app.institution
        exchanges = planning_exchanges(history)
        shortlist = current_shortlist(history)
        options = {item["option"]: item["id"] for item in shortlist}
        result = ToolCallResult(text="", used_tool=False)
        for _attempt in range(2):
            try:
                summary, revision = await planner_service.plan_summary(
                    context.user_id, context.school, active_term=context.active_term
                )
            except Exception as exc:  # noqa: BLE001 — no plan, no planning pass
                logger.warning("Plan summary failed (%r); skipping the planning pass", exc)
                return ToolCallResult(text="", used_tool=False)
            pass_context = dataclasses.replace(context, plan_revision=revision, options=options)
            result = await llm.generate_with_tools(
                system_prompt=planning_prompt(institution, summary, revision, exchanges, shortlist),
                user_message=user_message,
                tool_definitions=get_tool_definitions(enabled=tools),
                tool_executor=get_tool_executor(enabled=tools, context=pass_context),
            )
            if not _revision_conflicted(result):
                return result
            logger.info("Plan moved during the planning pass; re-reading the summary")
        return dataclasses.replace(result, text=PLAN_RETRY_TEXT, used_tool=True)

    async def _events_then_campus(
        self, llm: LLMClient, by_domain: Dict[str, List[str]], user_message: str
    ) -> List[ToolCallResult]:
        """Run events first, then campus with the event venues it found.

        Each pass has its own timeout; a failed or slow campus pass keeps the
        events answer.
        """
        events = await asyncio.wait_for(
            self._tool_pass(llm, by_domain["student_life"], user_message), TOOL_PASS_TIMEOUT_S
        )
        venues = event_venues(events)
        campus_message = user_message
        if venues:
            campus_message = (
                f"{user_message}\n\nThe events found are at these locations; look "
                f"them up on the campus map: {'; '.join(venues)}"
            )
        try:
            campus = await asyncio.wait_for(
                self._tool_pass(llm, by_domain["campus"], campus_message), TOOL_PASS_TIMEOUT_S
            )
        except Exception as exc:  # noqa: BLE001 — keep the events answer
            logger.warning("Campus pass dropped after events: %r", exc)
            return [events]
        return [events, campus]

    async def _classify_domains(
        self, llm: LLMClient, user_message: str, domains: List[str], previous: Optional[str] = None
    ) -> List[str]:
        """Pick the domains *user_message* needs.

        *previous* is the previous assistant turn when it was a planning
        reply, so a follow-up like "use the second one" reaches planning.
        An explicit empty pick means no tools. A failure, timeout, unparseable
        reply or a pick of only unknown domains means all of them.
        """
        prompt = (
            "Classify which of these domains a student's message needs. "
            f"Domains: {json.dumps({d: DOMAIN_DESCRIPTIONS.get(d, d) for d in domains})}. "
            'Reply with JSON only, e.g. {"domains": ["campus"]}. Pick every domain '
            "the message needs; pick none if no domain fits."
        )
        try:
            raw = await asyncio.wait_for(
                llm.generate(
                    system_prompt=prompt,
                    context=[
                        *([{"role": "assistant", "content": _clip(previous)}] if previous else []),
                        {"role": "user", "content": user_message},
                    ],
                    temperature=0.0,
                    max_tokens=60,
                    response_mime_type="application/json",
                ),
                CLASSIFIER_TIMEOUT_S,
            )
            match = re.search(r"\{.*\}", raw or "", re.S)
            picked = json.loads(match.group(0)).get("domains") if match else None
        except Exception as exc:  # noqa: BLE001 — fall back to every domain
            logger.warning("Domain classifier failed (%r); using all domains", exc)
            return domains
        if not isinstance(picked, list):
            logger.info("Domain classifier reply had no domain list; using all domains")
            return domains
        if not picked:
            return []
        known = [d for d in picked if d in domains]
        if not known:
            logger.info("Domain classifier picked only unknown domains; using all domains")
            return domains
        return known

    # TODO: Investigate if this method is still needed and remove if not.
    async def process_message(self, 
                            user_input: str, 
                            session_id: Optional[str] = None,
                            response_length: str = "medium") -> Dict[str, Any]:
        """
        Process a user message through the orchestration pipeline
        """
        try:
            # Get or create session
            session = self.session_manager.get_session(session_id)
            
            # Add user message to session
            session.append_message("user", user_input)
            
            # Determine if we need clarification
            needs_clarification = self.needs_clarification(session, user_input)
            
            if needs_clarification:
                # Generate clarification question
                clarification = await self._generate_clarification_question(session)
                session.append_message("system", f"Clarification request: {clarification}")
                
                return {
                    "status": "clarification_needed",
                    "message": clarification,
                    "suggestions": self._get_clarification_suggestions(),
                    "session_id": session.session_id
                }
            
            # Generate responses from all personas
            responses = await self.generate_persona_responses(session, response_length)
            
            return {
                "status": "success",
                "responses": responses,
                "session_id": session.session_id
            }
            
        except Exception as e:
            logger.error(f"Error in process_message: {str(e)}")
            return {
                "status": "error",
                "message": "I'm having technical difficulties. Please try again.",
                "error": str(e)
            }

    async def process_message_with_enhanced_context(self, user_input: str, session_id: str, response_length: str = "medium"):
        """
        Enhanced message processing with document awareness and better context management
        """
        try:
            # Get session
            session = self.session_manager.get_session(session_id)
            
            # Add user message to session
            session.append_message("user", user_input)
            
            # Detect document references in the query
            document_references = self._extract_document_references_from_query(user_input)
            
            # Get available documents for this session
            rag_manager = get_rag_manager()
            doc_stats = rag_manager.get_document_stats(session_id)
            available_documents = [doc["filename"] for doc in doc_stats.get("documents", [])]
            
            # Generate enhanced persona responses
            responses = await self.generate_persona_responses(session, response_length)
            
            return {
                "status": "success",
                "responses": responses,
                "document_references_detected": bool(document_references),
                "available_documents": available_documents,
                "session_id": session_id
            }
            
        except Exception as e:
            logger.error(f"Error in enhanced message processing: {str(e)}")
            return {
                "status": "error", 
                "message": "I'm having technical difficulties processing your request.",
                "suggestions": ["Please try rephrasing your question.", "Check if your documents uploaded successfully."]
            }

    def _extract_document_references_from_query(self, query: str) -> List[str]:
        """Extract document references from user query"""
        query_lower = query.lower()
        references = []
        
        # Common document reference patterns
        patterns = [
            r"(?:my|the|in)\s+([a-zA-Z_\-]+\.(?:pdf|docx|txt))",  # specific files
            r"(?:my|the)\s+(dissertation|thesis|proposal|chapter|manuscript)",  # document types
            r"(?:in|from)\s+(?:my\s+)?([a-zA-Z_\-\s]+(?:chapter|section))",  # sections
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, query_lower)
            references.extend(matches)
        
        return references[:3]  # Limit to first 3 references
    
    def needs_clarification(self, session: ConversationContext, user_input: str) -> bool:
        """
        Determine if the user input needs clarification.
        Patterns and keywords are driven by config.yaml → orchestrator section.
        """
        # TODO: This method should be refactored to be more generic instead of
        # relying on hard-coded regex and keywords.

        # If this is not the first message, probably don't need clarification
        user_messages = [msg for msg in session.messages if msg.get('role') == 'user']
        if len(user_messages) > 1:
            logger.info(f"Skipping clarification: session already has {len(user_messages)} user message(s)")
            return False

        # Check for vague patterns - FIXED to handle "I am" vs "I'm"
        vague_patterns = [
            r"^(help|advice|guidance|assistance)$",
            r"i'?m (stuck|lost|confused|not sure)",  # matches "I'm confused"
            r"i am (stuck|lost|confused|not sure)",  # matches "I am confused" 
            r"(what should i|how do i|where do i start)",
            r"i need (help|advice|guidance)",
            r"(any|some) (advice|suggestions|ideas)",
            r"don'?t know (what|how|where)",
            r"(stuck|struggling) with",
            r"unsure about"
        ]

        orch_cfg = get_settings().orchestrator
        user_lower = user_input.lower().strip()
        word_count = len(user_input.split())

        logger.info(f"Checking clarification for: {user_input} ({word_count} words)")

        has_specific_keywords = any(
            keyword in user_lower for keyword in orch_cfg.specific_keywords
        )
        if has_specific_keywords:
            logger.info("NO CLARIFICATION: input contains specific keywords")
            return False

        if word_count >= orch_cfg.min_words_without_keywords:
            logger.info(
                    f"NO CLARIFICATION: input has {word_count} words "
                    f"(>= {orch_cfg.min_words_without_keywords} threshold)")
            return False

        for pattern in vague_patterns:
            if re.search(pattern, user_lower):
                logger.info(f"CLARIFICATION TRIGGERED: pattern `{pattern}` matched `{user_input}`")
                return True

        logger.info("CLARIFICATION TRIGGERED: short input (%d words) without specific keywords", word_count)
        return True

    async def needs_clarification_improved(self, session: ConversationContext, user_input: str,
                                           llm_client: LLMClient = None) -> bool:
        """
        Use an LLM call to determine whether the user's input is too vague
        to route to the advisor panel.  Falls back to the legacy rule-based
        method if the LLM call fails.
        """
        user_messages = [msg for msg in session.messages if msg.get('role') == 'user']
        if len(user_messages) > 1:
            logger.info("Skipping clarification: session already has %d user message(s)", len(user_messages))
            return False

        app_cfg = get_settings().app
        orch_cfg = get_settings().orchestrator
        advisor_descriptions = ", ".join(
            f"{p.name} ({p.id})" for p in self.personas.values()
        )
        domain_keywords = ", ".join(orch_cfg.specific_keywords)
        # Campus lookups (events, places, courses) are concrete even when short.
        tool_domains = [
            DOMAIN_DESCRIPTIONS[d]
            for d in tools_by_domain(get_settings().tools.get_enabled_names())
            if d in DOMAIN_DESCRIPTIONS and d != "general"
        ]
        lookups = (
            f"The app can also look up: {'; '.join(tool_domains)}. A question about "
            "one of these (e.g. 'where is the library?', 'what's on tonight?') is clear enough.\n"
            if tool_domains else ""
        )

        system_prompt = (
            "You are a routing classifier for an AI advisory application.\n\n"
            f"Application: {app_cfg.title} — {app_cfg.subtitle}\n"
            f"Available advisors: {advisor_descriptions}\n"
            f"Domain-relevant topics: {domain_keywords}\n"
            f"{lookups}\n"
            "Your task: decide whether the user's FIRST message contains enough "
            "substance to send to the advisors, or whether it is too vague and "
            "requires a clarifying follow-up before the advisors can help.\n\n"
            "A message NEEDS CLARIFICATION when it:\n"
            "- Expresses confusion or uncertainty without a concrete topic\n"
            "- Is a single generic request like 'help' or 'advice'\n"
            "- Contains no identifiable subject the advisors could address\n\n"
            "A message is CLEAR ENOUGH when it:\n"
            "- Mentions a specific topic, question, or problem area\n"
            "- Provides enough context for at least one advisor to respond usefully\n"
            "- Even a short message is fine if the intent is unambiguous "
            "(e.g. 'explain transformers' is clear)\n"
            "- Messages mentioning domain-relevant topics are likely clear enough "
            "to route directly, even if brief\n\n"
            "Respond ONLY with valid JSON:\n"
            '{"needs_clarification": true or false, "reason": "one sentence explanation"}'
        )

        user_prompt = f'User message: "{user_input}"'

        raw = None

        try:
            # The user's orchestrator LLM, never a persona's — BrainForge
            # persona LLMs may not support the prompt format used here.
            llm = llm_client or self.llm_client
            raw = await llm.generate(
                system_prompt=system_prompt,
                context=[{"role": "user", "content": user_prompt}],
                temperature=0.0,
                max_tokens=128,
                response_mime_type="application/json",
            )

            parsed = json.loads(raw.strip())
            value = parsed.get("needs_clarification")
            if not isinstance(value, bool):
                raise TypeError(
                    f"needs_clarification must be a boolean, got {type(value).__name__}: {value!r}"
                )
            result = value
            reason = parsed.get("reason", "")

            logger.info(
                "LLM clarification classification: needs_clarification=%s, reason=%r, input=%r",
                result, reason, user_input,
            )
            return result

        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            logger.error("Failed to parse LLM classification response: %s (raw=%r)", exc, raw)
        except Exception as exc:
            logger.error("LLM classification call failed: %s", exc)

        # TODO: Evaluate if this fallback is still needed and remove if not.
        logger.warning("Falling back to rule-based clarification check")
        return self.needs_clarification(session, user_input)

    async def generate_contextual_clarification(self, user_input: str,
                                               llm_client: LLMClient = None) -> Dict[str, Any]:
        """
        Use the LLM to produce a clarification question and clickable
        suggestions that are tailored to what the user actually typed.
        Falls back to the static values in config.yaml if the LLM call fails.
        """
        orch_cfg = get_settings().orchestrator

        advisor_list = ", ".join(
            f"{p.name} ({p.id})" for p in self.personas.values()
        )

        system_prompt = (
            "You are a helpful routing assistant. The user's message is too "
            "vague to send to the advisors. Produce a short clarifying question "
            "and exactly 4 clickable suggestion buttons the user could press.\n\n"
            "Reply ONLY with valid JSON — no markdown, no extra text:\n"
            '{"question": "...", "suggestions": ["...", "...", "...", "..."]}\n\n'
            "Keep the question to one sentence. Each suggestion should be a "
            "complete sentence the user could send as their next message."
        )

        user_prompt = (
            f"User said: \"{user_input}\"\n"
            f"Available advisors: {advisor_list}\n\n"
            "Generate a clarifying question and 4 suggestion buttons that "
            "relate to what the user said and steer toward the advisors above."
        )

        try:
            effective_llm = llm_client or self.llm_client
            raw = await effective_llm.generate(
                system_prompt=system_prompt,
                context=[{"role": "user", "content": user_prompt}],
                temperature=0.4,
                max_tokens=1024,
                response_mime_type="application/json"
            )

            cleaned = raw.strip()
            cleaned = re.sub(r"```(?:json)?", "", cleaned).strip()

            json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if json_match:
                cleaned = json_match.group(0)

            parsed = json.loads(cleaned)
            question = parsed.get("question", "").strip()
            suggestions = parsed.get("suggestions", [])

            if question and isinstance(suggestions, list) and len(suggestions) >= 2:
                logger.info(f"LLM clarification generated for: {user_input}")
                return {"question": question, "suggestions": suggestions[:4]}

        except Exception as e:
            logger.error(f"LLM clarification failed, using config fallback: {e}")

        fallback_questions = orch_cfg.clarification_questions
        fallback_suggestions = orch_cfg.clarification_suggestions
        return {
            "question": fallback_questions[0],
            "suggestions": fallback_suggestions,
        }
    
    async def generate_persona_responses(self, session: ConversationContext,
                                        response_length: str = "medium",
                                        llm_clients: Dict[str, LLMClient] = None):
        """
        Generate responses from all personas with enhanced RAG integration.

        *llm_clients* maps persona IDs to the LLM client each should use.
        Personas not present in the dict fall back to their default client.
        """
        responses = []
        
        for persona_id, persona in self.personas.items():
            logger.info(f"Generating response for {persona_id} with enhanced RAG")
            
            # Generate persona response with enhanced RAG
            persona_llm = (llm_clients or {}).get(persona_id)
            response_data = await self.generate_single_persona_response(
                session, persona, response_length, llm_client=persona_llm,
            )
            
            # Add persona response to session context
            session.append_message(persona_id, response_data["response"])
            
            responses.append(response_data)
        
        return responses
    
    async def generate_single_persona_response(self, session, persona,
                                               response_length: str = "medium",
                                               llm_client: LLMClient = None):
        """
        Enhanced version - Generate response from a single persona with enhanced RAG integration.

        *llm_client* is forwarded to ``persona.respond()``; when ``None`` the
        persona uses its default (system-default) client.
        """
        try:
            # Get the user's latest message for document retrieval
            user_message = ""
            try:
                user_message = session.get_latest_user_message() or ""
            except AttributeError:
                # Fallback: manually find latest user message
                for msg in reversed(session.messages):
                    if msg.get('role') == 'user':
                        user_message = msg.get('content', '')
                        break
            
            # Retrieve relevant document context using enhanced RAG
            document_context = ""
            if user_message:
                document_context = await self._retrieve_relevant_documents(
                    user_input=user_message,
                    session_id=session.session_id,
                    persona_id=persona.id
                )
            
            # Build enhanced context for the LLM
            enhanced_context = await self._build_enhanced_context_for_persona(
                session, persona, user_message, document_context
            )
            
            # Generate response with enhanced context
            response = await persona.respond(enhanced_context, response_length, llm=llm_client)
            
            # Validate and improve response quality
            if not self._is_valid_response(response, persona.id):
                logger.warning(f"Invalid response from {persona.id}, using fallback")
                response = self._get_persona_fallback(persona.id)
            
            # Track document usage for debugging
            used_documents = bool(document_context and len(document_context.strip()) > 100)
            document_chunks_used = document_context.count("[Source:") if document_context else 0
            
            return {
                "persona_id": persona.id,
                "persona_name": persona.name,
                "response": response,
                "used_documents": used_documents,
                "document_chunks_used": document_chunks_used,
                "response_length": response_length,
                "context_quality": "high" if document_context else "conversation_only"
            }
            
        except Exception as e:
            logger.error(f"Error generating response for {persona.id}: {str(e)}")
            return {
                "persona_id": persona.id,
                "persona_name": persona.name,
                "response": f"I apologize, but I'm having technical difficulties. {self._get_persona_fallback(persona.id)}",
                "used_documents": False,
                "document_chunks_used": 0,
                "response_length": response_length,
                "context_quality": "error"
            }

    async def synthesize_aggregated_response(
        self,
        user_input: str,
        panel_results: List[Dict[str, Any]],
        llm_client: LLMClient = None,
        response_length: str = "medium",
    ) -> Optional[Dict[str, Any]]:
        """Merge multiple panel advisor responses into a single unified answer.

        Uses the orchestrator LLM (not a persona) to synthesize the strongest
        points from each advisor into one cohesive response addressed to the
        user.  Returns ``None`` when synthesis produces nothing usable so the
        caller can fall back to the panel responses.
        """
        if not panel_results:
            return None

        token_limits = {"short": 800, "medium": 1500, "long": 2400}
        max_tokens = token_limits.get(response_length, 700)

        perspectives = "\n\n".join(
            f"### {r['persona_name']} ({r['persona_id']})\n{r['response']}"
            for r in panel_results
        )

        structure_hint = STRUCTURE_HINTS.get(response_length, STRUCTURE_HINTS["medium"])

        system_prompt = (
            "You are a synthesis assistant. You will receive multiple expert "
            "advisor perspectives on a user's question. Your job is to merge "
            "them into a single, cohesive answer that integrates the strongest "
            "points from each.\n\n"
            "Guidelines:\n"
            "- Produce ONE unified answer addressed directly to the user.\n"
            "- Do NOT list or label the individual perspectives.\n"
            "- Resolve contradictions by noting the trade-off briefly.\n"
            "- Keep the tone warm, clear, and actionable.\n\n"
            f"{RESPONSE_FORMAT_V2}\n\n"
            f"{structure_hint}"
        )

        user_prompt = (
            f"The user asked:\n\"{user_input}\"\n\n"
            f"The following {len(panel_results)} advisors responded:\n\n"
            f"{perspectives}\n\n"
            "Synthesize these into a single best-answer response."
        )

        try:
            effective_llm = llm_client or self.llm_client
            raw = await effective_llm.generate(
                system_prompt=system_prompt,
                context=[{"role": "user", "content": user_prompt}],
                temperature=0.4,
                max_tokens=max_tokens,
            )

            stripped = raw.strip() if raw else ""
            if not stripped:
                logger.warning("Synthesis LLM returned empty response")
                return None
            content = tidy_markdown(stripped)

            return {
                "persona_id": "aggregated",
                "persona_name": "Orchestrator",
                "response": content,
                "is_aggregated": True,
                "source_personas": [r["persona_id"] for r in panel_results],
                "used_documents": any(r.get("used_documents") for r in panel_results),
                "document_chunks_used": sum(
                    r.get("document_chunks_used", 0) for r in panel_results
                ),
                "response_length": response_length,
                "context_quality": "synthesized",
            }

        except Exception as e:
            logger.error(f"Aggregated synthesis failed: {e}")
            return None

    async def _retrieve_relevant_documents(self, user_input: str, session_id: str, persona_id: str = "") -> str:
        """
        Enhanced document retrieval with document awareness and better attribution
        """
        try:
            # Add comprehensive logging to track session ID usage
            logger.info(f"Retrieving documents for session_id: {session_id}")
            logger.info(f"User input: {user_input[:100]}...")
            
            rag_manager = get_rag_manager()
            
            # Check what documents are available for this session with detailed logging
            doc_stats = rag_manager.get_document_stats(session_id)
            logger.info(f"Available documents for {session_id}: {doc_stats.get('total_documents', 0)} documents, {doc_stats.get('total_chunks', 0)} chunks")
            
            # Log document details for debugging
            if doc_stats.get('documents'):
                for doc in doc_stats['documents']:
                    logger.info(f"  - Document: {doc.get('filename', 'unknown')} ({doc.get('chunks', 0)} chunks)")
            
            # If no documents found and this looks like a chat session, log warning
            if doc_stats.get('total_documents', 0) == 0:
                if session_id.startswith('chat_'):
                    logger.warning(f"No documents found for chat session {session_id} - this may indicate session ID mismatch during upload")
                    
                    # Try alternative session ID formats for debugging
                    alternative_formats = [
                        session_id.replace('chat_', ''),  # Remove chat_ prefix
                        session_id,  # Keep as is
                    ]
                    
                    for alt_session_id in alternative_formats:
                        if alt_session_id != session_id:
                            alt_stats = rag_manager.get_document_stats(alt_session_id)
                            if alt_stats.get('total_documents', 0) > 0:
                                logger.warning(f"Found documents under alternative session ID {alt_session_id}: {alt_stats}")
                else:
                    logger.info(f"No documents found for new session {session_id} - this is normal for new chats")
                
                return ""  # No documents available
            
            # Extract document hints from user query
            document_hint = self._extract_document_hint_from_query(user_input)
            logger.info(f"Document hint extracted from query: {document_hint}")
            
            # Get persona-specific context for better retrieval
            persona_context = self._get_enhanced_persona_context_keywords(persona_id)
            
            # Search for relevant chunks with document awareness
            logger.info(f"Searching with persona context: {persona_context[:100]}...")
            relevant_chunks = rag_manager.search_documents_with_context(
                query=user_input,
                session_id=session_id,
                persona_context=persona_context,
                n_results=6,  # Increased for better context
                document_hint=document_hint
            )
            
            logger.info(f"Retrieved {len(relevant_chunks)} chunks for {persona_id}")
            
            # Log relevance scores for debugging
            if relevant_chunks:
                for i, chunk in enumerate(relevant_chunks):
                    relevance = chunk.get("relevance_score", 0)
                    doc_source = chunk.get("document_source", {})
                    filename = doc_source.get("filename", "unknown")
                    logger.info(f"  Chunk {i+1}: {filename} (relevance: {relevance:.3f})")
            
            if not relevant_chunks:
                logger.info(f"No relevant document chunks found for query: {user_input[:50]}...")
                return ""
            
            # Format retrieved content with enhanced attribution
            formatted_context = self._format_document_context_with_attribution(relevant_chunks, persona_id)
            
            # Log final context length
            logger.info(f"Final document context length: {len(formatted_context)} characters")
            
            return formatted_context
            
        except Exception as e:
            logger.error(f"Error retrieving documents for {persona_id} in session {session_id}: {str(e)}")
            logger.error(f"Error type: {type(e).__name__}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return ""

    def _extract_document_hint_from_query(self, query: str) -> Optional[str]:
        """
        Extract document name hints from user queries
        """
        query_lower = query.lower()
        
        # Common patterns for document references
        document_indicators = [
            r"(?:my|the|in|from)\s+([a-zA-Z_\-]+\.(?:pdf|docx|txt|doc))",  # specific files
            r"(?:my|the)\s+(dissertation|thesis|proposal|chapter|manuscript|paper)",  # document types
            r"(?:in|from)\s+(?:my\s+)?([a-zA-Z_\-\s]+(?:chapter|section|proposal))",  # sections
            r"(?:the|my)\s+([a-zA-Z_\-\s]+(?:document|file))",  # generic documents
        ]
        
        for pattern in document_indicators:
            matches = re.findall(pattern, query_lower)
            if matches:
                return matches[0].strip().replace(" ", "_")
        
        return None

    def _get_enhanced_persona_context_keywords(self, persona_id: str) -> str:
        """
        Enhanced persona-specific keywords for better document retrieval
        """
        enhanced_keywords = {
            "methodologist": "methodology research design experimental approach data collection sampling validity reliability statistical analysis quantitative qualitative mixed-methods procedures protocol IRB ethics",
            "theorist": "theory theoretical framework conceptual model literature review philosophy epistemology ontology paradigm abstract concepts hypothesis proposition postulate axiom",
            "pragmatist": "practical application implementation action steps next steps recommendation solution strategy timeline concrete advice roadmap execution deliverables milestones"
        }
        return enhanced_keywords.get(persona_id, "")

    def _format_document_context_with_attribution(self, chunks: List[Dict], persona_id: str) -> str:
        """
        Format document context with clear attribution and source information
        """
        if not chunks:
            return ""
        
        # Filter chunks by relevance (increased threshold for quality)
        high_quality_chunks = [
            chunk for chunk in chunks 
            if chunk.get("relevance_score", 0) > 0.4  # Increased from 0.3
        ]
        
        if not high_quality_chunks:
            # If no high-quality chunks, take top 2 anyway but with lower confidence
            high_quality_chunks = chunks[:2]
        
        formatted_sections = []
        
        # Group chunks by document for better organization
        documents = {}
        for chunk in high_quality_chunks:
            doc_source = chunk.get("document_source", {})
            filename = doc_source.get("filename", "unknown")
            
            if filename not in documents:
                documents[filename] = {
                    "title": doc_source.get("document_title", filename),
                    "chunks": []
                }
            documents[filename]["chunks"].append(chunk)
        
        # Format each document's content
        for filename, doc_data in documents.items():
            doc_title = doc_data["title"]
            doc_chunks = doc_data["chunks"]
            
            formatted_sections.append(f"=== FROM DOCUMENT: {doc_title} ===")
            
            for i, chunk in enumerate(doc_chunks):
                doc_source = chunk.get("document_source", {})
                section = doc_source.get("section", "unknown section")
                position = doc_source.get("chunk_position", "unknown position")
                relevance = chunk.get("relevance_score", 0)
                
                chunk_intro = f"[Source: {section}, Part {position}, Relevance: {relevance:.2f}]"
                formatted_sections.append(f"{chunk_intro}\n{chunk['text']}\n")
        
        # Add context summary
        total_docs = len(documents)
        total_chunks = len(high_quality_chunks)
        
        context_header = f"""
DOCUMENT CONTEXT FOR {persona_id.upper()} ANALYSIS:
Found {total_chunks} relevant passages from {total_docs} document(s).
Use this context to inform your response, and cite specific documents when referencing information.

"""
        
        formatted_context = context_header + "\n".join(formatted_sections)
        
        # Add instructions specific to persona
        persona_instructions = self._get_persona_document_instructions(persona_id)
        formatted_context += f"\n\nSPECIAL INSTRUCTIONS FOR {persona_id.upper()}:\n{persona_instructions}"
        
        return formatted_context

    def _get_persona_document_instructions(self, persona_id: str) -> str:
        """
        Get persona-specific instructions for handling document context
        """
        instructions = {
            "methodologist": """
When analyzing the document context:
- Focus on methodological rigor and research design elements
- Identify potential validity threats or methodological gaps
- Suggest specific improvements to research procedures
- Reference exact methodological frameworks mentioned in their documents
- Connect their approach to established research standards""",
            
            "theorist": """
When analyzing the document context:
- Examine theoretical positioning and conceptual clarity
- Identify theoretical gaps or inconsistencies
- Suggest theoretical frameworks that align with their work
- Evaluate the coherence between theory and research questions
- Reference specific theoretical concepts mentioned in their documents""",
            
            "pragmatist": """
When analyzing the document context:
- Extract actionable next steps from their current progress
- Identify immediate bottlenecks or decision points
- Prioritize tasks based on their timeline and constraints
- Translate theoretical concepts into practical implementation steps
- Reference specific deadlines or milestones mentioned in their documents"""
        }
        
        return instructions.get(persona_id, "Provide helpful guidance based on the document context.")

    async def _build_enhanced_context_for_persona(self, session, persona, user_message: str, document_context: str) -> List[Dict[str, str]]:
        """
        Build enhanced context that properly integrates document information with conversation history
        FIXED VERSION - Ensures document context is properly preserved for both providers
        """
        enhanced_context = []

        # Get recent conversation history (last 6 messages for efficiency)
        recent_messages = session.messages[-6:] if len(session.messages) > 6 else session.messages
        
        # Check if we actually have meaningful document content
        has_documents = bool(document_context and document_context.strip() and len(document_context.strip()) > 50)
        
        # Build the system message with proper document awareness
        if has_documents:
            # Get list of uploaded documents
            uploaded_docs = session.uploaded_files if hasattr(session, 'uploaded_files') else []
            doc_list = ", ".join(uploaded_docs) if uploaded_docs else "uploaded documents"
            
            system_message = f"""{persona.system_prompt}

    CURRENT SESSION CONTEXT:
    The student has uploaded the following documents: {doc_list}

    DOCUMENT CONTENT:
    {document_context}

    IMPORTANT: When the student refers to "my document," "my dissertation," "my proposal," etc., they are referring to one of their uploaded documents. Use the document context above to understand which specific document they mean and reference it by name in your response.

    Always cite your sources when referencing information from their documents using the format: "According to your [document_name]..." or "In your [section_name] from [document_name]..."
    """
            
            enhanced_context.append({
                "role": "system",
                "content": system_message
            })
        else:
            # NO DOCUMENTS - Explicitly tell persona not to reference documents
            system_message = f"""{persona.system_prompt}

    IMPORTANT: The student has NOT uploaded any documents yet. Do not reference any specific documents, files, or assume you have access to their research materials.

    If they mention "my document," "my dissertation," "my proposal," etc., you should:
    1. Acknowledge that you don't have access to their specific documents
    2. Ask them to upload the relevant files for more targeted advice
    3. Provide general guidance based on best practices in your area of expertise

    Do NOT make up document names or pretend to have access to files that don't exist."""
            
            enhanced_context.append({
                "role": "system", 
                "content": system_message
            })

        # Add recent conversation messages (excluding system messages to avoid duplication)
        for message in recent_messages:
            if message.get('role') != 'system':
                enhanced_context.append({
                    "role": message['role'],
                    "content": message['content']
                })

        return enhanced_context
    
    def _is_valid_response(self, response: str, persona_id: str) -> bool:
        """Validate response quality"""
        if len(response) < 10 or len(response) > 20000:
            return False
        
        # Check for AI confusion indicators
        confusion_indicators = [
            f"Thank you, Dr. {persona_id.title()}",
            "Assistant:",
            f"Dr. {persona_id.title()} Advisor:",
            "excellent discussion, Assistant"
        ]
        
        return not any(indicator in response for indicator in confusion_indicators)
    
    def _get_persona_fallback(self, persona_id: str) -> str:
        """Get persona-specific fallback responses"""
        fallbacks = {
            "methodologist": "I'd be happy to help with your research methodology. What specific methodological approach are you considering?",
            "theorist": "I'd like to explore the theoretical foundation of your work. What conceptual framework guides your research?",
            "pragmatist": "Let's take a practical approach. What's the most pressing decision you need to make about your research right now?"
        }
        return fallbacks.get(persona_id, "I'd be happy to help. Could you provide more specific details about your question?")
    
    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a session"""
        session = self.session_manager.get_session(session_id)
        if session:
            return {
                "session_id": session.session_id,
                "message_count": len(session.messages),
                "uploaded_files": session.uploaded_files,
                "created_at": session.created_at.isoformat(),
                "last_accessed": session.last_accessed.isoformat(),
                "context_summary": self.context_manager.get_context_summary(session.messages)
            }
        return None
    
    def reset_session(self, session_id: str) -> bool:
        """Reset a session (clear messages but keep metadata)"""
        session = self.session_manager.get_session(session_id)
        if session:
            session.clear_messages()
            return True
        return False
    
    def delete_session(self, session_id: str) -> bool:
        """Delete a session completely"""
        return self.session_manager.delete_session(session_id)
    
    # Legacy method for backward compatibility
    def _get_persona_context_keywords(self, persona_id: str) -> str:
        """
        Legacy method - use _get_enhanced_persona_context_keywords instead
        """
        return self._get_enhanced_persona_context_keywords(persona_id)
    
    async def chat_with_persona(self, user_input: str, persona_id: str,
                               session_id: str, response_length: str = "medium",
                               llm_client: LLMClient = None) -> Dict[str, Any]:
        """
        Chat with a specific persona directly - FIXED for consistent document access.

        *llm_client* is forwarded to the persona's response generation.
        """
        try:
            persona = self.get_persona(persona_id)
            if not persona:
                return {
                    "error": f"Persona {persona_id} not found",
                    "available_personas": list(self.personas.keys()),
                    "persona_id": persona_id,
                    "persona_name": "Unknown"
                }
            
            # Ensure session exists and log session info
            session = self.session_manager.get_session(session_id)
            logger.info(f"Chat with {persona_id} using session {session_id}")
            
            # Add user message to session
            session.append_message("user", user_input)
            
            # Use the same session_id for document retrieval
            logger.info(f"Generating response for {persona_id} with session {session_id}")
            
            # Generate response from single persona using consistent session ID
            response_data = await self.generate_single_persona_response(
                session, persona, response_length, llm_client=llm_client,
            )
            
            # Add response to session
            session.append_message(persona_id, response_data["response"])
            
            # Ensure response data includes all necessary fields
            return {
                "persona_id": persona_id,
                "persona_name": persona.name,
                "response": response_data.get("response", "I'm having trouble generating a response."),
                "used_documents": response_data.get("used_documents", False),
                "document_chunks_used": response_data.get("document_chunks_used", 0),
                "response_length": response_length,
                "context_quality": response_data.get("context_quality", "unknown"),
                "session_id": session_id,
                "type": "single_persona_response",
                "persona": {
                    "persona_id": persona_id,
                    "persona_name": persona.name,
                    "response": response_data.get("response", "I'm having trouble generating a response."),
                    "used_documents": response_data.get("used_documents", False),
                    "document_chunks_used": response_data.get("document_chunks_used", 0)
                }
            }
            
        except Exception as e:
            logger.error(f"Error in chat_with_persona for {persona_id}: {str(e)}")
            logger.error(f"Session ID: {session_id}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            
            return {
                "error": f"Error processing request: {str(e)}",
                "persona_id": persona_id,
                "persona_name": self.personas.get(persona_id, {}).name if persona_id in self.personas else "Unknown",
                "response": "I encountered an error while processing your request. Please try again.",
                "used_documents": False,
                "document_chunks_used": 0,
                "response_length": response_length,
                "context_quality": "error",
                "session_id": session_id,
                "type": "error"
            }
        

    async def get_top_personas(self, session_id: str, k: int = 3,
                              allowed_ids: Optional[List[str]] = None,
                              llm_client: LLMClient = None) -> List[str]:
        """
        Use the LLM to rank personas based on current session context.
        Falls back to default persona order if LLM fails or returns invalid data.

        When *allowed_ids* is provided, only those personas are considered
        (for system-level and user-level filtering).
        """
        pool_ids = allowed_ids if allowed_ids is not None else list(self.personas.keys())
        pool = {pid: self.personas[pid] for pid in pool_ids if pid in self.personas}

        try:
            session = self.session_manager.get_session(session_id)

            if not pool:
                logger.warning("No personas available after filtering.")
                return []

            effective_llm = llm_client or self.llm_client

            # Use recent conversation context (last 5 messages)
            recent_context = "\n".join(
                msg['content'] for msg in session.get_recent_messages(5)
            )

            # Format available persona descriptions
            persona_descriptions = "\n".join([
                f"- ID: {p.id}\n  Name: {p.name}\n  Prompt: {p.system_prompt.strip()}"
                for p in pool.values()
            ])

            # Ensure k does not exceed the number of available personas
            k = min(k, len(pool))

            app_title = get_settings().app.title

            prompt = f"""
                        The user is seeking advice from {app_title}. Based on the conversation below, choose the top {k} most relevant advisors.

                        Respond ONLY with a JSON list of exactly {k} advisor IDs in order of relevance.
                        Example response: ["methodist", "pragmatist", "theorist"]

                        --- Conversation ---
                        {recent_context}

                        --- Available Advisors ---
                        {persona_descriptions}
                      """.strip()

            llm_response = await effective_llm.generate(
                system_prompt=f"You are an assistant that selects the best advisors for a user of {app_title}.",
                context=[{"role": "user", "content": prompt}],
                temperature=0.4,
                max_tokens=150,
                response_mime_type="application/json"
            )

            # Step 1: Try direct JSON load
            try:
                top_ids = json.loads(llm_response.strip())
            except json.JSONDecodeError:
                # Step 2: Fallback: try extracting list of quoted strings
                top_ids = re.findall(r'"(.*?)"', llm_response)
                logger.warning(f"Fallback JSON extraction used: {top_ids}")

            # Handle models that wrap the list in an object, possibly beside
            # other fields (e.g. {"count": 3, "advisor_ids": [...]})
            if isinstance(top_ids, dict):
                top_ids = next((v for v in top_ids.values() if isinstance(v, list)), [])
            if not isinstance(top_ids, list):
                top_ids = []

            # Step 3: Filter valid persona IDs against the allowed pool
            valid_ids = [pid for pid in top_ids if isinstance(pid, str) and pid in pool]

            if len(valid_ids) < k:
                logger.warning(f"LLM returned insufficient or invalid IDs. Got: {valid_ids}")
                return list(pool.keys())[:k]

            return valid_ids[:k]

        except Exception as e:
            logger.error(f"Error selecting top personas: {e}")
            return list(pool.keys())[:k]
