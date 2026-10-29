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
"""

import hashlib
import logging
import time
from typing import Annotated, Any, Awaitable, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from app.config import get_settings
from app.core.auth import get_current_active_user
from app.models.planner import EditRequest, PreviewRequest, ProposalRequest, UndoRequest
from app.models.user import User
from app.planner import service, store
from app.planner.edits import EditError

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


@router.get("/programs")
async def list_programs(current_user: User = Depends(get_current_active_user)):
    """Program files this school has, for the profile picker."""
    del current_user  # signed-in only; programs are the same for every student
    return [
        {
            "id": p.id, "name": p.name, "type": p.type,
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
        str(current_user.id), _school(), body.ops, expected_revision=body.expected_revision,
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
    return {"items": result["items"], "reason": result.get("reason")}
