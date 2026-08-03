"""
rate_my_professor tool — live query against RateMyProfessors' GraphQL API.

Exposes TOOL_DEFINITION (OpenAI tool format) and an execute() coroutine
that the tool-calling loop dispatches to.

This tool is locked to a single school per deployment. A ``school_id`` is
REQUIRED in the tool config (see the ``rate_my_professor`` section of each
``<school>_config.yaml``); the app refuses to start if the tool is enabled
without one. Results are filtered to that school only — no cross-school
fallback. Use ``scripts/rmp_school_lookup.py`` to find the ID for a school.
"""

import logging
import re
from typing import Any, Dict, List
import httpx
from app.tools import BROWSER_UA
from app.config import get_settings

logger = logging.getLogger(__name__)

RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"
RMP_LANDING_URL = "https://www.ratemyprofessors.com/"
RMP_SEARCH_URL = "https://www.ratemyprofessors.com/search/professors"


TEACHER_SEARCH_QUERY = """
query TeacherSearchPaginationQuery(
  $count: Int!
  $cursor: String
  $query: TeacherSearchQuery!
) {
  search: newSearch {
    teachers(query: $query, first: $count, after: $cursor) {
      didFallback
      edges {
        cursor
        node {
          id
          legacyId
          firstName
          lastName
          department
          school { id name }
          avgRating
          avgDifficulty
          wouldTakeAgainPercent
          numRatings
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
"""

def _build_description() -> str:
    """Build the LLM-facing description, tying the tool to the configured
    institution so the model knows ratings are for this school only."""
    institution = ""
    try:
        institution = (get_settings().app.institution or "").strip()
    except Exception:
        institution = ""
    where = f"a professor at {institution}" if institution else "a professor at the configured school"
    return (
        f"Look up RateMyProfessors ratings for {where}. "
        "Returns rating, difficulty, percentage of students who would "
        "take the professor again, and number of ratings."
    )


TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "rate_my_professor",
        "description": _build_description(),
        "parameters": {
            "type": "object",
            "properties": {
                "professor_name": {
                    "type": "string",
                    "description": (
                        "Full or partial name of the professor to search for, "
                        "e.g. 'Hoenigman', 'Jane Smith'."
                    ),
                },
            },
            "required": ["professor_name"],
        },
    },
}


def _node_to_professor(node: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a GraphQL teacher node to a lightweight result dict."""
    return {
        "name": f"{node.get('firstName', '')} {node.get('lastName', '')}".strip(),
        "department": node.get("department", ""),
        "rating": node.get("avgRating", 0),
        "difficulty": node.get("avgDifficulty", 0),
        "would_take_again_pct": node.get("wouldTakeAgainPercent", -1),
        "num_ratings": node.get("numRatings", 0),
        "rmp_id": node.get("id", ""),
    }


async def _extract_auth_token(client: httpx.AsyncClient) -> str:
    """Fetch the RMP landing page and extract the auth token from the JS bundle.

    Falls back to the well-known Basic test:test token.
    """
    try:
        resp = await client.get(
            RMP_LANDING_URL, headers={"User-Agent": BROWSER_UA},
        )
        m = re.search(
            r'"Authorization"\s*:\s*"(Basic\s+[A-Za-z0-9+/=]+)"', resp.text,
        )
        if m:
            logger.info("Extracted RMP auth token from page JS")
            return m.group(1)
    except Exception as exc:
        logger.debug("RMP auth token extraction failed: %s", exc)

    return "Basic dGVzdDp0ZXN0"


async def execute(
    *,
    name: str = "",
    professor_name: str,
) -> Dict[str, Any]:
    """Query RateMyProfessors for a professor at the configured school by name.

    The 'name' kwarg is passed by the dispatch loop and ignored here.
    Results are strictly limited to the configured ``school_id`` (no
    cross-school fallback).
    Returns {"professors": [...], "query": {...}}.
    """
    tool_cfg = get_settings().tools.get_tool_config("rate_my_professor")
    school_id = tool_cfg.get("school_id")
    if not school_id:
        # The config validator should prevent this; kept as defense-in-depth.
        logger.error("No school_id configured for rate_my_professor")
        return {
            "professors": [],
            "error": "No school_id configured for rate_my_professor",
            "query": {"professor_name": professor_name},
        }

    professors: List[Dict[str, Any]] = []

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            auth_token = await _extract_auth_token(client)

            headers = {
                "User-Agent": BROWSER_UA,
                "Authorization": auth_token,
                "Content-Type": "application/json",
                "Referer": f"{RMP_SEARCH_URL}?q={professor_name}",
                "Origin": "https://www.ratemyprofessors.com",
            }

            variables = {
                "count": 20,
                "cursor": "",
                "query": {
                    "text": professor_name,
                    "schoolID": school_id,
                    "fallback": False,
                    "departmentID": None,
                },
            }

            resp = await client.post(
                RMP_GRAPHQL_URL,
                json={"query": TEACHER_SEARCH_QUERY, "variables": variables},
                headers=headers,
            )

            if resp.status_code == 403:
                logger.warning("RMP GraphQL returned 403 — auth may be invalid")
                return {
                    "professors": [],
                    "error": "RateMyProfessors authentication failed",
                    "query": {"professor_name": professor_name},
                }

            resp.raise_for_status()
            data = resp.json()

            teachers = (
                data.get("data", {})
                .get("search", {})
                .get("teachers", {})
            )

            for edge in teachers.get("edges", []):
                node = edge.get("node", {})
                if not node:
                    continue
                # Strict: only keep professors from the configured school.
                node_school_id = (node.get("school") or {}).get("id")
                if node_school_id and node_school_id != school_id:
                    continue
                professors.append(_node_to_professor(node))

    except Exception as exc:
        logger.error("RMP API error for %s: %s", professor_name, exc)
        return {
            "professors": [],
            "error": str(exc),
            "query": {"professor_name": professor_name},
        }

    return {
        "professors": professors,
        "query": {"professor_name": professor_name},
    }
