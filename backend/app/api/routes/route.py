"""Walking route between two campus places (OSRM foot profile, no LLM).

On a routing failure or no route the endpoint answers 503 and the page shows
"Walking route unavailable" with no time (R4).
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import get_current_active_user
from app.models.user import User
from app.sources import places, routing

router = APIRouter(prefix="/route", tags=["route"])


def _place(place_id: str, which: str) -> Dict[str, Any]:
    place = places.get(place_id)
    if place is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown {which} place id '{place_id}'.")
    return place


@router.get("")
async def walking_route(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    del current_user
    start, end = _place(from_, "from"), _place(to, "to")
    try:
        route = await asyncio.to_thread(routing.walking_route, start, end)
    except routing.RouteUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Walking route unavailable.") from exc
    return {**route, "source": "osrm", "attribution": routing.ATTRIBUTION}
