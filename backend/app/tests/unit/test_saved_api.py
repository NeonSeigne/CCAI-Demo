import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException

from app.api.routes import saved
from app.models.saved import CollectionRequest, MoveItemRequest, SaveItemRequest
from app.models.user import User


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, field, direction):
        self.docs.sort(key=lambda d: d[field], reverse=direction < 0)
        return self

    async def to_list(self, length):
        return list(self.docs)


class _Collection:
    """Just enough of a Motor collection for the saved routes: equality filters, $set, $setOnInsert."""

    def __init__(self):
        self.docs = []

    def _matches(self, doc, flt):
        return all(doc.get(k) == v for k, v in flt.items())

    def find(self, flt):
        return _Cursor([dict(d) for d in self.docs if self._matches(d, flt)])

    async def find_one(self, flt):
        return next((dict(d) for d in self.docs if self._matches(d, flt)), None)

    async def insert_one(self, doc):
        doc = dict(doc, _id=doc.get("_id", ObjectId()))
        self.docs.append(doc)
        return SimpleNamespace(inserted_id=doc["_id"])

    async def update_one(self, flt, update, upsert=False):
        for doc in self.docs:
            if self._matches(doc, flt):
                doc.update(update.get("$set", {}))
                return SimpleNamespace(matched_count=1, modified_count=1)
        if upsert:
            self.docs.append({**flt, **update.get("$set", {}), **update.get("$setOnInsert", {}), "_id": ObjectId()})
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def update_many(self, flt, update):
        hits = [d for d in self.docs if self._matches(d, flt)]
        for doc in hits:
            doc.update(update["$set"])
        return SimpleNamespace(modified_count=len(hits))

    async def delete_one(self, flt):
        for doc in self.docs:
            if self._matches(doc, flt):
                self.docs.remove(doc)
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def count_documents(self, flt):
        return sum(1 for d in self.docs if self._matches(d, flt))


def _user():
    return User(_id=ObjectId(), firstName="T", lastName="U", email="t@example.com", hashed_password="x")


def _event(key="2026-10-27:226193@calendar.wisc.edu", **kw):
    return SaveItemRequest(
        kind="event", key=key, display_name="Witch's Brew: Slime Making",
        event_start=datetime(2026, 10, 27, 20, 0), event_end=datetime(2026, 10, 27, 22, 0), **kw,
    )


class SavedRoutesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = SimpleNamespace(saved_items=_Collection(), saved_collections=_Collection())
        patcher = patch.object(saved, "get_database", return_value=self.db)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.alice, self.bob = _user(), _user()

    async def test_save_lands_in_unsorted_and_double_save_stores_one(self):
        first = await saved.save_item(_event(), self.alice)
        second = await saved.save_item(_event(), self.alice)
        self.assertEqual(first.id, second.id)
        self.assertIsNone(first.collection_id)
        listing = await saved.list_saved(self.alice)
        self.assertEqual(len(listing["items"]), 1)
        self.assertEqual(listing["unsorted_count"], 1)

    async def test_display_fields_are_kept_for_fallback(self):
        item = await saved.save_item(_event(), self.alice)
        self.assertEqual(item.display_name, "Witch's Brew: Slime Making")
        self.assertEqual(item.event_end, datetime(2026, 10, 27, 22, 0))

    async def test_move_to_own_collection_and_back_to_unsorted(self):
        item = await saved.save_item(_event(), self.alice)
        week = await saved.create_collection(CollectionRequest(name="This week"), self.alice)
        moved = await saved.move_item(item.id, MoveItemRequest(collection_id=week.id), self.alice)
        self.assertEqual(moved.collection_id, week.id)
        back = await saved.move_item(item.id, MoveItemRequest(collection_id=None), self.alice)
        self.assertIsNone(back.collection_id)

    async def test_cannot_move_into_another_students_collection(self):
        item = await saved.save_item(_event(), self.alice)
        bobs = await saved.create_collection(CollectionRequest(name="Bob's"), self.bob)
        with self.assertRaises(HTTPException) as ctx:
            await saved.move_item(item.id, MoveItemRequest(collection_id=bobs.id), self.alice)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_other_students_cannot_read_move_or_delete(self):
        item = await saved.save_item(_event(), self.alice)
        self.assertEqual((await saved.list_saved(self.bob))["items"], [])
        for call in (
            saved.move_item(item.id, MoveItemRequest(collection_id=None), self.bob),
            saved.unsave_item(item.id, self.bob),
            saved.unsave_by_key("event", item.key, self.bob),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await call
            self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(len((await saved.list_saved(self.alice))["items"]), 1)

    async def test_deleting_a_collection_moves_its_items_to_unsorted(self):
        item = await saved.save_item(_event(), self.alice)
        week = await saved.create_collection(CollectionRequest(name="This week"), self.alice)
        await saved.move_item(item.id, MoveItemRequest(collection_id=week.id), self.alice)
        result = await saved.delete_collection(week.id, self.alice)
        self.assertEqual(result, {"moved_to_unsorted": 1})
        listing = await saved.list_saved(self.alice)
        self.assertEqual(listing["collections"], [])
        self.assertIsNone(listing["items"][0].collection_id)

    async def test_item_left_pointing_at_a_deleted_collection_shows_in_unsorted(self):
        # A move validated before the collection was deleted, written after.
        item = await saved.save_item(_event(), self.alice)
        week = await saved.create_collection(CollectionRequest(name="This week"), self.alice)
        await saved.delete_collection(week.id, self.alice)
        self.db.saved_items.docs[0]["collection_id"] = ObjectId(week.id)
        listing = await saved.list_saved(self.alice)
        self.assertIsNone(listing["items"][0].collection_id)
        self.assertEqual(listing["unsorted_count"], 1)

    async def test_unsave_returns_the_item_and_undo_restores_its_collection(self):
        item = await saved.save_item(_event(), self.alice)
        week = await saved.create_collection(CollectionRequest(name="This week"), self.alice)
        await saved.move_item(item.id, MoveItemRequest(collection_id=week.id), self.alice)
        removed = await saved.unsave_by_key("event", item.key, self.alice)
        self.assertEqual(removed.collection_id, week.id)
        self.assertEqual((await saved.list_saved(self.alice))["items"], [])
        restored = await saved.save_item(_event(collection_id=week.id), self.alice)
        self.assertEqual(restored.collection_id, week.id)

    async def test_rename_collection_and_counts(self):
        await saved.save_item(_event(), self.alice)
        week = await saved.create_collection(CollectionRequest(name="This week"), self.alice)
        renamed = await saved.rename_collection(week.id, CollectionRequest(name="  Next week "), self.alice)
        self.assertEqual(renamed.name, "Next week")
        self.assertEqual(renamed.count, 0)

    async def test_bad_ids_are_not_found(self):
        for call in (
            saved.move_item("not-an-id", MoveItemRequest(), self.alice),
            saved.unsave_item("not-an-id", self.alice),
            saved.delete_collection("not-an-id", self.alice),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await call
            self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
