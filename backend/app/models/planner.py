"""Request bodies for the semester planner API (``/api/planner``).

Ops stay plain dicts here; ``app.planner.edits`` validates their shape and
returns a typed error, so the client sees one error format for every op.
"""

from typing import Any, Dict, List

from pydantic import BaseModel, Field

MAX_OPS = 20


class EditRequest(BaseModel):
    ops: List[Dict[str, Any]] = Field(min_length=1, max_length=MAX_OPS)
    expected_revision: int = Field(ge=0)
    idempotency_key: str = Field(min_length=1, max_length=100)


class ProposalRequest(BaseModel):
    ops: List[Dict[str, Any]] = Field(min_length=1, max_length=MAX_OPS)
    expected_revision: int = Field(ge=0)


class UndoRequest(BaseModel):
    expected_revision: int = Field(ge=0)
