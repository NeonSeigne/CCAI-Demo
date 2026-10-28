"""Plan persistence: one plan per student per school, guarded by a revision.

Collection ``plans``, unique on ``(user_id, school)``; the document shape is
in ``CONTRACTS.md``. Every content write is a single
``find_one_and_update`` filtered on the revision the caller read, so two
windows can't overwrite each other: the loser gets ``RevisionConflict``.

What lives here besides plain reads and writes:

- **Idempotency keys.** An edit carries a key; a repeated key (a retried
  request) returns the plan as it is without applying the ops again. The last
  ``IDEMPOTENCY_KEEP`` keys are kept with the revision they produced.
- **Undo** (design doc, Behavior details > Undo). The stack holds the
  last ``UNDO_DEPTH`` non-undo edits; ``pointer`` counts how many of them can
  still be undone. Undo writes a new revision applying the inverse at the
  pointer and moves the pointer back one; undo revisions are never pushed, so
  repeated Undo walks back through the stack. A new edit drops the steps after
  the pointer. There is no redo.
- **Proposals** (R9, R10). At most one is pending: a new one replaces the old,
  whose id is remembered as "replaced" so its card can't be accepted. A
  proposal expires ``PROPOSAL_TTL`` after it is made. Accept checks the id,
  the pending status, the expiry and the base revision; when the plan moved
  since, the caller's ``recheck`` re-runs the proposal on the current plan and
  the student is asked again (``NeedsReview``), or Accept is refused with the
  reason.

Proposal writes don't bump the revision (a proposal isn't plan content), but
they are still filtered on it, so a proposal is always tied to the revision it
was checked against.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.planner import edits

UNDO_DEPTH = 20
IDEMPOTENCY_KEEP = 50
PAST_PROPOSALS_KEEP = 20
PROPOSAL_TTL = timedelta(hours=24)


class RevisionConflict(Exception):
    """The plan's revision isn't the one the caller read."""

    def __init__(self, revision: Optional[int]):
        super().__init__(f"Plan is at revision {revision}")
        self.revision = revision


class Refused(Exception):
    """An undo or accept that can't go ahead; ``reason`` is shown to the student."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class NeedsReview(Exception):
    """The plan moved since the proposal; its refreshed diff needs a second look."""

    def __init__(self, proposal: Dict[str, Any]):
        super().__init__("Proposal needs review")
        self.proposal = proposal


def utcnow() -> datetime:
    # Naive UTC, the form Motor hands back by default, so stored times compare.
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def ensure_indexes(db) -> None:
    await db.plans.create_index([("user_id", 1), ("school", 1)], unique=True)


def new_plan(user_id: str, school: str, term: str) -> Dict[str, Any]:
    return {
        "user_id": user_id,
        "school": school,
        "revision": 0,
        "term": term,
        "profile": {"program_ids": [], "catalog_year": None, "class_year": None, "completed": [],
                    "interests": {"text": "", "tags": []}},
        "courses": [],
        "undo": {"stack": [], "pointer": 0},
        "proposal": None,
        "past_proposals": [],
        "idempotency": [],
        "updated_at": utcnow(),
    }


def _owner(user_id: str, school: str) -> Dict[str, Any]:
    return {"user_id": user_id, "school": school}


async def get_or_create(db, user_id: str, school: str, *, term: str) -> Dict[str, Any]:
    owner = _owner(user_id, school)
    plan = await db.plans.find_one(owner)
    if plan:
        return plan
    try:
        await db.plans.insert_one(new_plan(user_id, school, term))
    except DuplicateKeyError:
        pass  # a concurrent first visit created it; read that one
    return await db.plans.find_one(owner)


async def load(db, user_id: str, school: str) -> Dict[str, Any]:
    plan = await db.plans.find_one(_owner(user_id, school))
    if not plan:
        raise Refused("You don't have a plan yet")
    return plan


async def _write(db, plan: Dict[str, Any], fields: Dict[str, Any], *, bump: bool = True) -> Dict[str, Any]:
    """Write ``fields`` if the stored revision is still ``plan["revision"]``."""
    changes = dict(fields, updated_at=utcnow())
    if bump:
        changes["revision"] = plan["revision"] + 1
    doc = await db.plans.find_one_and_update(
        {**_owner(plan["user_id"], plan["school"]), "revision": plan["revision"]},
        {"$set": changes},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        current = await db.plans.find_one(_owner(plan["user_id"], plan["school"]))
        raise RevisionConflict(current["revision"] if current else None)
    return doc


# ---------------------------------------------------------------------------
# Edits and undo
# ---------------------------------------------------------------------------


def seen_key(plan: Dict[str, Any], key: Optional[str]) -> bool:
    return bool(key) and any(entry.get("key") == key for entry in plan.get("idempotency") or [])


def current_undo_label(plan: Dict[str, Any]) -> Optional[str]:
    undo = plan.get("undo") or {}
    pointer = undo.get("pointer", 0)
    return undo["stack"][pointer - 1]["label"] if pointer else None


async def commit_edit(
    db,
    user_id: str,
    school: str,
    ops: List[Dict[str, Any]],
    *,
    expected_revision: int,
    idempotency_key: Optional[str] = None,
    extra_fields: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], bool]:
    """Apply validated ops as a new revision; returns (plan, repeated).

    ``repeated`` is True when ``idempotency_key`` was seen before: nothing is
    written and the plan is returned as it stands.
    """
    plan = await load(db, user_id, school)
    if seen_key(plan, idempotency_key):
        return plan, True
    if plan["revision"] != expected_revision:
        raise RevisionConflict(plan["revision"])
    edits.check_applies(plan, ops)
    after = edits.apply_ops(plan, ops)
    entry = {"ops": ops, "inverse": edits.inverse_ops(plan, ops), "label": edits.undo_label(ops),
             "revision": plan["revision"] + 1}
    undo = plan.get("undo") or {"stack": [], "pointer": 0}
    stack = (undo["stack"][: undo["pointer"]] + [entry])[-UNDO_DEPTH:]
    keys = plan.get("idempotency") or []
    if idempotency_key:
        keys = (keys + [{"key": idempotency_key, "revision": plan["revision"] + 1}])[-IDEMPOTENCY_KEEP:]
    fields = {"courses": after["courses"], "profile": after["profile"],
              "undo": {"stack": stack, "pointer": len(stack)}, "idempotency": keys, **(extra_fields or {})}
    return await _write(db, plan, fields), False


async def undo(db, user_id: str, school: str, *, expected_revision: int) -> Dict[str, Any]:
    """Invert the edit at the undo pointer, as a new revision."""
    plan = await load(db, user_id, school)
    if plan["revision"] != expected_revision:
        raise RevisionConflict(plan["revision"])
    undo_state = plan.get("undo") or {"stack": [], "pointer": 0}
    pointer = undo_state["pointer"]
    if pointer == 0:
        raise Refused("Nothing to undo")
    entry = undo_state["stack"][pointer - 1]
    try:
        edits.check_applies(plan, entry["inverse"])
    except edits.EditError as exc:
        raise Refused(f"Can't undo that: {exc.message}") from exc
    after = edits.apply_ops(plan, entry["inverse"])
    fields = {"courses": after["courses"], "profile": after["profile"],
              "undo": {"stack": undo_state["stack"], "pointer": pointer - 1}}
    return await _write(db, plan, fields)


# ---------------------------------------------------------------------------
# Proposals
# ---------------------------------------------------------------------------


def proposal_status(proposal: Dict[str, Any], now: Optional[datetime] = None) -> str:
    if proposal["status"] == "pending" and (now or utcnow()) >= proposal["expires_at"]:
        return "expired"
    return proposal["status"]


def pending_proposal(plan: Dict[str, Any], now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    proposal = plan.get("proposal")
    if proposal and proposal_status(proposal, now) == "pending":
        return proposal
    return None


def _past_status(plan: Dict[str, Any], proposal_id: str) -> Optional[str]:
    return next((p["status"] for p in plan.get("past_proposals") or [] if p.get("id") == proposal_id), None)


async def put_proposal(
    db,
    user_id: str,
    school: str,
    ops: List[Dict[str, Any]],
    *,
    base_revision: int,
    diff: Dict[str, Any],
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Store a new pending proposal, replacing any earlier one."""
    now = now or utcnow()
    plan = await load(db, user_id, school)
    if plan["revision"] != base_revision:
        raise RevisionConflict(plan["revision"])
    past = list(plan.get("past_proposals") or [])
    old = plan.get("proposal")
    if old:
        status = proposal_status(old, now)
        past.append({"id": old["id"], "status": "replaced" if status == "pending" else status})
    proposal = {
        "id": uuid.uuid4().hex,
        "base_revision": base_revision,
        "ops": ops,
        "summary": diff.get("heading"),
        "diff": diff,
        "created_at": now,
        "expires_at": now + PROPOSAL_TTL,
        "status": "pending",
    }
    await _write(db, plan, {"proposal": proposal, "past_proposals": past[-PAST_PROPOSALS_KEEP:]}, bump=False)
    return proposal


def _target(plan: Dict[str, Any], proposal_id: str, now: datetime) -> Dict[str, Any]:
    """The pending proposal with this id, or ``Refused`` saying why not."""
    proposal = plan.get("proposal")
    if not proposal or proposal["id"] != proposal_id:
        status = _past_status(plan, proposal_id)
        raise Refused(f"This suggestion was {status}" if status else "This suggestion isn't on your plan")
    status = proposal_status(proposal, now)
    if status != "pending":
        raise Refused(f"This suggestion was {status}" if status != "expired" else "This suggestion expired; ask again")
    return proposal


async def discard(db, user_id: str, school: str, proposal_id: str, *, now: Optional[datetime] = None) -> Dict[str, Any]:
    plan = await load(db, user_id, school)
    proposal = _target(plan, proposal_id, now or utcnow())
    closed = dict(proposal, status="discarded")
    await _write(db, plan, {"proposal": closed}, bump=False)
    return closed


Recheck = Callable[[Dict[str, Any], Dict[str, Any]], Awaitable[Dict[str, Any]]]


async def accept(
    db,
    user_id: str,
    school: str,
    proposal_id: str,
    *,
    recheck: Recheck,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Apply the pending proposal; returns the new plan.

    ``recheck(plan, proposal)`` returns a fresh diff for the proposal against
    ``plan``, or raises ``edits.EditError`` when its ops no longer apply.
    """
    now = now or utcnow()
    plan = await load(db, user_id, school)
    try:
        proposal = _target(plan, proposal_id, now)
    except Refused:
        current = plan.get("proposal")
        if current and current["id"] == proposal_id and proposal_status(current, now) == "expired":
            await _write(db, plan, {"proposal": dict(current, status="expired")}, bump=False)
        raise

    if plan["revision"] != proposal["base_revision"]:
        try:
            fresh = await recheck(plan, proposal)
        except edits.EditError as exc:
            raise Refused(f"Your plan changed and this no longer applies: {exc.message}") from exc
        refreshed = dict(proposal, base_revision=plan["revision"], diff=fresh, summary=fresh.get("heading"))
        await _write(db, plan, {"proposal": refreshed}, bump=False)
        raise NeedsReview(refreshed)

    applied, _ = await commit_edit(
        db, user_id, school, proposal["ops"], expected_revision=plan["revision"],
        extra_fields={"proposal": dict(proposal, status="applied")},
    )
    return applied


# ---------------------------------------------------------------------------
# What leaves the server
# ---------------------------------------------------------------------------


def _iso(value: Any) -> Any:
    return value.isoformat() + "Z" if isinstance(value, datetime) else value


def public_proposal(proposal: Optional[Dict[str, Any]], now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    if not proposal:
        return None
    out = {k: _iso(v) for k, v in proposal.items()}
    out["status"] = proposal_status(proposal, now)
    return out


def public_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """The plan as the client sees it: no owner, no bookkeeping."""
    hidden = {"_id", "user_id", "idempotency", "past_proposals", "proposal"}
    out = {k: v for k, v in plan.items() if k not in hidden}
    out["updated_at"] = _iso(plan.get("updated_at"))
    undo = plan.get("undo") or {}
    out["undo"] = {"pointer": undo.get("pointer", 0),
                   "stack": [{"label": e["label"], "revision": e["revision"]} for e in undo.get("stack") or []]}
    return out
