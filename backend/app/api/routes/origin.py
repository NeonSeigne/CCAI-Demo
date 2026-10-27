"""The student's starting place, shared by the Events and Campus map pages.

Stored as a place id on the user (``campus_origin``) in the school's own
database. A stored id that no longer names a place (the places file was
re-imported) falls back to the school pack's ``campus.default_origin``.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.auth import get_current_active_user
from app.core.database import get_database
from app.models.user import User
from app.sources import places

router = APIRouter()


class CampusOriginRequest(BaseModel):
    place_id: str


def _response(user: User) -> Dict[str, Any]:
    stored = places.get(user.campus_origin) if user.campus_origin else None
    place: Optional[Dict[str, Any]] = stored or places.default_origin()
    return {"place": places.public(place) if place else None, "is_default": stored is None}


@router.get("/me/campus-origin")
async def get_campus_origin(current_user: User = Depends(get_current_active_user)) -> Dict[str, Any]:
    """The saved start place, or the school's default when none is saved or it vanished."""
    return _response(current_user)


@router.put("/me/campus-origin")
async def update_campus_origin(
    body: CampusOriginRequest,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Save a start place for this user; 400 when the id is not on the campus map."""
    if places.get(body.place_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown place id '{body.place_id}'.")
    db = get_database()
    await db.users.update_one({"_id": current_user.id}, {"$set": {"campus_origin": body.place_id}})
    current_user.campus_origin = body.place_id
    return _response(current_user)
