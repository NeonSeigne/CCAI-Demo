"""Semester planner API for the signed-in student.

Every endpoint works on the caller's own plan at this deployment's school:
the plan is looked up from the token's user id and ``school.slug``, and no
plan id is ever taken from the client. The work happens in
``app.planner.service``; this module maps its errors to HTTP:

- ``revision_conflict`` (409): the plan changed in another window.
- ``unknown_course`` / ``couldnt_verify_course`` / other edit errors (422).
- Accept that needs a second look (409 ``needs_review`` with the refreshed
  proposal) or can't go ahead (409 ``refused`` with the reason); a refused
  undo or redo uses the same ``refused`` shape.
- Transcript uploads: 413 ``too_large``, 415 ``unsupported_type``, 422
  ``no_file`` / ``too_many_pages`` / ``unreadable`` (``post_transcript``).
"""

import asyncio
import hashlib
import logging
import time
from typing import Annotated, Any, AsyncGenerator, Awaitable, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from starlette.formparsers import MultiPartException, MultiPartParser

from app.config import get_settings
from app.core.auth import get_current_active_user
from app.models.planner import EditRequest, PreviewRequest, ProposalRequest, UndoRequest
from app.models.user import User
from app.planner import service, store
from app.planner.edits import EditError
from app.utils.document_extractor import TooManyPages, extract_text_from_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/planner", tags=["planner"])


def _school() -> str:
    return get_settings().school.slug


async def _run(call: Awaitable[Any]) -> Any:
    try:
        return await call
    except store.RevisionConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            "code": "revision_conflict", "revision": exc.revision,
            "message": "Your plan changed in another window",
        })
    except EditError as exc:
        raise HTTPException(status_code=422, detail=exc.as_dict())
    except store.NeedsReview as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            "status": "needs_review", "proposal": store.public_proposal(exc.proposal),
        })
    except store.Refused as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"status": "refused", "reason": exc.reason})


def _user_hash(user: User) -> str:
    """A sha256 prefix of the user id: enough to follow one student's calls in the logs."""
    return hashlib.sha256(str(user.id).encode()).hexdigest()[:12]


def _outcome(exc: HTTPException) -> str:
    detail = exc.detail if isinstance(exc.detail, dict) else {}
    return str(detail.get("code") or detail.get("status") or exc.status_code)


async def _logged(name: str, user: User, revision: Optional[int], call: Awaitable[Any]) -> Any:
    """``_run`` plus one info line per call (CEO review C5): user hash,
    revision, duration in ms and the outcome or error code."""
    started, outcome, result = time.monotonic(), "error", None
    try:
        result = await _run(call)
        outcome = "ok"
        return result
    except HTTPException as exc:
        outcome = _outcome(exc)
        raise
    finally:
        if revision is None and isinstance(result, dict):
            revision = result.get("revision")
        logger.info("planner %s user=%s revision=%s duration_ms=%d outcome=%s", name, _user_hash(user), revision,
                    round((time.monotonic() - started) * 1000), outcome)


@router.get("/plan")
async def get_plan(
    current_user: User = Depends(get_current_active_user),
    term: Annotated[Optional[str], Query(max_length=40)] = None,
) -> Dict[str, Any]:
    """The student's plan, its check report, the pending proposal and the undo label.

    ``term`` checks the plan for that term (the semester view of any term).
    """
    return await _run(service.view(str(current_user.id), _school(), term))


@router.get("/degree")
async def get_degree(current_user: User = Depends(get_current_active_user)) -> Dict[str, Any]:
    """Every planned term's credits, load and courses, plus completed courses and rules."""
    return await _logged("degree", current_user, None, service.degree(str(current_user.id), _school()))


@router.get("/today")
async def get_today(current_user: User = Depends(get_current_active_user)) -> Dict[str, Any]:
    """'Your classes today': the plan's meetings today, only on a weekday
    inside a term's first and last day of classes (R12)."""
    return await _run(service.classes_today(str(current_user.id), _school()))


@router.get("/programs")
async def list_programs(current_user: User = Depends(get_current_active_user)):
    """Program files this school has, for the profile picker."""
    del current_user  # signed-in only; programs are the same for every student
    return [
        {
            "id": p.id, "name": p.name, "type": p.type,
            # The setup dialog shows the file's catalog year and degree total (R11).
            "catalog_year": p.catalog_year, "total_credits": p.total_credits,
            # Course lists for the "Tick off courses" checklist (8A); level rules
            # name subjects, not courses, so they have none.
            "rules": [
                {"id": r.id, "title": r.title,
                 "courses": list(r.courses) or sorted({c for group in r.groups for c in group})}
                for r in p.rules
            ],
        }
        for p in service.list_programs(_school())
    ]


@router.post("/edits")
async def post_edits(body: EditRequest, current_user: User = Depends(get_current_active_user)):
    """Apply the student's own edit; a repeated idempotency key applies nothing."""
    return await _run(service.apply_edit(
        str(current_user.id), _school(), body.ops,
        expected_revision=body.expected_revision, idempotency_key=body.idempotency_key,
    ))


@router.post("/preview")
async def post_preview(body: PreviewRequest, current_user: User = Depends(get_current_active_user)):
    """The diff these ops would make, seen in ``term``; nothing is stored."""
    return await _logged("preview", current_user, body.expected_revision, service.preview(
        str(current_user.id), _school(), body.ops, expected_revision=body.expected_revision, term=body.term,
    ))


@router.post("/proposals")
async def post_proposal(body: ProposalRequest, current_user: User = Depends(get_current_active_user)):
    """Check ops and store them as the one pending proposal, with its diff."""
    proposal = await _run(service.propose(
        str(current_user.id), _school(), body.ops, expected_revision=body.expected_revision, term=body.term,
    ))
    return {"proposal": proposal}


@router.post("/proposals/{proposal_id}/accept")
async def accept_proposal(
    proposal_id: str,
    body: Optional[Dict[str, Any]] = Body(default=None),
    current_user: User = Depends(get_current_active_user),
):
    del body  # the contract sends {}; nothing in it is read
    return await _run(service.accept(str(current_user.id), _school(), proposal_id))


@router.post("/proposals/{proposal_id}/discard")
async def discard_proposal(proposal_id: str, current_user: User = Depends(get_current_active_user)):
    return {"proposal": await _run(service.discard(str(current_user.id), _school(), proposal_id))}


@router.post("/undo")
async def post_undo(body: UndoRequest, current_user: User = Depends(get_current_active_user)):
    return await _run(service.undo(str(current_user.id), _school(), expected_revision=body.expected_revision))


@router.post("/redo")
async def post_redo(body: UndoRequest, current_user: User = Depends(get_current_active_user)):
    """Re-apply the step Undo walked back; 409 ``refused`` with the reason when it no longer applies."""
    return await _logged("redo", current_user, body.expected_revision,
                         service.redo(str(current_user.id), _school(), expected_revision=body.expected_revision))


@router.get("/suggestions")
async def get_suggestions(
    q: str = Query("", max_length=300),
    term: Annotated[Optional[str], Query(max_length=40)] = None,
    current_user: User = Depends(get_current_active_user),
):
    """Up to five courses matching ``q`` (or the profile's interests), labelled by the checker."""
    result = await _run(service.suggestions(str(current_user.id), _school(), q, term))
    return {"items": result["items"], "reason": result.get("reason"), "term": result.get("term")}


# ---------------------------------------------------------------------------
# Transcript upload (setup dialog)
# ---------------------------------------------------------------------------

TRANSCRIPT_MAX_BYTES = 10 * 1024 * 1024
TRANSCRIPT_MAX_PAGES = 40
# Room for the multipart boundary and part headers around a 10 MB file.
_MULTIPART_OVERHEAD = 64 * 1024
_PDF = "application/pdf"
_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_TXT = "text/plain"
_EXTENSIONS = {".pdf": _PDF, ".docx": _DOCX, ".txt": _TXT}
_GENERIC_TYPES = {"", "application/octet-stream"}


class _InMemoryParser(MultiPartParser):
    """Starlette's parser with a spool larger than any body we accept, so the
    upload never rolls over into a temporary file (setup-dialog R8)."""

    spool_max_size = TRANSCRIPT_MAX_BYTES + _MULTIPART_OVERHEAD


def _transcript_error(status_code: int, code: str) -> HTTPException:
    # Codes only: the extractor's own messages are for developers (R5).
    return HTTPException(status_code=status_code, detail={"code": code})


async def _read_capped(request: Request, limit: int) -> bytes:
    """The request body, or 413 once it passes ``limit`` bytes; a declared
    length is only used to refuse early, never trusted to be small."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise _transcript_error(413, "too_large")
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > limit:
            raise _transcript_error(413, "too_large")
    return bytes(body)


def _kind(content_type: Optional[str], filename: Optional[str]) -> Optional[str]:
    """The extractor's content type for an upload: its own type, or its
    extension when the browser sent a generic one."""
    content_type = (content_type or "").split(";")[0].strip().lower()
    if content_type in (_PDF, _DOCX, _TXT):
        return content_type
    if content_type in _GENERIC_TYPES:
        name = (filename or "").lower()
        return next((kind for ext, kind in _EXTENSIONS.items() if name.endswith(ext)), None)
    return None


def _transcript_text(data: bytes, kind: str) -> str:
    if kind == _TXT:
        try:
            return data.decode("utf-8-sig")
        except UnicodeDecodeError:
            return data.decode("latin-1")
    return extract_text_from_file(data, kind, max_pages=TRANSCRIPT_MAX_PAGES)


@router.post("/transcript")
async def post_transcript(request: Request, current_user: User = Depends(get_current_active_user)):
    """Course rows from an uploaded transcript, for the setup dialog's Completed step.

    Multipart form with one ``file`` field: PDF, DOCX or TXT, at most 10 MB
    (the body is read with a cap; a size header is not trusted), a PDF at most
    40 pages. The file and its text are read in memory and never stored or
    logged; the log line carries counts only (setup-dialog R5, R8).

    Returns ``{rows, counts}``. Each row is ``{id, title, grade, credits, term,
    ticked, checked, in_catalog}``: ``grade`` as on the transcript or null;
    ``credits`` from the row (0-12) or null; ``term`` the row's term or null;
    ``ticked`` true for a passing grade (A to D-, AB/BC, P/S/CR) on a course
    the catalog has; ``checked`` false when the catalog check didn't answer in
    time (then ``in_catalog`` is null); ``in_catalog`` false for a code the
    catalog doesn't have. A repeated course is one row, its latest passing
    attempt. ``counts`` is ``{rows, ticked, not_checked, not_in_catalog}``.

    Errors (``detail.code``): 413 ``too_large``; 415 ``unsupported_type``;
    422 ``no_file``, ``too_many_pages``, ``unreadable`` (encrypted, scanned or
    damaged).
    """
    started = time.monotonic()
    outcome, counts = "error", None
    try:
        body = await _read_capped(request, TRANSCRIPT_MAX_BYTES + _MULTIPART_OVERHEAD)

        async def stream() -> AsyncGenerator[bytes, None]:
            yield body
            yield b""

        try:
            form = await _InMemoryParser(request.headers, stream(), max_files=1, max_fields=10).parse()
        except (MultiPartException, ValueError, KeyError):  # no boundary, a bad body, too many parts
            raise _transcript_error(422, "no_file")
        upload = form.get("file")
        if upload is None or isinstance(upload, str):
            raise _transcript_error(422, "no_file")
        try:
            data = await upload.read()
        finally:
            await upload.close()
        if len(data) > TRANSCRIPT_MAX_BYTES:
            raise _transcript_error(413, "too_large")
        kind = _kind(upload.content_type, upload.filename)
        if kind is None:
            raise _transcript_error(415, "unsupported_type")
        try:
            text = await asyncio.to_thread(_transcript_text, data, kind)
        except TooManyPages:
            raise _transcript_error(422, "too_many_pages")
        except Exception:  # encrypted, scanned or damaged; the reason stays out of the response and logs
            raise _transcript_error(422, "unreadable")
        if not text.strip():
            raise _transcript_error(422, "unreadable")
        result = await _run(service.transcript(str(current_user.id), _school(), text))
        counts, outcome = result["counts"], "ok"
        return result
    except HTTPException as exc:
        outcome = _outcome(exc)
        raise
    finally:
        logger.info("planner transcript user=%s duration_ms=%d outcome=%s counts=%s", _user_hash(current_user),
                    round((time.monotonic() - started) * 1000), outcome, counts)
