"""Semester planner API for the signed-in student.

Every endpoint works on the caller's own plan at this deployment's school:
the plan is looked up from the token's user id and ``school.slug``, and no
plan id is ever taken from the client. The work happens in
``app.planner.service``; this module maps its errors to HTTP:

- ``revision_conflict`` (409): the plan changed in another window.
- ``unknown_course`` / ``couldnt_verify_course`` / other edit errors (422).
- Accept that needs a second look (409 ``needs_review`` with the refreshed
  proposal) or can't go ahead (409 ``refused`` with the reason); a refused
  undo uses the same ``refused`` shape.
"""

from typing import Any, Awaitable, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from app.config import get_settings
from app.core.auth import get_current_active_user
from app.models.planner import EditRequest, ProposalRequest, UndoRequest
from app.models.user import User
from app.planner import service, store
from app.planner.edits import EditError

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


@router.get("/plan")
async def get_plan(current_user: User = Depends(get_current_active_user)) -> Dict[str, Any]:
    """The student's plan, its check report, the pending proposal and the undo label."""
    return await _run(service.view(str(current_user.id), _school()))


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


@router.get("/suggestions")
async def get_suggestions(
    q: str = Query("", max_length=300),
    term: Optional[str] = Query(None, max_length=40),
    current_user: User = Depends(get_current_active_user),
):
    """Up to five courses matching ``q`` (or the profile's interests), labelled by the checker."""
    result = await _run(service.suggestions(str(current_user.id), _school(), q, term))
    return {"items": result["items"], "reason": result.get("reason")}
