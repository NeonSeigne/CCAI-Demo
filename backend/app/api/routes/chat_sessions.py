from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Literal, Optional
from datetime import datetime
from bson import ObjectId
from app.models.user import User, ChatSession, ChatSessionResponse, PersistMessage
from app.core.auth import get_current_active_user
from app.core.database import get_database
from pydantic import BaseModel, field_validator
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Titles are stored and returned whole (no "..."): the UI ellipsizes. The cap
# only stops a pasted essay from becoming a title.
MAX_TITLE_CHARS = 200


def _clean_title(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    title = " ".join(value.split())
    if not title:
        raise ValueError("title can't be empty")
    if len(title) > MAX_TITLE_CHARS:
        raise ValueError(f"title is longer than {MAX_TITLE_CHARS} characters")
    return title


class CreateChatSessionRequest(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def _title(cls, value):
        return _clean_title(value)


class UpdateChatSessionRequest(BaseModel):
    """Rename (``title``), pin (``pinned``) and/or replace ``messages``."""
    title: Optional[str] = None
    messages: Optional[List[dict]] = None
    pinned: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def _title(cls, value):
        return _clean_title(value)


class MessageFeedbackRequest(BaseModel):
    """Thumbs up or down on an assistant answer; ``null`` clears it."""
    feedback: Optional[Literal["up", "down"]] = None


# Message types that are assistant answers (the ones with an action row).
ANSWER_TYPES = ("advisor",)


async def persist_message(session_id: str, message: PersistMessage) -> str:
    """Write a single message to a MongoDB chat session; returns its ``id``
    (what the feedback endpoint takes)."""
    db = get_database()
    msg = message.model_dump(exclude_none=True)
    if "timestamp" not in msg:
        msg["timestamp"] = datetime.utcnow().isoformat()
    await db.chat_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {
            "$push": {"messages": msg},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    return msg["id"]


@router.post("/chat-sessions", response_model=dict)
async def create_chat_session(
    request: CreateChatSessionRequest,
    current_user: User = Depends(get_current_active_user)
):
    """
    Create a new chat session for the authenticated user.
    @param request: CreateChatSessionRequest with the session title
    @param current_user: Authenticated user from dependency injection
    @return: Dict with the new session id, title, timestamps, and message_count
    """
    try:
        db = get_database()
        
        session = ChatSession(
            user_id=current_user.id,
            title=request.title,
            messages=[],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        result = await db.chat_sessions.insert_one(session.dict(by_alias=True))
        session.id = result.inserted_id
        
        return {
            "id": str(session.id),
            "title": session.title,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "message_count": 0,
            "document_count": 0,
            "pinned": False,
        }
        
    except Exception as e:
        logger.error(f"Error creating chat session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create chat session"
        )


@router.get("/chat-sessions", response_model=List[ChatSessionResponse])
async def get_user_chat_sessions(
    current_user: User = Depends(get_current_active_user),
    limit: int = 50,
    skip: int = 0
):
    """
    Get all active chat sessions for the authenticated user.
    @param current_user: Authenticated user from dependency injection
    @param limit: Maximum number of sessions to return (default 50)
    @param skip: Number of sessions to skip for pagination (default 0)
    @return: List of ChatSessionResponse sorted by most recently updated
    """
    try:
        db = get_database()
        
        # Pinned chats first, then most recently updated.
        cursor = db.chat_sessions.find(
            {"user_id": current_user.id, "is_active": True}
        ).sort([("pinned", -1), ("updated_at", -1)]).skip(skip).limit(limit)
        
        sessions = []
        async for session_data in cursor:
            messages = session_data.get("messages", [])
            document_count = sum(
                1 for msg in messages
                if isinstance(msg, dict) and msg.get("type") == "document_upload"
            )
            sessions.append(ChatSessionResponse(
                id=str(session_data["_id"]),
                title=session_data["title"],
                created_at=session_data["created_at"],
                updated_at=session_data["updated_at"],
                message_count=len(messages),
                document_count=document_count,
                pinned=bool(session_data.get("pinned", False)),
            ))
        
        return sessions
        
    except Exception as e:
        logger.error(f"Error fetching chat sessions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not fetch chat sessions"
        )



@router.get("/chat-sessions/count")
async def get_chat_sessions_count(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get count of active, non-deleted chat sessions for the authenticated user.
    @param current_user: Authenticated user from dependency injection
    @return: Dict with the session count
    """
    try:
        db = get_database()
        user_object_id = ObjectId(str(current_user.id))
        
        count = await db.chat_sessions.count_documents({
            "user_id": user_object_id,
            "is_active": {"$ne": False},
            "deleted_at": {"$exists": False}
        })
        
        return {"count": count}
        
    except Exception as e:
        logger.error(f"Error counting chat sessions for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to count chat sessions"
        )



@router.get("/chat-sessions/{session_id}")
async def get_chat_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Get a specific chat session with all messages.
    @param session_id: MongoDB ObjectId of the chat session
    @param current_user: Authenticated user from dependency injection
    @return: Dict with session id, title, messages, and timestamps
    """
    try:
        db = get_database()
        
        session_data = await db.chat_sessions.find_one({
            "_id": ObjectId(session_id),
            "user_id": current_user.id,
            "is_active": True
        })
        
        if not session_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat session not found"
            )
        
        return {
            "id": str(session_data["_id"]),
            "title": session_data["title"],
            "messages": session_data.get("messages", []),
            "created_at": session_data["created_at"],
            "updated_at": session_data["updated_at"],
            "pinned": bool(session_data.get("pinned", False)),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching chat session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not fetch chat session"
        )

@router.put("/chat-sessions/{session_id}")
async def update_chat_session(
    session_id: str,
    request: UpdateChatSessionRequest,
    current_user: User = Depends(get_current_active_user)
):
    """
    Update a chat session's title and/or messages.
    @param session_id: MongoDB ObjectId of the chat session
    @param request: UpdateChatSessionRequest with optional title and messages
    @param current_user: Authenticated user from dependency injection
    @return: Dict with a confirmation message
    """
    try:
        db = get_database()
        
        # Verify session belongs to user
        session_data = await db.chat_sessions.find_one({
            "_id": ObjectId(session_id),
            "user_id": current_user.id,
            "is_active": True
        })
        
        if not session_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat session not found"
            )
        
        # Renaming or pinning doesn't move a chat in Recent; new messages do.
        update_data = {}

        if request.title is not None:
            update_data["title"] = request.title

        if request.pinned is not None:
            update_data["pinned"] = request.pinned

        if request.messages is not None:
            update_data["messages"] = request.messages
            update_data["updated_at"] = datetime.utcnow()

        if not update_data:
            return {"message": "Chat session updated successfully"}

        await db.chat_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": update_data}
        )
        
        return {"message": "Chat session updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating chat session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update chat session"
        )



@router.put("/chat-sessions/{session_id}/messages/{message_id}/feedback")
async def set_message_feedback(
    session_id: str,
    message_id: str,
    request: MessageFeedbackRequest,
    current_user: User = Depends(get_current_active_user)
):
    """
    Thumbs up or down on one assistant answer, stored on the message as
    ``feedback`` ("up" | "down"); ``{"feedback": null}`` clears it.
    @return: Dict with message_id and the stored feedback
    """
    try:
        session_oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    try:
        db = get_database()
        session_data = await db.chat_sessions.find_one({
            "_id": session_oid,
            "user_id": current_user.id,
            "is_active": True
        })
        if not session_data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
        message = next(
            (m for m in session_data.get("messages", []) if isinstance(m, dict) and m.get("id") == message_id),
            None,
        )
        if message is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        if message.get("type") not in ANSWER_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Only answers can get feedback",
            )
        change = (
            {"$set": {"messages.$.feedback": request.feedback}}
            if request.feedback
            else {"$unset": {"messages.$.feedback": ""}}
        )
        await db.chat_sessions.update_one(
            {"_id": session_oid, "user_id": current_user.id, "messages.id": message_id},
            change,
        )
        return {"message_id": message_id, "feedback": request.feedback}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving message feedback: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save feedback"
        )


@router.delete("/chat-sessions")
async def delete_all_chat_sessions(
    current_user: User = Depends(get_current_active_user)
):
    """
    Soft-delete all chat sessions for the authenticated user.
    @param current_user: Authenticated user from dependency injection
    @return: Dict with a confirmation message and the number of deleted sessions
    """
    try:
        db = get_database()

        result = await db.chat_sessions.update_many(
            {
                "user_id": current_user.id,
                "is_active": True
            },
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
        )

        return {
            "message": f"Deleted {result.modified_count} chat sessions",
            "deleted_count": result.modified_count
        }

    except Exception as e:
        logger.error(f"Error deleting all chat sessions for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete chat sessions"
        )


@router.delete("/chat-sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Soft-delete a single chat session.
    @param session_id: MongoDB ObjectId of the chat session
    @param current_user: Authenticated user from dependency injection
    @return: Dict with a confirmation message
    """
    try:
        db = get_database()
        
        result = await db.chat_sessions.update_one(
            {
                "_id": ObjectId(session_id),
                "user_id": current_user.id
            },
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat session not found"
            )
        
        return {"message": "Chat session deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting chat session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete chat session"
        )