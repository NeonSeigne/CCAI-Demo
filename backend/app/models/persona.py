import re

from app.llm.llm_client import LLMClient
from typing import List, Dict

SENTINEL = "</END>"

# Shared formatting contract applied to all personas.
RESPONSE_FORMAT_V2 = (
    "Write your answer in GitHub-Flavored Markdown. Use whatever structure best fits the "
    "question - there is no required template.\n"
    "\n"
    "- Answer a simple question with a sentence or two of plain prose. Do not add headings, "
    "bullets, or sections that the question does not call for.\n"
    "- Reach for headings ('###'), bold, nested lists, tables, fenced code blocks, and "
    "blockquotes when the content genuinely benefits from them.\n"
    "- A short takeaway or a suggested next step is welcome when it is actually useful, but it "
    "is never required. Never label your reasoning as a separate section.\n"
    "- Express any math, statistics, or formulas as LaTeX: $...$ inline and $$...$$ on its own "
    "lines for display equations.\n"
    "- Use '-' for bullets (never unicode bullets), and keep list text on the same line as its "
    "marker.\n"
    "\n"
    f"Finish your response with the sentinel token {SENTINEL}."
)

# Soft length guidance per response_length
STRUCTURE_HINTS = {
    "short": "Keep it brief: answer in a few sentences unless the question genuinely needs more.",
    "medium": "Be thorough but economical - cover what matters without padding.",
    "long": "Take the space you need to explain fully, including examples or derivations where they help.",
}

# Token ceilings, sized to leave room for tables, code, and worked math.
MAX_TOKENS_MAP = {
    "short": 600,
    "medium": 1000,
    "long": 1800,
}

def _cut_at_sentinel(text: str) -> str:
    if not text:
        return ""
    idx = text.find(SENTINEL)
    return text[:idx] if idx != -1 else text

def _normalize_eols(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")

def _rstrip_lines(text: str) -> str:
    return "\n".join(line.rstrip() for line in text.split("\n"))

_FENCE_RE = re.compile(r"^\s*(```|~~~)")

def _convert_unicode_bullets(lines: List[str]) -> List[str]:
    out = []
    in_fence = False
    for l in lines:
        if _FENCE_RE.match(l):
            in_fence = not in_fence
            out.append(l)
            continue
        out.append(l if in_fence else re.sub(r"^\s*[•●▪◦]\s+", "- ", l))
    return out

def _merge_orphan_numbered_items(lines: List[str]) -> List[str]:
    out = []
    i = 0
    in_fence = False
    while i < len(lines):
        cur = lines[i]
        if _FENCE_RE.match(cur):
            in_fence = not in_fence
            out.append(cur)
            i += 1
            continue
        if not in_fence:
            m = re.match(r"^\s*(\d+)\.\s*$", cur)
            if m:
                # find next non-empty line and merge
                j = i + 1
                while j < len(lines) and lines[j].strip() == "":
                    j += 1
                if j < len(lines) and not _FENCE_RE.match(lines[j]):
                    out.append(f"{m.group(1)}. {lines[j].strip()}")
                    i = j + 1
                    continue
        out.append(cur)
        i += 1
    return out

def _collapse_blank_runs(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text).strip()

def tidy_markdown(text: str) -> str:
    """Light cleanup of model output; never reshapes or truncates the answer."""
    t = _rstrip_lines(_normalize_eols(_cut_at_sentinel(text or "")))
    lines = _merge_orphan_numbered_items(_convert_unicode_bullets(t.split("\n")))
    return _collapse_blank_runs("\n".join(lines))

class Persona:
    def __init__(self, id: str, name: str, system_prompt: str, llm: LLMClient, temperature: int = 5):
        self.id = id
        self.name = name
        self.system_prompt = system_prompt
        self.llm = llm
        self.temperature = temperature

    async def respond(self, context: List[Dict], response_length: str = "medium",
                      llm: LLMClient = None) -> str:
        """Generate a well-formed Markdown response suitable for the UI.

        *llm* overrides the default client for this call (used for per-user
        backend selection).  Falls back to ``self.llm`` when not provided.
        """
        effective_llm = llm or self.llm
        max_tokens = MAX_TOKENS_MAP.get(response_length, 1000)
        structure_hint = STRUCTURE_HINTS.get(response_length, STRUCTURE_HINTS["medium"])
        temp_scaled = round(self.temperature / 10, 2)

        full_prompt = (
            f"{self.system_prompt}\n\n"
            f"{RESPONSE_FORMAT_V2}\n\n"
            f"{structure_hint}"
        )

        raw_text = await effective_llm.generate(
            system_prompt=full_prompt,
            context=context,
            temperature=temp_scaled,
            max_tokens=max_tokens,
        )

        return tidy_markdown(raw_text)


"""from app.llm.llm_client import LLMClient

class Persona:
    def __init__(self, id, name, system_prompt, llm, temperature=5):
        self.id = id
        self.name = name
        self.system_prompt = system_prompt
        self.llm = llm
        self.temperature = temperature
    
    async def respond(self, context: list[dict], response_length: str = "medium") -> str:
        max_tokens_map = {
            "short": 300,
            "medium": 500,
            "long": 800
        }

        response_style_map = {
            "short": "Respond in 20-30 words.",
            "medium": "Respond in 40-50 words.",
            "long": "Respond in 50-60 words."
        }

        max_tokens = max_tokens_map.get(response_length, 500)
        response_instruction = response_style_map.get(response_length, "medium")
        temp_scaled = round(self.temperature / 10, 2)

        full_prompt = f"{self.system_prompt}\n\n{response_instruction}"

        return await self.llm.generate(
            system_prompt=full_prompt,
            context=context,
            temperature=temp_scaled,
            max_tokens=max_tokens
        )
"""
