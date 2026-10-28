import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import HTTPException

from app.api.routes import planner as routes
from app.models.planner import EditRequest, ProposalRequest, UndoRequest
from app.models.user import User
from app.planner import service, store
from app.planner.facts import CourseFacts
from app.tests.unit.planner_fakes import TERM, FakePlans, Program, Rule, course, fake_provider

SCHOOL = "uva"
FACTS = {c: course(c) for c in ("ECON 2010", "ECON 3010", "ECON 3020", "ECON 3300", "ECON 4010", "ENVS 2800")}
FACTS["ECON 3300"] = course("ECON 3300", prereq_known=False)
FACTS["ENVS 2800"] = course("ENVS 2800", gen_ed=None, harder=True)
FACTS["ECON 5000"] = CourseFacts("ECON 5000", known="unavailable", unavailable_reason="Took too long to check")
ECON = Program("econ-ba", "Economics B.A.", rules=(
    Rule("el", "Economics electives", "level", subjects=("ECON",), min_level=3000, n=4),
))


def _user():
    return User(_id=ObjectId(), firstName="T", lastName="U", email="t@example.com", hashed_password="x")


def add(cid):
    return {"op": "add", "course": cid}


class PlannerApiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = SimpleNamespace(plans=FakePlans())
        patches = [
            patch.object(service, "get_database", return_value=self.db),
            patch.object(service, "facts_provider", fake_provider(FACTS)),
            patch.object(service, "default_term", return_value=TERM),
            patch.object(service, "credit_limits", return_value={"min": 12, "max": 18}),
            patch.object(service, "programs_for", side_effect=lambda school, ids: [ECON] if "econ-ba" in ids else []),
            patch.object(service, "list_programs", return_value=[ECON]),
            patch.object(routes, "_school", return_value=SCHOOL),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.alice, self.bob = _user(), _user()
        self.keys = iter(range(1000))

    async def edit(self, user, ops, revision=None):
        if revision is None:
            revision = (await routes.get_plan(user))["plan"]["revision"]
        body = EditRequest(ops=ops, expected_revision=revision, idempotency_key=f"k{next(self.keys)}")
        return await routes.post_edits(body, user)

    async def propose(self, user, ops):
        revision = (await routes.get_plan(user))["plan"]["revision"]
        return (await routes.post_proposal(ProposalRequest(ops=ops, expected_revision=revision), user))["proposal"]

    async def assert_409(self, call, **detail):
        with self.assertRaises(HTTPException) as ctx:
            await call
        self.assertEqual(ctx.exception.status_code, 409)
        for key, value in detail.items():
            self.assertEqual(ctx.exception.detail[key], value)
        return ctx.exception.detail

    # -- access ---------------------------------------------------------------

    async def test_other_student_cannot_read_or_edit(self):
        await self.edit(self.alice, [add("ECON 3010")])
        proposal = await self.propose(self.alice, [add("ECON 3020")])

        bobs = await routes.get_plan(self.bob)
        self.assertEqual(bobs["plan"]["courses"], [])
        self.assertIsNone(bobs["proposal"])
        self.assertNotIn("user_id", bobs["plan"])
        # Bob's accept/discard/undo only ever reach Bob's own plan.
        await self.assert_409(routes.accept_proposal(proposal["id"], {}, self.bob), status="refused")
        await self.assert_409(routes.discard_proposal(proposal["id"], self.bob), status="refused")
        await self.assert_409(routes.post_undo(UndoRequest(expected_revision=0), self.bob), status="refused")
        await self.edit(self.bob, [add("ECON 4010")])

        alices = await routes.get_plan(self.alice)
        self.assertEqual([c["id"] for c in alices["plan"]["courses"]], ["ECON 3010"])
        self.assertEqual(alices["proposal"]["id"], proposal["id"])
        self.assertEqual(len(self.db.plans.docs), 2)
        self.assertEqual({d["school"] for d in self.db.plans.docs}, {SCHOOL})

    # -- edits ----------------------------------------------------------------

    async def test_edit_returns_report_and_undo_label(self):
        result = await self.edit(self.alice, [{"op": "set_profile", "program_ids": ["econ-ba"]}, add("ECON 3010")])
        self.assertEqual(result["plan"]["revision"], 1)
        self.assertEqual(result["undo_label"], "Undo: updated your profile, added ECON 3010")
        self.assertEqual(result["report"]["rules"][0]["planned"], 1)
        self.assertEqual(result["report"]["courses"][0]["fills"], ["Fills: Economics electives"])

    async def test_revision_conflict_is_409(self):
        await self.edit(self.alice, [add("ECON 3010")])
        await self.assert_409(self.edit(self.alice, [add("ECON 3020")], revision=0), code="revision_conflict", revision=1)

    async def test_idempotency_key_repeat_returns_first_result(self):
        body = EditRequest(ops=[add("ECON 3010")], expected_revision=0, idempotency_key="same")
        first = await routes.post_edits(body, self.alice)
        again = await routes.post_edits(body, self.alice)  # retried request; stale revision is fine
        self.assertEqual(first["plan"]["revision"], 1)
        self.assertEqual(again["plan"]["revision"], 1)
        self.assertEqual(len(again["plan"]["courses"]), 1)

    async def test_unknown_and_unverified_courses_are_422(self):
        for cid, code in (("ECON 9999", "unknown_course"), ("ECON 5000", "couldnt_verify_course")):
            with self.subTest(code=code):
                with self.assertRaises(HTTPException) as ctx:
                    await self.edit(self.alice, [add(cid)])
                self.assertEqual(ctx.exception.status_code, 422)
                self.assertEqual(ctx.exception.detail["code"], code)
        with self.assertRaises(HTTPException):
            await self.propose(self.alice, [add("ECON 5000")])
        self.assertIsNone((await routes.get_plan(self.alice))["proposal"])

    # -- proposals ------------------------------------------------------------

    async def test_proposal_has_diff_and_is_stored_with_the_plan(self):
        await self.edit(self.alice, [add("ECON 3010")])
        proposal = await self.propose(self.alice, [{"op": "move", "course": "ECON 3010", "to_term": "Fall 2027"},
                                                   add("ECON 3300")])
        self.assertEqual(proposal["diff"]["heading"], "Move ECON 3010 to Fall 2027, add ECON 3300")
        self.assertIn("Prerequisites not published for ECON 3300", proposal["diff"]["unknowns"])
        self.assertEqual(proposal["base_revision"], 1)
        self.assertEqual((await routes.get_plan(self.alice))["proposal"]["id"], proposal["id"])

    async def test_new_proposal_replaces_the_old(self):
        old = await self.propose(self.alice, [add("ECON 3010")])
        new = await self.propose(self.alice, [add("ECON 3020")])
        self.assertNotEqual(old["id"], new["id"])
        await self.assert_409(routes.accept_proposal(old["id"], {}, self.alice),
                              status="refused", reason="This suggestion was replaced")
        result = await routes.accept_proposal(new["id"], {}, self.alice)
        self.assertEqual([c["id"] for c in result["plan"]["courses"]], ["ECON 3020"])
        self.assertIsNone((await routes.get_plan(self.alice))["proposal"])
        # An applied proposal can't be applied twice.
        await self.assert_409(routes.accept_proposal(new["id"], {}, self.alice), status="refused")

    async def test_proposal_expires_after_a_day(self):
        proposal = await self.propose(self.alice, [add("ECON 3010")])
        later = store.utcnow() + timedelta(hours=24, seconds=1)
        with patch.object(store, "utcnow", return_value=later):
            self.assertIsNone((await routes.get_plan(self.alice))["proposal"])
            await self.assert_409(routes.accept_proposal(proposal["id"], {}, self.alice),
                                  status="refused", reason="This suggestion expired; ask again")
        self.assertEqual(self.db.plans.docs[0]["proposal"]["status"], "expired")

    async def test_discard(self):
        proposal = await self.propose(self.alice, [add("ECON 3010")])
        closed = await routes.discard_proposal(proposal["id"], self.alice)
        self.assertEqual(closed["proposal"]["status"], "discarded")
        await self.assert_409(routes.accept_proposal(proposal["id"], {}, self.alice), status="refused")

    async def test_stale_accept_that_still_applies_needs_review(self):
        proposal = await self.propose(self.alice, [add("ECON 3300")])
        await self.edit(self.alice, [add("ECON 3010")])  # the plan moves on
        detail = await self.assert_409(routes.accept_proposal(proposal["id"], {}, self.alice), status="needs_review")
        self.assertEqual(detail["proposal"]["id"], proposal["id"])
        self.assertEqual(detail["proposal"]["base_revision"], 1)
        # Asked again with the refreshed diff, Accept now applies.
        result = await routes.accept_proposal(proposal["id"], {}, self.alice)
        self.assertEqual(sorted(c["id"] for c in result["plan"]["courses"]), ["ECON 3010", "ECON 3300"])

    async def test_stale_accept_that_no_longer_applies_is_refused(self):
        await self.edit(self.alice, [add("ECON 3010")])
        proposal = await self.propose(self.alice, [{"op": "remove", "course": "ECON 3010"}])
        await self.edit(self.alice, [{"op": "remove", "course": "ECON 3010"}])
        detail = await self.assert_409(routes.accept_proposal(proposal["id"], {}, self.alice), status="refused")
        self.assertIn("ECON 3010 isn't in your plan", detail["reason"])

    async def test_proposal_on_a_stale_revision_is_a_conflict(self):
        await self.edit(self.alice, [add("ECON 3010")])
        await self.assert_409(routes.post_proposal(ProposalRequest(ops=[add("ECON 3020")], expected_revision=0), self.alice),
                              code="revision_conflict")

    # -- undo -----------------------------------------------------------------

    async def test_undo_three_times_walks_back(self):
        for cid in ("ECON 3010", "ECON 3020", "ECON 4010"):
            await self.edit(self.alice, [add(cid)])
        labels, courses = [], []
        for _ in range(3):
            revision = (await routes.get_plan(self.alice))["plan"]["revision"]
            labels.append((await routes.get_plan(self.alice))["undo_label"])
            result = await routes.post_undo(UndoRequest(expected_revision=revision), self.alice)
            courses.append([c["id"] for c in result["plan"]["courses"]])
        self.assertEqual(labels, ["Undo: added ECON 4010", "Undo: added ECON 3020", "Undo: added ECON 3010"])
        self.assertEqual(courses, [["ECON 3010", "ECON 3020"], ["ECON 3010"], []])
        self.assertEqual(result["plan"]["revision"], 6)  # undo writes new revisions
        self.assertIsNone(result["undo_label"])
        await self.assert_409(routes.post_undo(UndoRequest(expected_revision=6), self.alice),
                              status="refused", reason="Nothing to undo")

    async def test_new_edit_clears_steps_after_the_pointer(self):
        for cid in ("ECON 3010", "ECON 3020", "ECON 4010"):
            await self.edit(self.alice, [add(cid)])
        await routes.post_undo(UndoRequest(expected_revision=3), self.alice)
        result = await self.edit(self.alice, [add("ENVS 2800")])
        undo = result["plan"]["undo"]
        self.assertEqual([e["label"] for e in undo["stack"]],
                         ["Undo: added ECON 3010", "Undo: added ECON 3020", "Undo: added ENVS 2800"])
        self.assertEqual(undo["pointer"], 3)

    async def test_undo_stack_keeps_twenty(self):
        plan = await store.get_or_create(self.db, "u", SCHOOL, term=TERM)
        for i in range(25):
            plan, _ = await store.commit_edit(self.db, "u", SCHOOL, [add(f"ECON {3000 + i}")],
                                              expected_revision=plan["revision"])
        self.assertEqual(len(plan["undo"]["stack"]), store.UNDO_DEPTH)
        self.assertEqual(plan["undo"]["pointer"], store.UNDO_DEPTH)

    async def test_undo_on_a_stale_revision_is_a_conflict(self):
        await self.edit(self.alice, [add("ECON 3010")])
        await self.assert_409(routes.post_undo(UndoRequest(expected_revision=0), self.alice), code="revision_conflict")

    # -- index, programs, chat entry points, suggestions ----------------------

    async def test_plans_index_is_unique_per_user_and_school(self):
        await store.ensure_indexes(self.db)
        self.assertEqual(self.db.plans.indexes, [([("user_id", 1), ("school", 1)], {"unique": True})])
        # A concurrent first visit hits the index and reads the winner's plan.
        await store.get_or_create(self.db, "u", SCHOOL, term=TERM)
        with patch.object(self.db.plans, "find_one", AsyncMock(side_effect=[None, {"user_id": "u"}])):
            self.assertEqual(await store.get_or_create(self.db, "u", SCHOOL, term=TERM), {"user_id": "u"})

    async def test_programs_listing(self):
        self.assertEqual(await routes.list_programs(self.alice), [{"id": "econ-ba", "name": "Economics B.A.", "type": "major"}])

    async def test_chat_entry_points(self):
        await self.edit(self.alice, [{"op": "set_profile", "program_ids": ["econ-ba"], "completed": [{"id": "ECON 2010", "grade": "B+"}]},
                                     add("ECON 3010")])
        uid = str(self.alice.id)
        proposal = await service.propose_for_user(uid, SCHOOL, [{"op": "move", "course": "ECON 3010", "to_term": "Fall 2027"}],
                                                  asked="drop")
        self.assertEqual(proposal["diff"]["literal_differs"], "You said drop; I moved ECON 3010 to Fall 2027")
        text, revision = await service.plan_summary(uid, SCHOOL)
        self.assertEqual(revision, 1)
        self.assertLessEqual(len(text), service.SUMMARY_LIMIT)
        for part in ("Economics B.A.", TERM, "ECON 2010 (B+)", "ECON 3010", proposal["id"]):
            self.assertIn(part, text)
        with self.assertRaises(store.RevisionConflict):
            await service.propose_for_user(uid, SCHOOL, [add("ECON 3020")], base_revision=0)

    async def test_summary_is_capped(self):
        plan = await store.get_or_create(self.db, str(self.alice.id), SCHOOL, term=TERM)
        await store.commit_edit(self.db, str(self.alice.id), SCHOOL,
                                [add(f"ECON {3000 + i}") for i in range(300)], expected_revision=plan["revision"])
        text, _ = await service.plan_summary(str(self.alice.id), SCHOOL)
        self.assertEqual(len(text), service.SUMMARY_LIMIT)
        self.assertIn("Pending suggestion: none", text)

    async def test_suggestions_repeat_checker_labels(self):
        from app.sources import academics

        found = {"courses": [{"identifier": "ENVS 2800"}, {"identifier": "ECON 3010"}, {"identifier": "ECON 9999"}]}
        await self.edit(self.alice, [{"op": "set_profile", "program_ids": ["econ-ba"]}, add("ECON 3010")])
        with patch.object(academics, "search_catalog", AsyncMock(return_value=found)) as search:
            result = await routes.get_suggestions("climate", None, self.alice)
        search.assert_awaited_once()
        self.assertEqual([i["id"] for i in result["items"]], ["ENVS 2800"])  # in plan and invented ids dropped
        item = result["items"][0]
        self.assertEqual(item["labels"], ["General elective credit", "Gen-ed: unknown", "Prerequisites met",
                                          "Offered Spring 2027", "In the school's hardest third by grades"])
        self.assertEqual(item["why"], "; ".join(item["labels"]))
        self.assertEqual(item["credits"], [3.0, 3.0])
        self.assertEqual(item["prereqs"]["status"], "met")


if __name__ == "__main__":
    unittest.main()
