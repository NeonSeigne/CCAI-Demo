"""Tests for course visual ref builders."""

import unittest
from unittest.mock import patch

from app.api import visuals as visuals_module
from app.api.visuals import build_visuals


class BuildVisualsTests(unittest.TestCase):
    def test_grades_tool_emits_metric_and_chart_refs(self):
        visuals = build_visuals([
            {
                "name": "course_grades",
                "result": {
                    "course_identifier": "MUSIC 113",
                    "cumulative": {
                        "average_gpa": 3.8,
                        "total": 100,
                        "distribution": {"a": 80, "ab": 10, "b": 5, "bc": 0, "c": 3, "d": 1, "f": 1},
                    },
                    "terms": [
                        {"term_code": 1254, "average_gpa": 3.7, "total": 50},
                        {"term_code": 1252, "average_gpa": 3.9, "total": 50},
                    ],
                },
            }
        ])
        types = [v["type"] for v in visuals]
        self.assertEqual(
            types,
            [
                "course_gpa",
                "course_completion_rate",
                "course_a_rate",
                "course_class_size",
                "course_grade_distribution",
                "course_trends",
            ],
        )
        self.assertTrue(all(v["course"] == "MUSIC 113" for v in visuals))
        self.assertTrue(all(v.get("term") == "1254" for v in visuals))

    def test_prereq_tool_emits_only_the_flat_tree(self):
        visuals = build_visuals([
            {
                "name": "course_prerequisites",
                "result": {
                    "course_identifier": "COMPSCI 300",
                    "title": "Programming II",
                    "prereq_text": "COMPSCI 200",
                    "prerequisites": [{"identifier": "COMPSCI 200", "title": "Programming I"}],
                },
            }
        ])
        # Legacy prereq_tree spec; the pop-up's web reads prereq_tree from /api/catalog.
        self.assertEqual([v["type"] for v in visuals], ["prereq_tree"])
        self.assertEqual(visuals[0]["prerequisites"][0]["identifier"], "COMPSCI 200")

    def test_next_courses_tool_emits_tree(self):
        visuals = build_visuals([
            {
                "name": "course_next",
                "result": {
                    "course_identifier": "ART 100",
                    "title": "INTRODUCTION TO ART",
                    "note": "May still require additional courses.",
                    "next_courses": [
                        {"identifier": "ART 232", "title": "LIFE DRAWING I"},
                        {"identifier": "ART 376", "title": ""},
                    ],
                },
            }
        ])
        self.assertEqual(len(visuals), 1)
        self.assertEqual(visuals[0]["type"], "next_courses_tree")
        self.assertEqual(visuals[0]["course"], "ART 100")
        self.assertEqual(visuals[0]["next_courses"][0]["identifier"], "ART 232")
        self.assertIn("additional", visuals[0]["note"].lower())

    def test_next_courses_empty_skipped(self):
        visuals = build_visuals([
            {
                "name": "course_next",
                "result": {
                    "course_identifier": "ART 100",
                    "next_courses": [],
                    "has_next_courses": False,
                },
            }
        ])
        self.assertEqual(visuals, [])

    def test_sections_tool_emits_schedule_and_instructors(self):
        visuals = build_visuals([
            {
                "name": "course_sections",
                "result": {
                    "course_identifier": "MUSIC 113",
                    "sections": [{"section": "LEC 001", "term": "1254"}],
                },
            }
        ])
        self.assertEqual(
            [v["type"] for v in visuals],
            ["course_schedule", "course_instructors"],
        )

    def test_search_emits_no_similar_card(self):
        multi = build_visuals([
            {
                "name": "course_search",
                "result": {
                    "courses": [
                        {"identifier": "MUSIC 113"},
                        {"identifier": "MUSIC 114"},
                    ],
                },
            }
        ])
        self.assertEqual(multi, [])

        single = build_visuals([
            {
                "name": "course_search",
                "result": {"courses": [{"identifier": "MUSIC 113"}]},
            }
        ])
        # No catalog source lists similar courses, so the card would be empty.
        self.assertEqual(single, [])

    def test_errors_and_unknown_tools_are_skipped(self):
        visuals = build_visuals([
            {"name": "course_grades", "result": {"error": "missing db"}},
            {"name": "unknown_tool", "result": {"course_identifier": "X"}},
        ])
        self.assertEqual(visuals, [])



class EveryProviderTests(unittest.TestCase):
    """R7: course cards hydrate from /api/catalog/{id}, served for every school."""

    def test_snapshot_grades_emit_cards_without_course_pages(self):
        result = {
            "course_identifier": "CS 2100",
            "data_as_of": "2026-07-02",
            "cumulative": {"average_gpa": 3.25, "distribution": {"A+": 30, "A": 60, "DFW": 20}},
            "terms": [
                {"term_code": "2026 Spring", "average_gpa": 3.0},
                {"term_code": "2025 Fall", "average_gpa": 3.5},
            ],
        }
        with patch.object(visuals_module.academics, "links_to_course_pages", return_value=False):
            visuals = build_visuals([{"name": "course_grades", "result": result}])
        self.assertEqual(len(visuals), 6)
        self.assertEqual({v["term"] for v in visuals}, {"2026 Spring"})

    def test_cu_single_course_emits_schedule_cards(self):
        result = {"courses": [
            {"course_code": "CSCI 2270", "section": "100"},
            {"course_code": "CSCI  2270", "section": "200"},
        ]}
        visuals = build_visuals([{"name": "search_courses", "result": result}])
        self.assertEqual([(v["type"], v["course"]) for v in visuals], [
            ("course_schedule", "CSCI 2270"), ("course_instructors", "CSCI 2270"),
        ])

    def test_cu_subject_listing_emits_none(self):
        result = {"courses": [{"course_code": "CSCI 2270"}, {"course_code": "CSCI 3104"}]}
        self.assertEqual(build_visuals([{"name": "search_courses", "result": result}]), [])


if __name__ == "__main__":
    unittest.main()
