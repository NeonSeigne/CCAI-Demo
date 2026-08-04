"""Tests for the authenticated course-detail aggregate API."""

import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.api.routes import courses


COURSE = {
    "course_reference": {"subjects": ["MUSIC"], "course_number": 113},
    "course_title": "MUSIC IN PERFORMANCE",
    "description": "Descriptive lectures on chamber music.",
    "similar_courses": [{"subjects": ["MUSIC"], "course_number": 269}],
    "term_data": {
        "1254": {
            "grade_data": {
                "total": 10,
                "a": 9,
                "instructors": ["Johanna Wienholts", "Unknown Person"],
            },
            "enrollment_data": None,
        },
        "1264": {
            "grade_data": None,
            "enrollment_data": {
                "credit_count": [1, 1],
                "instructors": {"Johanna Wienholts": "teacher@wisc.edu"},
            },
        },
    },
}


class CourseIdentifierTests(unittest.TestCase):
    def test_normalizes_spaced_and_crosslisted_identifiers(self):
        self.assertEqual(courses.sanitize_course_identifier("COMP SCI 300"), "COMPSCI_300")
        self.assertEqual(
            courses.sanitize_course_identifier("COMP SCI/MATH 240"),
            "COMPSCI_MATH_240",
        )

    def test_rejects_invalid_identifiers(self):
        with self.assertRaises(ValueError):
            courses.sanitize_course_identifier("../../secret")
        with self.assertRaises(ValueError):
            courses.sanitize_course_identifier("MUSIC")


class CoursePayloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_aggregates_optional_resources_and_sorts_instructors(self):
        async def fake_fetch(path, optional=False):
            values = {
                "/terms.json": {"1254": "Spring 2025", "1264": "Spring 2026"},
                "/course/MUSIC_113.json": COURSE,
                "/graphs/course/MUSIC_113.json": [{"data": {"id": "MUSIC 113"}}],
                "/styles/MUSIC.json": [{"MUSIC": "#000000"}],
                "/course/MUSIC_113/meetings.json": [{"name": "LEC 001"}],
                "/instructors/JOHANNA_WIENHOLTS.json": {
                    "name": "Johanna Wienholts",
                    "rmp_data": {"average_rating": 4.8},
                },
                "/instructors/UNKNOWN_PERSON.json": None,
                "/course/MUSIC_269.json": {
                    "course_reference": {"subjects": ["MUSIC"], "course_number": 269},
                    "course_title": "STRING ENSEMBLE",
                },
            }
            return values.get(path)

        with patch.object(courses, "_fetch_json", side_effect=fake_fetch):
            payload = await courses._build_course_payload("MUSIC_113", None)

        self.assertEqual(payload["selected_term"], "1254")
        self.assertEqual(payload["selected_term_label"], "Spring 2025")
        self.assertEqual(payload["instructors"][0]["name"], "Johanna Wienholts")
        self.assertEqual(payload["instructors"][1]["name"], "Unknown Person")
        self.assertEqual(payload["meetings"][0]["name"], "LEC 001")
        self.assertEqual(payload["similar_courses"][0]["course_title"], "STRING ENSEMBLE")

    async def test_requested_term_is_selected_when_available(self):
        with patch.object(courses, "_fetch_json", new=AsyncMock()) as fetch:
            fetch.side_effect = lambda path, optional=False: (
                {"1254": "Spring 2025", "1264": "Spring 2026"}
                if path == "/terms.json"
                else COURSE if path == "/course/MUSIC_113.json" else None
            )
            payload = await courses._build_course_payload("MUSIC_113", "1264")
        self.assertEqual(payload["selected_term"], "1264")

    async def test_route_maps_bad_identifier_to_400(self):
        with self.assertRaises(HTTPException) as context:
            await courses.get_course_detail("../../secret", None, object())
        self.assertEqual(context.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
