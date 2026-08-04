"""Tests for course visual ref builders."""

import unittest

from app.api.visuals import build_visuals


class BuildVisualsTests(unittest.TestCase):
    def test_grades_tool_emits_metric_and_chart_refs(self):
        visuals = build_visuals([
            {
                "name": "uw_course_grades",
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

    def test_prereq_tool_emits_map_and_legacy_tree(self):
        visuals = build_visuals([
            {
                "name": "uw_prerequisites",
                "result": {
                    "course_identifier": "COMPSCI 300",
                    "title": "Programming II",
                    "prereq_text": "COMPSCI 200",
                    "prerequisites": [{"identifier": "COMPSCI 200", "title": "Programming I"}],
                },
            }
        ])
        self.assertEqual(visuals[0]["type"], "course_prereq_map")
        self.assertEqual(visuals[1]["type"], "prereq_tree")
        self.assertEqual(visuals[1]["prerequisites"][0]["identifier"], "COMPSCI 200")

    def test_sections_tool_emits_schedule_and_instructors(self):
        visuals = build_visuals([
            {
                "name": "uw_course_sections",
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

    def test_search_emits_similar_only_for_single_match(self):
        multi = build_visuals([
            {
                "name": "uw_search_courses",
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
                "name": "uw_search_courses",
                "result": {"courses": [{"identifier": "MUSIC 113"}]},
            }
        ])
        self.assertEqual(single, [{"type": "course_similar", "course": "MUSIC 113"}])

    def test_errors_and_unknown_tools_are_skipped(self):
        visuals = build_visuals([
            {"name": "uw_course_grades", "result": {"error": "missing db"}},
            {"name": "unknown_tool", "result": {"course_identifier": "X"}},
        ])
        self.assertEqual(visuals, [])


if __name__ == "__main__":
    unittest.main()
