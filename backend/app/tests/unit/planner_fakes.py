"""Fakes shared by the planner tests: course facts, program files, plans, Mongo.

``Program`` and ``Rule`` mirror lane B's frozen dataclasses in
``app/planner/programs.py`` (CONTRACTS.md), so the checker is tested against
the contract rather than the loader.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.planner.facts import CourseFacts, Meeting, Section

TERM = "Spring 2027"


@dataclass(frozen=True)
class Rule:
    id: str
    title: str
    kind: str
    courses: Tuple[str, ...] = ()
    n: Optional[int] = None
    credits: Optional[float] = None
    subjects: Tuple[str, ...] = ()
    min_level: Optional[int] = None
    max_level: Optional[int] = None
    exclude: Tuple[str, ...] = ()
    groups: Tuple[Tuple[str, ...], ...] = ()
    min_grade: Optional[str] = None
    double_count: bool = False


@dataclass(frozen=True)
class Program:
    id: str
    name: str
    type: str = "major"
    catalog_year: int = 2026
    source_url: str = "https://example.edu/econ"
    checked_on: str = "2026-10-28"
    total_credits: Optional[int] = 120
    rules: Tuple[Rule, ...] = ()


def course(identifier: str, **kw: Any) -> CourseFacts:
    """Known course facts with sensible defaults (3 credits, offered, no prereqs)."""
    base = dict(known="yes", title=f"{identifier} title", credits=(3.0, 3.0), offered="yes",
                prereq_known=True, prereq_tree=None, gen_ed=[])
    base.update(kw)
    return CourseFacts(identifier=identifier, **base)


def section(sid: str, kind: str = "lecture", meetings=(("Mo", "09:00", "09:50"),), requires=()) -> Section:
    mtgs = None if meetings is None else tuple(Meeting(d, s, e) for d, s, e in meetings)
    return Section(id=sid, kind=kind, meetings=mtgs, requires=tuple(requires))


def plan(courses=(), completed=(), programs=(), term: str = TERM) -> Dict[str, Any]:
    """A plan document; ``courses`` items are ids or (id, term) or (id, term, sections)."""
    rows = []
    for item in courses:
        if isinstance(item, str):
            item = (item, term)
        cid, cterm, *rest = item
        rows.append({"id": cid, "term": cterm, "sections": rest[0] if rest else None})
    done = []
    for item in completed:
        if isinstance(item, str):
            item = (item, None)
        done.append({"id": item[0], "grade": item[1], "term": None})
    return {
        "user_id": "u", "school": "uva", "revision": 0, "term": term,
        "profile": {"program_ids": [p for p in programs], "catalog_year": None, "class_year": None,
                    "completed": done, "interests": {"text": "", "tags": []}},
        "courses": rows, "undo": {"stack": [], "pointer": 0}, "proposal": None,
    }


def fake_provider(facts: Dict[str, CourseFacts]):
    """A ``course_facts`` stand-in answering from ``facts``; unknown ids are known="no"."""

    async def provider(ids: List[str], term: str) -> Dict[str, CourseFacts]:
        return {i: facts.get(i) or CourseFacts(identifier=i, known="no") for i in ids}

    return provider


# ---------------------------------------------------------------------------
# Mongo
# ---------------------------------------------------------------------------


def _value(doc: Dict[str, Any], dotted: str) -> Any:
    for part in dotted.split("."):
        if not isinstance(doc, dict):
            return None
        doc = doc.get(part)
    return doc


class FakePlans:
    """Just enough of a Motor collection for ``store``: equality filters, ``$set``,
    ``find_one_and_update`` returning the document after, a unique (user_id, school) index."""

    def __init__(self):
        self.docs: List[Dict[str, Any]] = []
        self.indexes: List[Tuple[Any, Dict[str, Any]]] = []

    def _matches(self, doc, flt):
        return all(_value(doc, k) == v for k, v in flt.items())

    async def create_index(self, keys, **kw):
        self.indexes.append((keys, kw))

    async def find_one(self, flt):
        return next((copy.deepcopy(d) for d in self.docs if self._matches(d, flt)), None)

    async def insert_one(self, doc):
        if any(d["user_id"] == doc["user_id"] and d["school"] == doc["school"] for d in self.docs):
            raise DuplicateKeyError("plans user_id_school")
        doc = copy.deepcopy(dict(doc, _id=doc.get("_id", ObjectId())))
        self.docs.append(doc)
        return SimpleNamespace(inserted_id=doc["_id"])

    async def find_one_and_update(self, flt, update, return_document=None):
        for doc in self.docs:
            if self._matches(doc, flt):
                doc.update(copy.deepcopy(update["$set"]))
                return copy.deepcopy(doc)
        return None
