"""Brief for my advisor (panel-answers phase 6).

Built from a saved chat: the student's question, the panel's summary, where
the advisors differed and the plan for the plan's term. The plan is read from
the planner store, never from the model. Only the questions for a human
advisor come from a model call, grounded in the chat.

Shape::

    {
      "question": "Should I take ECON 3720 next spring?",
      "summary": "...",                         # the latest main answer
      "differences": [{"topic": "...", "positions": [
          {"persona_id": "...", "name": "Career Coach", "stance": "..."}]}],
      "plan": {"term": "Spring 2027",
               "courses": [{"code": "ECON 3720", "title": "...", "credits": "3"}],
               "total_credits": "15"} | null,
      "questions": ["...", ...],
    }

Credits are display strings: "3", or "1–4" when a course's credits vary;
null when the planner doesn't know them.
"""

import logging
from typing import Any, Dict, List, Optional

from app.core.improved_orchestrator import _json_object
from app.llm.llm_client import is_llm_error

logger = logging.getLogger(__name__)

MAX_QUESTIONS = 6
MAX_QUESTION_CHARS = 240


class EmptyChat(Exception):
    """The chat has no question with an answer yet."""


def is_main_answer(message: Dict[str, Any]) -> bool:
    """The exchange's main answer: the merged reply or a data answer."""
    return message.get("type") == "advisor" and (
        bool(message.get("is_aggregated")) or message.get("persona_id") == "orchestrator"
    )


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def latest_exchange(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """``{question, answer}`` for the latest question with an answer.

    The answer is the latest main answer (or, in an old chat without one, the
    latest advisor reply); the question is the user message in its response
    group, else the last user message before it. Raises ``EmptyChat``.
    """
    messages = [m for m in messages or [] if isinstance(m, dict)]
    answers = [i for i, m in enumerate(messages) if is_main_answer(m) and _text(m.get("content"))]
    if not answers:
        answers = [i for i, m in enumerate(messages) if m.get("type") == "advisor" and _text(m.get("content"))]
    if not answers:
        raise EmptyChat()
    at = answers[-1]
    answer = messages[at]
    group = answer.get("response_group_id")
    question = next(
        (m for m in messages if group and m.get("type") == "user" and m.get("response_group_id") == group),
        None,
    ) or next((m for m in reversed(messages[:at]) if m.get("type") == "user"), None)
    if question is None or not _text(question.get("content")):
        raise EmptyChat()
    return {"question": question, "answer": answer}


def named_differences(answer: Dict[str, Any], messages: List[Dict[str, Any]], names: Dict[str, str]) -> List[Dict[str, Any]]:
    """The answer's saved ``differences``, each position with its advisor's name."""
    saved = {m.get("persona_id"): m.get("advisorName") for m in messages if m.get("persona_id")}
    out = []
    for item in answer.get("differences") or []:
        if not isinstance(item, dict) or not _text(item.get("topic")):
            continue
        positions = [
            {
                "persona_id": p["persona_id"],
                "name": names.get(p["persona_id"]) or saved.get(p["persona_id"]) or p["persona_id"],
                "stance": _text(p.get("stance")),
            }
            for p in item.get("positions") or []
            if isinstance(p, dict) and p.get("persona_id") and _text(p.get("stance"))
        ]
        if positions:
            out.append({"topic": _text(item["topic"]), "positions": positions})
    return out


def _number(value: Any) -> str:
    number = float(value)
    return str(int(number)) if number.is_integer() else f"{number:g}"


def credits_label(low: Any, high: Any = None) -> Optional[str]:
    """"3", "1–4", or None when unknown."""
    if high is None:
        high = low
    try:
        low_text, high_text = _number(low), _number(high)
    except (TypeError, ValueError):
        return None
    return low_text if low_text == high_text else f"{low_text}–{high_text}"


async def term_plan(user_id: str, school: Optional[str], term: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """The plan for the plan's term (or *term*, a known planner term), from
    the planner store and its checker: ``{term, courses: [{code, title,
    credits}], total_credits}``. None when the student has no plan (nothing
    is created) or the planner can't be read."""
    if not school or not user_id:
        return None
    from app.core.database import get_database
    from app.planner import service, store

    try:
        plan = await store.load(get_database(), str(user_id), school)
        report = await service.report_for(plan, school, term)
    except store.Refused:
        return None
    except Exception as exc:  # noqa: BLE001 — the brief goes out without the plan
        logger.warning("Brief: plan unavailable (%r)", exc)
        return None
    courses = []
    for row in report.get("courses") or []:
        credits = row.get("credits")
        courses.append({
            "code": row.get("id"),
            "title": row.get("title") or "",
            "credits": credits_label(*credits) if isinstance(credits, (list, tuple)) and len(credits) == 2 else None,
        })
    total = report.get("credits") or {}
    return {
        "term": report.get("term") or plan.get("term"),
        "courses": courses,
        "total_credits": credits_label(total.get("min"), total.get("max")) if courses else None,
    }


def chat_transcript(messages: List[Dict[str, Any]], limit: int = 12) -> str:
    """The chat's recent questions and main answers as plain text."""
    turns = []
    for m in messages:
        if m.get("type") == "user" and _text(m.get("content")):
            turns.append({"role": "user", "content": _text(m["content"])})
        elif is_main_answer(m) and _text(m.get("content")):
            turns.append({"role": "assistant", "content": _text(m["content"])})
    turns = turns[-limit:]
    return "\n\n".join(
        ("Student: " if t["role"] == "user" else "App: ") + t["content"] for t in turns
    )


QUESTIONS_PROMPT = (
    "You help a student get ready to meet their human academic advisor. From "
    "the chat below, write 3 to 5 short questions the student should ask that "
    "advisor: things the chat left open, things only an advisor can confirm, "
    "or choices where the advisors in the chat disagreed. Each question is one "
    "sentence in the student's voice. Use only what the chat says: never add "
    "numbers, prices, dates, requirements or rules the chat didn't contain. "
    'Reply with JSON only, no code fences: {"questions": ["...", "..."]}'
)


def parse_questions(raw: Any) -> List[str]:
    """The questions in a model reply: the JSON list, else one per line."""
    if not isinstance(raw, str) or not raw.strip() or is_llm_error(raw):
        return []
    parsed = _json_object(raw)
    items: List[Any]
    if parsed is not None:
        items = parsed.get("questions") if isinstance(parsed.get("questions"), list) else []
    else:
        items = [line.lstrip("-*•0123456789.) ").strip() for line in raw.splitlines()]
        items = [line for line in items if line.endswith("?")]
    out: List[str] = []
    for item in items:
        text = " ".join(item.split()) if isinstance(item, str) else ""
        if text and len(text) <= MAX_QUESTION_CHARS and text not in out:
            out.append(text)
    return out[:MAX_QUESTIONS]


async def advisor_questions(
    question: str,
    summary: str,
    differences: List[Dict[str, Any]],
    transcript: str,
    llm_client: Any,
) -> List[str]:
    """Questions for a human advisor, from one model call over the chat. The
    request is one user message, so it ends on the user's turn. A failed call
    gives no questions."""
    if llm_client is None:
        return []
    parts = [f"The chat:\n{transcript}"]
    if differences:
        lines = [
            f"- {d['topic']}: " + "; ".join(f"{p['name']}: {p['stance']}" for p in d["positions"])
            for d in differences
        ]
        parts.append("Where the advisors differed:\n" + "\n".join(lines))
    parts.append(f"The student's latest question:\n{question}\n\nThe app's answer:\n{summary}")
    try:
        raw = await llm_client.generate(
            system_prompt=QUESTIONS_PROMPT,
            context=[{"role": "user", "content": "\n\n".join(parts)}],
            temperature=0.2,
            max_tokens=400,
            response_mime_type="application/json",
        )
    except Exception as exc:  # noqa: BLE001 — the brief goes out without questions
        logger.warning("Brief questions call failed (%r)", exc)
        return []
    return parse_questions(raw)


async def build_brief(
    messages: List[Dict[str, Any]],
    *,
    user_id: str,
    school: Optional[str],
    names: Dict[str, str],
    llm_client: Any,
) -> Dict[str, Any]:
    """The brief for a saved chat (shape in the module docstring)."""
    exchange = latest_exchange(messages)
    question = _text(exchange["question"].get("content"))
    answer = exchange["answer"]
    summary = _text(answer.get("compact_markdown")) or _text(answer.get("content"))
    differences = named_differences(answer, messages, names)
    plan = await term_plan(user_id, school)
    questions = await advisor_questions(
        question, summary, differences, chat_transcript(messages), llm_client,
    )
    return {
        "question": question,
        "summary": summary,
        "differences": differences,
        "plan": plan,
        "questions": questions,
    }


# ---------------------------------------------------------------------------
# Text and PDF
# ---------------------------------------------------------------------------

TITLE = "Brief for my advisor"


def plan_title(plan: Optional[Dict[str, Any]]) -> str:
    term = (plan or {}).get("term")
    return f"My plan for {term}" if term else "My plan"


def _course_line(course: Dict[str, Any]) -> str:
    line = " ".join(filter(None, [course.get("code"), course.get("title")]))
    return f"{line}, {course['credits']} credits" if course.get("credits") else line


def brief_sections(brief: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The brief as titled sections: ``{title, text}`` or ``{title, items}``.
    Empty sections are left out."""
    sections: List[Dict[str, Any]] = []
    if _text(brief.get("question")):
        sections.append({"title": "My question", "text": _text(brief["question"])})
    if _text(brief.get("summary")):
        sections.append({"title": "What the panel said", "text": _text(brief["summary"])})
    differences = []
    for d in brief.get("differences") or []:
        positions = "; ".join(
            f"{p.get('name') or p.get('persona_id')}: {p.get('stance')}" for p in d.get("positions") or []
        )
        differences.append(f"{d.get('topic')}: {positions}" if positions else str(d.get("topic")))
    if differences:
        sections.append({"title": "Where they differed", "items": differences})
    plan = brief.get("plan") or {}
    if plan.get("courses"):
        items = [_course_line(c) for c in plan["courses"]]
        if plan.get("total_credits"):
            items.append(f"Total: {plan['total_credits']} credits")
        sections.append({"title": plan_title(plan), "items": items})
    questions = [_text(q) for q in brief.get("questions") or [] if _text(q)]
    if questions:
        sections.append({"title": "Questions for you", "items": questions})
    return sections


def brief_text(brief: Dict[str, Any]) -> str:
    """The brief as plain text (what Copy puts on the clipboard)."""
    blocks = [TITLE]
    for section in brief_sections(brief):
        body = section.get("text") or "\n".join(f"- {item}" for item in section["items"])
        blocks.append(f"{section['title']}\n{body}")
    return "\n\n".join(blocks)


def brief_pdf_blocks(brief: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Blocks for ``file_export.generate_pdf_file_from_blocks``, text escaped
    for its markup."""
    from xml.sax.saxutils import escape

    blocks: List[Dict[str, Any]] = [{"type": "heading", "text": TITLE}]
    for section in brief_sections(brief):
        blocks.append({"type": "paragraph", "text": f"<b>{escape(section['title'])}</b>"})
        if section.get("text"):
            for paragraph in section["text"].split("\n\n"):
                if paragraph.strip():
                    blocks.append({"type": "paragraph", "text": escape(paragraph.strip()).replace("\n", "<br/>")})
        else:
            blocks.append({"type": "list", "items": [escape(item) for item in section["items"]]})
    return blocks
