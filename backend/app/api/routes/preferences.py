import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.core.auth import get_current_active_user
from app.core.bootstrap import chat_orchestrator
from app.core.database import get_database
from app.core.persona_filter import get_available_persona_ids
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


class AdvisorPreferencesRequest(BaseModel):
    disabled_advisors: Optional[List[str]] = None
    show_panel: Optional[bool] = None


class AdvisorPreferencesResponse(BaseModel):
    disabled_advisors: Optional[List[str]] = None
    available_advisors: List[str] = []
    show_panel: bool = True


def _build_response(user: User) -> AdvisorPreferencesResponse:
    available = get_available_persona_ids(
        registered_ids=chat_orchestrator.list_personas(),
        system_allowed=get_settings().personas.allowed_advisors,
    )
    return AdvisorPreferencesResponse(
        disabled_advisors=user.disabled_advisors,
        available_advisors=available,
        show_panel=user.show_panel,
    )


@router.get("/me/advisor-preferences", response_model=AdvisorPreferencesResponse)
async def get_advisor_preferences(
    current_user: User = Depends(get_current_active_user),
):
    """
    Retrieve advisor preferences for the authenticated user.
    @param current_user: Authenticated user from dependency injection
    @return: AdvisorPreferencesResponse containing disabled and available advisor IDs
    """
    return _build_response(current_user)


@router.put("/me/advisor-preferences", response_model=AdvisorPreferencesResponse)
async def update_advisor_preferences(
    body: AdvisorPreferencesRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    Update advisor preferences for the authenticated user.
    @param body: AdvisorPreferencesRequest with the advisor IDs to disable and/or
        show_panel; only the fields sent are changed
    @param current_user: Authenticated user from dependency injection
    @return: AdvisorPreferencesResponse with updated disabled and available advisor IDs
    @raises HTTPException 400: If any provided advisor ID is not recognized
    """
    if body.disabled_advisors is not None:
        known_ids = set(chat_orchestrator.list_personas())
        unknown = [aid for aid in body.disabled_advisors if aid not in known_ids]
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown advisor IDs: {unknown}",
            )

    sent = body.model_fields_set
    updates = {}
    if "disabled_advisors" in sent:
        updates["disabled_advisors"] = body.disabled_advisors
    if "show_panel" in sent and body.show_panel is not None:
        updates["show_panel"] = body.show_panel
    if updates:
        db = get_database()
        await db.users.update_one({"_id": current_user.id}, {"$set": updates})
        for field, value in updates.items():
            setattr(current_user, field, value)
    return _build_response(current_user)
