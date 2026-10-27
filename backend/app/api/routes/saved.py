"""Saved items and collections for the signed-in student.

Every query is scoped to the token's user id, so one student can never read,
file or delete another's items.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.errors import DuplicateKeyError

from app.core.auth import get_current_active_user
from app.core.database import get_database
from app.models.saved import (
    CollectionRequest,
    CollectionResponse,
    MoveItemRequest,
    SavedItemResponse,
    SavedKind,
    SaveItemRequest,
)
from app.models.user import User

router = APIRouter(prefix="/saved", tags=["saved"])


def _oid(value: str, what: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _item(doc: Dict[str, Any], collection_ids: Optional[set] = None) -> SavedItemResponse:
    collection_id = str(doc["collection_id"]) if doc.get("collection_id") else None
    # A collection deleted while a move was in flight leaves a dangling id;
    # such items are shown in Unsorted.
    if collection_ids is not None and collection_id not in collection_ids:
        collection_id = None
    return SavedItemResponse(
        id=str(doc["_id"]),
        kind=doc["kind"],
        key=doc["key"],
        display_name=doc["display_name"],
        event_start=doc.get("event_start"),
        event_end=doc.get("event_end"),
        collection_id=collection_id,
        saved_at=doc["saved_at"],
    )


async def _own_collection(db, user: User, collection_id: Optional[str]) -> Optional[ObjectId]:
    if collection_id is None:
        return None
    oid = _oid(collection_id, "Collection")
    if not await db.saved_collections.find_one({"_id": oid, "user_id": user.id}):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    return oid


@router.get("")
async def list_saved(current_user: User = Depends(get_current_active_user)) -> Dict[str, Any]:
    """Every saved item, newest first, and the student's collections with counts."""
    db = get_database()
    collections = await db.saved_collections.find({"user_id": current_user.id}).sort("created_at", 1).to_list(None)
    ids = {str(c["_id"]) for c in collections}
    docs = await db.saved_items.find({"user_id": current_user.id}).sort("saved_at", -1).to_list(None)
    items = [_item(d, ids) for d in docs]
    counts: Dict[Optional[str], int] = {}
    for item in items:
        counts[item.collection_id] = counts.get(item.collection_id, 0) + 1
    return {
        "items": items,
        "collections": [
            CollectionResponse(id=str(c["_id"]), name=c["name"], count=counts.get(str(c["_id"]), 0), created_at=c["created_at"])
            for c in collections
        ],
        "unsorted_count": counts.get(None, 0),
    }


@router.post("", response_model=SavedItemResponse)
async def save_item(body: SaveItemRequest, current_user: User = Depends(get_current_active_user)):
    """Save an item to Unsorted (or back to its collection when undoing a removal).

    Saving something already saved returns the existing item unchanged apart
    from its display fields, so a double tap stores one item.
    """
    db = get_database()
    collection_id = await _own_collection(db, current_user, body.collection_id)
    match = {"user_id": current_user.id, "kind": body.kind, "key": body.key}
    try:
        await db.saved_items.update_one(
            match,
            {
                "$set": {
                    "display_name": body.display_name,
                    "event_start": body.event_start,
                    "event_end": body.event_end,
                },
                "$setOnInsert": {"collection_id": collection_id, "saved_at": datetime.utcnow()},
            },
            upsert=True,
        )
    except DuplicateKeyError:
        pass  # a concurrent save won the race; the item exists either way
    return _item(await db.saved_items.find_one(match))


@router.delete("", response_model=SavedItemResponse)
async def unsave_by_key(
    kind: SavedKind = Query(...),
    key: str = Query(..., min_length=1, max_length=200),
    current_user: User = Depends(get_current_active_user),
):
    """Remove a saved item by what it points at (used by Save buttons)."""
    db = get_database()
    match = {"user_id": current_user.id, "kind": kind, "key": key}
    doc = await db.saved_items.find_one(match)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved item not found")
    await db.saved_items.delete_one({"_id": doc["_id"], "user_id": current_user.id})
    return _item(doc)


@router.get("/collections", response_model=List[CollectionResponse])
async def list_collections(current_user: User = Depends(get_current_active_user)):
    return (await list_saved(current_user))["collections"]


@router.post("/collections", response_model=CollectionResponse)
async def create_collection(body: CollectionRequest, current_user: User = Depends(get_current_active_user)):
    db = get_database()
    doc = {"user_id": current_user.id, "name": body.name.strip(), "created_at": datetime.utcnow()}
    result = await db.saved_collections.insert_one(doc)
    return CollectionResponse(id=str(result.inserted_id), name=doc["name"], count=0, created_at=doc["created_at"])


@router.patch("/collections/{collection_id}", response_model=CollectionResponse)
async def rename_collection(
    collection_id: str, body: CollectionRequest, current_user: User = Depends(get_current_active_user)
):
    db = get_database()
    oid = _oid(collection_id, "Collection")
    result = await db.saved_collections.update_one(
        {"_id": oid, "user_id": current_user.id}, {"$set": {"name": body.name.strip()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    doc = await db.saved_collections.find_one({"_id": oid, "user_id": current_user.id})
    count = await db.saved_items.count_documents({"user_id": current_user.id, "collection_id": oid})
    return CollectionResponse(id=collection_id, name=doc["name"], count=count, created_at=doc["created_at"])


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str, current_user: User = Depends(get_current_active_user)):
    """Delete a collection; its items move to Unsorted."""
    db = get_database()
    oid = _oid(collection_id, "Collection")
    result = await db.saved_collections.delete_one({"_id": oid, "user_id": current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    moved = await db.saved_items.update_many(
        {"user_id": current_user.id, "collection_id": oid}, {"$set": {"collection_id": None}}
    )
    return {"moved_to_unsorted": moved.modified_count}


@router.patch("/{item_id}", response_model=SavedItemResponse)
async def move_item(item_id: str, body: MoveItemRequest, current_user: User = Depends(get_current_active_user)):
    """Move an item to one of the student's collections, or to Unsorted."""
    db = get_database()
    oid = _oid(item_id, "Saved item")
    collection_id = await _own_collection(db, current_user, body.collection_id)
    result = await db.saved_items.update_one(
        {"_id": oid, "user_id": current_user.id}, {"$set": {"collection_id": collection_id}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved item not found")
    return _item(await db.saved_items.find_one({"_id": oid, "user_id": current_user.id}))


@router.delete("/{item_id}", response_model=SavedItemResponse)
async def unsave_item(item_id: str, current_user: User = Depends(get_current_active_user)):
    """Remove (unsave) an item; the response carries enough to undo it."""
    db = get_database()
    oid = _oid(item_id, "Saved item")
    doc = await db.saved_items.find_one({"_id": oid, "user_id": current_user.id})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved item not found")
    await db.saved_items.delete_one({"_id": oid, "user_id": current_user.id})
    return _item(doc)
