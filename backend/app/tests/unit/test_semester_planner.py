"""Unit tests for semester planner core logic."""

import unittest
from unittest.mock import AsyncMock

from app.core import semester_planner as planner


SAMPLE_TRANSCRIPT = """
University of Wisconsin-Madison Unofficial Transcript
COMP SCI 200    Intro Programming          A     3
MATH 221        Calculus I                 AB    5
MATH 222        Calculus II                B     4
COMP SCI 300    Programming II             A     3
ENGL 100        Intro Composition          A     3
Cumulative GPA: 3.45
"""


def _course(
    identifier,
    *,
    difficulty="medium",
    score=0.4,
    program_id="economics_ba",
    program_type="major",
    category="core",
    priority=1,
    avg_gpa=3.0,
    a_rate=25.0,
):
    return {
        "identifier": identifier,
        "title": identifier,
        "credits": 3,
        "difficulty": difficulty,
        "difficulty_score": score,
        "avg_gpa": avg_gpa,
        "a_rate": a_rate,
        "reason": "test",
        "priority": priority,
        "program_id": program_id,
        "program_name": program_id,
        "program_type": program_type,
        "requirement_id": "req",
        "requirement_title": "Req",
        "category": category,
    }


class SemesterPlannerTests(unittest.IsolatedAsyncioTestCase):
    def test_list_programs(self):
        data = planner.list_programs()
        self.assertEqual(len(data["programs"]), 7)

    def test_easy_requires_high_gpa_and_a_rate(self):
        self.assertEqual(planner.classify_difficulty(3.6, 75), "easy")
        self.assertNotEqual(planner.classify_difficulty(3.6, 50), "easy")
        self.assertNotEqual(planner.classify_difficulty(3.2, 80), "easy")
        self.assertNotEqual(planner.classify_difficulty(None, 90), "easy")
        self.assertNotEqual(planner.classify_difficulty(3.9, None), "easy")

    def test_parse_transcript_regex(self):
        parsed = planner.parse_transcript_regex(SAMPLE_TRANSCRIPT)
        ids = {c["identifier"] for c in parsed["courses_completed"]}
        self.assertIn("COMP SCI 200", ids)
        self.assertEqual(parsed["cumulative_gpa"], 3.45)

    def test_match_requirements(self):
        program = planner.load_program("comp_sci_bs")
        completed = ["COMP SCI 200", "MATH 221", "MATH 222", "COMP SCI 300", "ENGL 100"]
        status = planner.match_requirements([program], completed)
        calc = next(r for r in status["satisfied"] if r["requirement_id"] == "cs_calc")
        self.assertEqual(calc["completed_count"], 2)
        self.assertTrue(any(r.get("category") for r in status["remaining"] + status["satisfied"]))

    def test_core_pack_balances_major_and_certificate(self):
        pool = [
            _course("ECON 301", program_id="economics_ba", program_type="major", category="core"),
            _course("ECON 302", program_id="economics_ba", program_type="major", category="core"),
            _course("ECON 310", program_id="economics_ba", program_type="major", category="core"),
            _course(
                "COMP SCI 300",
                program_id="cert_computer_sciences",
                program_type="certificate",
                category="core",
            ),
            _course(
                "COMP SCI 400",
                program_id="cert_computer_sciences",
                program_type="certificate",
                category="core",
                difficulty="hard",
                score=0.7,
                avg_gpa=2.8,
                a_rate=15,
            ),
            _course(
                "COMP SCI 407",
                program_id="cert_computer_sciences",
                program_type="certificate",
                category="elective",
                priority=2,
            ),
            _course(
                "STAT 240",
                program_id="economics_ba",
                program_type="major",
                category="gened",
                priority=2,
            ),
        ]
        options = planner.build_options(pool, "balanced")
        core = next(o for o in options if o["strategy"] == "core")
        programs = {c["program_id"] for c in core["courses"]}
        self.assertIn("economics_ba", programs)
        self.assertIn("cert_computer_sciences", programs)
        self.assertLessEqual(core["hard_count"], 2)

    def test_gened_and_explore_strategies_differ(self):
        pool = [
            _course("ECON 301", category="core"),
            _course("ECON 302", category="core"),
            _course(
                "PHILOS 210",
                category="gened",
                difficulty="easy",
                score=0.1,
                avg_gpa=3.7,
                a_rate=80,
                priority=1,
            ),
            _course(
                "HISTORY 102",
                category="gened",
                difficulty="easy",
                score=0.1,
                avg_gpa=3.8,
                a_rate=85,
                priority=1,
            ),
            _course(
                "COM ARTS 100",
                category="gened",
                difficulty="medium",
                score=0.3,
                avg_gpa=3.4,
                a_rate=55,
                priority=2,
            ),
            _course(
                "ECON 410",
                category="elective",
                priority=2,
                program_id="economics_ba",
            ),
            _course(
                "ECON 450",
                category="elective",
                priority=2,
                program_id="economics_ba",
            ),
            _course(
                "POLI SCI 104",
                category="elective",
                priority=2,
                program_id="economics_ba",
            ),
            _course(
                "STAT 240",
                category="elective",
                priority=2,
                program_id="economics_ba",
            ),
        ]
        options = planner.build_options(pool, "balanced")
        by_strategy = {o["strategy"]: o for o in options}
        self.assertIn("gened", by_strategy)
        self.assertIn("explore", by_strategy)
        gened_cats = [c["category"] for c in by_strategy["gened"]["courses"]]
        self.assertTrue(any(cat == "gened" for cat in gened_cats))
        explore_ids = {c["identifier"] for c in by_strategy["explore"]["courses"]}
        gened_ids = {c["identifier"] for c in by_strategy["gened"]["courses"]}
        # Strategies should not be identical sets
        self.assertNotEqual(explore_ids, gened_ids)

    def test_projection_marks_requirement_satisfied(self):
        status = {
            "satisfied": [],
            "remaining": [
                {
                    "program_id": "economics_ba",
                    "program_name": "Economics",
                    "requirement_id": "econ_core",
                    "title": "Core",
                    "rule": "all_of",
                    "needed": 2,
                    "completed_count": 1,
                    "matched_courses": ["ECON 301"],
                    "candidate_courses": ["ECON 301", "ECON 302"],
                    "remaining_courses": ["ECON 302"],
                    "category": "core",
                }
            ],
            "in_progress": [],
        }
        projected = planner.project_requirements_with_plan(status, ["ECON 302"])
        self.assertEqual(len(projected["satisfied"]), 1)
        self.assertTrue(projected["satisfied"][0]["projected_satisfied"])
        self.assertEqual(len(projected["newly_satisfied"]), 1)

    async def test_llm_refine_invalid_falls_back(self):
        pool = [
            _course("ECON 301"),
            _course("ECON 302"),
            _course("ECON 310"),
            _course("STAT 240", category="gened"),
        ]
        draft = planner.build_options(pool, "balanced")
        llm = AsyncMock(return_value="not-json")
        refined = await planner.refine_options_with_llm(
            profile={"major_id": "economics_ba"},
            requirements_status={"remaining": []},
            pool=pool,
            draft_options=draft,
            challenge="balanced",
            llm_generate=llm,
        )
        self.assertEqual([o["id"] for o in refined], [o["id"] for o in draft])

    def test_mutate_remove_and_add(self):
        plan = planner.create_plan_shell(
            major_id="economics_ba",
            certificate_ids=["cert_computer_sciences"],
            year="junior",
            transcript_text=SAMPLE_TRANSCRIPT,
            transcript_filename="t.txt",
        )
        pool = [
            _course("ECON 301"),
            _course("ECON 302"),
            _course(
                "COMP SCI 400",
                program_id="cert_computer_sciences",
                program_type="certificate",
            ),
        ]
        options = planner.build_options(pool, "balanced")
        plan["options"] = options
        plan["selected_option_id"] = options[0]["id"]
        plan["_candidate_pool"] = pool
        plan["requirements_status"] = {
            "satisfied": [],
            "remaining": [
                {
                    "program_id": "economics_ba",
                    "program_name": "Economics",
                    "requirement_id": "econ_core",
                    "title": "Core",
                    "rule": "n_of",
                    "needed": 2,
                    "completed_count": 0,
                    "matched_courses": [],
                    "candidate_courses": ["ECON 301", "ECON 302"],
                    "remaining_courses": ["ECON 301", "ECON 302"],
                    "category": "core",
                }
            ],
            "in_progress": [],
        }
        planner.save_plan(plan)
        first = options[0]["courses"][0]["identifier"]
        updated = planner.mutate_courses(plan["plan_id"], action="remove", identifier=first)
        selected = next(o for o in updated["options"] if o["id"] == updated["selected_option_id"])
        self.assertNotIn(first, {c["identifier"] for c in selected["courses"]})
        self.assertIn("requirements_projection", updated)


if __name__ == "__main__":
    unittest.main()
