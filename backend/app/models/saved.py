"""Saved courses, events and places, filed into user-named collections.

Each item has one home: a collection, or Unsorted when ``collection_id`` is
None. Items are looked up live when shown; ``display_name`` and the event
times are kept only so an item can still be named once its source drops it.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

SavedKind = Literal["course", "event", "place"]


class SaveItemRequest(BaseModel):
    kind: SavedKind
    key: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=200)
    event_start: Optional[datetime] = None
    event_end: Optional[datetime] = None
    # Set when undoing a removal, so the item returns to where it was.
    collection_id: Optional[str] = None


class MoveItemRequest(BaseModel):
    collection_id: Optional[str] = None  # None moves the item to Unsorted


class CollectionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class SavedItemResponse(BaseModel):
    id: str
    kind: SavedKind
    key: str
    display_name: str
    event_start: Optional[datetime] = None
    event_end: Optional[datetime] = None
    collection_id: Optional[str] = None
    saved_at: datetime


class CollectionResponse(BaseModel):
    id: str
    name: str
    count: int = 0
    created_at: datetime
