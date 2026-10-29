"""Term-aware planning (eng review R13): per-term views and destination-term checks."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from bson import ObjectId

from app.api.routes import planner as routes
from app.models.planner import EditRequest, UndoRequest
from app.models.user import User
from app.planner import facts as facts_module
from app.planner import service
from app.planner.facts import CourseFacts
from app.tests.unit.planner_fakes import TERM, FakePlans, Program, Rule, course, section

SCHOOL = "uva"
FALL = "Fall 2027"
FACTS = {c: course(c) for c in ("ECON 2010", "ECON 3010", "ECON 3020", "ECON 3300", "ECON 4010")}
FACTS["ECON 3010"] = course("ECON 3010", sections=[section("001"), section("002", meetings=(("Tu", "10:00", "10:50"),))])
# Offered in spring only.
FALL_FACTS = dict(FACTS, **{"ECON 3010": course("ECON 3010", offered="no")})
ECON = Program("econ-ba", "Economics B.A.", rules=(
    Rule("el", "Economics electives", "level", subjects=("ECON",), min_level=3000, n=4),
))


def term_provider(calls=None):
    """Facts per term: ECON 3010 isn't offered in fall. Records (ids, term) calls."""

    async def provider(ids, term):
        if calls is not None:
            calls.append((tuple(ids), term))
        table = FALL_FACTS if term == FALL else FACTS
        return {i: table.get(i) or CourseFacts(identifier=i, known="no") for i in ids}

    return provider


def add(cid, term=None):
    op = {"op": "add", "course": cid}
    if term:
        op["term"] = term
    return op


class PlannerTestCase(unittest.IsolatedAsyncioTestCase):
    """The planner service on an in-memory store with term-aware facts."""

    def setUp(self):
        self.db = SimpleNamespace(plans=FakePlans())
        self.calls = []
        patches = [
            patch.object(service, "get_database", return_value=self.db),
            patch.object(service, "facts_provider", term_provider(self.calls)),
            patch.object(service, "default_term", return_value=TERM),
            patch.object(service, "credit_limits", return_value={"min": 12, "max": 18}),
            patch.object(service, "programs_for", side_effect=lambda school, ids: [ECON] if "econ-ba" in ids else []),
            patch.object(routes, "_school", return_value=SCHOOL),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.user = User(_id=ObjectId(), firstName="T", lastName="U", email="t@example.com", hashed_password="x")
        self.keys = iter(range(1000))

    async def revision(self):
        return (await routes.get_plan(self.user))["plan"]["revision"]

    async def edit(self, ops):
        body = EditRequest(ops=ops, expected_revision=await self.revision(), idempotency_key=f"k{next(self.keys)}")
        return await routes.post_edits(body, self.user)


class TermAwareTests(PlannerTestCase):
    async def test_per_term_view_returns_that_terms_courses_and_credits(self):
        await self.edit([add("ECON 3010"), add("ECON 3020", FALL), add("ECON 4010", FALL)])
        fall = (await routes.get_plan(self.user, term=FALL))["report"]
        self.assertEqual(fall["term"], FALL)
        self.assertEqual([c["id"] for c in fall["courses"]], ["ECON 3020", "ECON 4010"])
        self.assertEqual((fall["credits"]["min"], fall["credits"]["max"]), (6.0, 6.0))
        self.assertEqual(fall["later"], [{"id": "ECON 3010", "term": TERM}])
        spring = (await routes.get_plan(self.user))["report"]
        self.assertEqual([c["id"] for c in spring["courses"]], ["ECON 3010"])
        self.assertEqual({t for _, t in self.calls[-1:]}, {TERM})

    async def test_move_into_a_term_where_the_course_isnt_offered_is_flagged(self):
        await self.edit([add("ECON 3010")])
        result = await self.edit([{"op": "move", "course": "ECON 3010", "to_term": FALL}])
        self.assertIn("ECON 3010 isn't offered in Fall 2027", result["notes"])
        # The fall view reads the fall facts for the moved course.
        fall = (await routes.get_plan(self.user, term=FALL))["report"]
        self.assertEqual(fall["courses"][0]["offered"], "no")
        # The same move as a proposal carries the flag in its diff.
        revision = await self.revision()
        await routes.post_undo(UndoRequest(expected_revision=revision), self.user)
        proposal = await service.propose(str(self.user.id), SCHOOL, [{"op": "move", "course": "ECON 3010", "to_term": FALL}],
                                         expected_revision=await self.revision())
        self.assertIn("ECON 3010 isn't offered in Fall 2027", proposal["diff"]["unknowns"])

    async def test_add_checks_identity_in_its_own_term(self):
        result = await self.edit([add("ECON 3010", FALL)])
        self.assertIn("ECON 3010 isn't offered in Fall 2027", result["notes"])
        self.assertEqual(self.calls[0], (("ECON 3010",), FALL))

    async def test_move_clears_sections_and_undo_restores_them(self):
        await self.edit([add("ECON 3010"), {"op": "pick_section", "course": "ECON 3010", "sections": ["002"]}])
        moved = await self.edit([{"op": "move", "course": "ECON 3010", "to_term": FALL}])
        self.assertIsNone(moved["plan"]["courses"][0]["sections"])
        undone = await routes.post_undo(UndoRequest(expected_revision=moved["plan"]["revision"]), self.user)
        self.assertEqual(undone["plan"]["courses"][0], {"id": "ECON 3010", "term": TERM, "sections": ["002"]})

    async def test_move_keeps_sections_it_names(self):
        await self.edit([add("ECON 3010")])
        moved = await self.edit([{"op": "move", "course": "ECON 3010", "to_term": FALL, "sections": ["001"]}])
        self.assertEqual(moved["plan"]["courses"][0]["sections"], ["001"])

    async def test_two_term_edit_loads_both_terms_in_one_batch(self):
        batches = []
        real = facts_module.load_facts_by_term

        async def recording(wanted, **kw):
            batches.append({t: list(ids) for t, ids in wanted.items()})
            return await real(wanted, **kw)

        with patch.object(service, "load_facts_by_term", recording):
            await self.edit([add("ECON 3020", FALL), add("ECON 4010")])
            self.assertIn({FALL: ["ECON 3020"], TERM: ["ECON 4010"]}, batches)
            revision = await self.revision()
            batches.clear()
            await service.propose(str(self.user.id), SCHOOL, [add("ECON 3300", FALL), add("ECON 2010")],
                                  expected_revision=revision)
        self.assertEqual(len(batches), 1)
        self.assertEqual(set(batches[0]), {TERM, FALL})
        self.assertIn("ECON 3300", batches[0][FALL])
        self.assertEqual({t for _, t in self.calls if "ECON 3300" in _}, {FALL, TERM})

    async def test_pick_section_checks_the_courses_own_term(self):
        await self.edit([add("ECON 3020", FALL)])
        self.calls.clear()
        await self.edit([{"op": "pick_section", "course": "ECON 3020", "sections": ["001"]}])
        self.assertIn((("ECON 3020",), FALL), self.calls)


if __name__ == "__main__":
    unittest.main()
