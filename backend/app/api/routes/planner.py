"""API routes for Plan My Semester."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.auth import get_current_active_user
from app.core.bootstrap import get_llm_client
from app.config import get_settings
from app.core import semester_planner as planner
from app.models.user import User
from app.utils.document_extractor import extract_text_from_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/planner", tags=["planner"])


class SelectOptionBody(BaseModel):
    selected_option_id: str


class ChatBody(BaseModel):
    message: str = Field(..., min_length=1)


class MutateCoursesBody(BaseModel):
    action: str = Field(..., description="remove | add | replace")
    identifier: Optional[str] = None
    old: Optional[str] = None
    new: Optional[str] = None


def _llm_generate():
    settings = get_settings()
    try:
        client = get_llm_client(settings.llm.default_backend)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Planner LLM unavailable: %s", exc)
        return None

    async def generate(**kwargs):
        return await client.generate(**kwargs)

    return generate


@router.get("/programs")
async def get_programs(current_user: User = Depends(get_current_active_user)):
    del current_user
    return planner.list_programs()


@router.post("/plans")
async def create_plan(
    major_id: str = Form(...),
    year: str = Form(...),
    certificate_ids: str = Form("[]"),
    transcript: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_active_user),
):
    del current_user
    try:
        certs: List[str] = json.loads(certificate_ids or "[]")
        if not isinstance(certs, list):
            raise ValueError("certificate_ids must be a JSON array")
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    transcript_text = ""
    transcript_filename = ""
    if transcript is not None and transcript.filename:
        transcript_filename = transcript.filename
        content = await transcript.read()
        content_type = transcript.content_type or "application/octet-stream"
        # Infer type from extension when browser sends octet-stream.
        if content_type == "application/octet-stream":
            lower = transcript_filename.lower()
            if lower.endswith(".pdf"):
                content_type = "application/pdf"
            elif lower.endswith(".docx"):
                content_type = (
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                )
            elif lower.endswith(".txt"):
                content_type = "text/plain"
        try:
            transcript_text = extract_text_from_file(content, content_type)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=400, detail=f"Could not read transcript: {exc}"
            ) from exc

    try:
        plan = planner.create_plan_shell(
            major_id=major_id,
            certificate_ids=certs,
            year=year,
            transcript_text=transcript_text,
            transcript_filename=transcript_filename,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return planner.public_plan(plan)


@router.get("/plans/{plan_id}")
async def get_plan(plan_id: str, current_user: User = Depends(get_current_active_user)):
    del current_user
    plan = planner.get_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return planner.public_plan(plan)


@router.post("/plans/{plan_id}/generate")
async def generate_plan(
    plan_id: str, current_user: User = Depends(get_current_active_user)
):
    del current_user
    if not planner.get_plan(plan_id):
        raise HTTPException(status_code=404, detail="Plan not found")

    async def event_stream():
        try:
            async for event in planner.generate_plan(
                plan_id, llm_generate=_llm_generate()
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:  # noqa: BLE001
            logger.exception("Plan generation failed")
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.patch("/plans/{plan_id}")
async def patch_plan(
    plan_id: str,
    body: SelectOptionBody,
    current_user: User = Depends(get_current_active_user),
):
    del current_user
    try:
        return planner.select_option(plan_id, body.selected_option_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/plans/{plan_id}/chat")
async def chat_plan(
    plan_id: str,
    body: ChatBody,
    current_user: User = Depends(get_current_active_user),
):
    del current_user
    try:
        return await planner.chat_with_plan(
            plan_id, body.message, llm_generate=_llm_generate()
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/plans/{plan_id}/courses")
async def mutate_courses(
    plan_id: str,
    body: MutateCoursesBody,
    current_user: User = Depends(get_current_active_user),
):
    del current_user
    try:
        return planner.mutate_courses(
            plan_id,
            action=body.action,
            identifier=body.identifier or "",
            old=body.old or "",
            new=body.new or "",
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/plans/{plan_id}/candidates")
async def get_candidates(
    plan_id: str,
    q: str = "",
    current_user: User = Depends(get_current_active_user),
):
    del current_user
    try:
        return {"candidates": planner.list_candidates(plan_id, q=q)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
