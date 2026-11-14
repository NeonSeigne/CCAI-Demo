"""Brief for my advisor (panel-answers phase 6): ``/api/chat-sessions/{id}/brief``.

Owner-scoped like the other chat-session routes: a chat that isn't the
caller's is a 404. Shapes in ``app/core/brief.py``.
"""

import logging
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core import brief as briefs
from app.core.auth import get_current_active_user
from app.core.database import get_database
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()

EMPTY_CHAT = "This chat has no question with an answer yet"


async def _own_session(session_id: str, user: User) -> Dict[str, Any]:
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    session = await get_database().chat_sessions.find_one(
        {"_id": oid, "user_id": user.id, "is_active": True}
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    return session


def _advisor_names() -> Dict[str, str]:
    from app.core.bootstrap import chat_orchestrator

    names = {}
    for pid in chat_orchestrator.list_personas():
        persona = chat_orchestrator.get_persona(pid)
        if persona is not None and getattr(persona, "name", None):
            names[pid] = persona.name
    return names


def _questions_llm(user: User) -> Any:
    from app.api.routes.chat import resolve_llm_clients
    from app.core.bootstrap import chat_orchestrator

    return resolve_llm_clients(user)["orchestrator"] or chat_orchestrator.llm_client


@router.post("/chat-sessions/{session_id}/brief")
async def build_brief(session_id: str, current_user: User = Depends(get_current_active_user)):
    """The brief for one of the caller's chats. 400 when the chat has no
    question with an answer yet."""
    from app.config import get_settings

    session = await _own_session(session_id, current_user)
    try:
        return await briefs.build_brief(
            session.get("messages") or [],
            user_id=str(current_user.id),
            school=get_settings().school.slug,
            names=_advisor_names(),
            llm_client=_questions_llm(current_user),
        )
    except briefs.EmptyChat:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=EMPTY_CHAT)


class BriefPosition(BaseModel):
    persona_id: Optional[str] = None
    name: Optional[str] = Field(default=None, max_length=200)
    stance: str = Field(max_length=2000)


class BriefDifference(BaseModel):
    topic: str = Field(max_length=200)
    positions: List[BriefPosition] = Field(default_factory=list, max_length=12)


class BriefCourse(BaseModel):
    code: Optional[str] = Field(default=None, max_length=40)
    title: Optional[str] = Field(default=None, max_length=300)
    credits: Optional[str] = Field(default=None, max_length=20)


class BriefPlan(BaseModel):
    term: Optional[str] = Field(default=None, max_length=40)
    courses: List[BriefCourse] = Field(default_factory=list, max_length=40)
    total_credits: Optional[str] = Field(default=None, max_length=20)


class Brief(BaseModel):
    """A brief as the dialog holds it, questions possibly edited."""
    question: str = Field(default="", max_length=8000)
    summary: str = Field(default="", max_length=40000)
    differences: List[BriefDifference] = Field(default_factory=list, max_length=20)
    plan: Optional[BriefPlan] = None
    questions: List[str] = Field(default_factory=list, max_length=20)


@router.post("/chat-sessions/{session_id}/brief/pdf")
async def brief_pdf(session_id: str, body: Brief, current_user: User = Depends(get_current_active_user)):
    """The brief as a PDF (``utils/file_export.generate_pdf_file_from_blocks``)."""
    from app.utils.file_export import generate_pdf_file_from_blocks

    await _own_session(session_id, current_user)
    buffer = generate_pdf_file_from_blocks(briefs.brief_pdf_blocks(body.model_dump()))
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="brief-for-my-advisor.pdf"'},
    )
