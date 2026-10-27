"""Tests for the authenticated course-detail aggregate API."""

import json
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.api.routes import courses
from app.tools import _uw_source


FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "uw_coursemap"
# Trimmed from the live https://uwcourses.com/courses/COMPSCI_300.json payload.
COURSE_PAGE = json.loads((FIXTURES / "COMPSCI_300.json").read_text())


def fake_coursemap(page=COURSE_PAGE):
    async def fetch(path, *, params=None, optional=False):
        if path == "/courses/COMPSCI_300.json":
            return page
        if optional:
            return None
        raise FileNotFoundError(path)

    return fetch


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


class CourseDetailPayloadTests(unittest.IsolatedAsyncioTestCase):
    async def payload(self, term=None, page=COURSE_PAGE):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap(page)):
            return await courses._build_course_payload("COMPSCI_300", term)

    async def test_maps_live_record_to_page_shape(self):
        payload = await self.payload()
        course = payload["course"]
        self.assertEqual(course["course_reference"], {"subjects": ["COMPSCI"], "course_number": 300})
        self.assertEqual(course["course_title"], "PROGRAMMING II")
        self.assertTrue(course["description"])
        self.assertIn({"subjects": ["COMPSCI"], "course_number": 200},
                      course["prerequisites"]["course_references"])
        self.assertIn({"subjects": ["COMPSCI"], "course_number": 320}, course["satisfies"])
        self.assertGreater(course["cumulative_grade_data"]["total"], 0)
        self.assertEqual(payload["source"]["url"], "https://uwcourses.com")

    async def test_selects_latest_graded_term_by_default(self):
        payload = await self.payload()
        self.assertEqual(payload["selected_term"], "1264")
        self.assertEqual(payload["selected_term_label"], "Spring 2026")
        self.assertTrue(payload["course"]["term_data"]["1264"]["grade_data"]["total"])
        # Spring 2026 has grades but no sections yet; the schedule falls back to Fall 2026.
        self.assertEqual(len(payload["meetings"]), 3)

    async def test_requested_term_is_selected_when_available(self):
        payload = await self.payload(term="1272")
        self.assertEqual(payload["selected_term"], "1272")
        self.assertEqual(payload["selected_term_label"], "Fall 2026")
        self.assertEqual([m["name"] for m in payload["meetings"]], ["LEC 001", "LEC 002", "LEC 003"])
        self.assertEqual(payload["meetings"][0]["current_enrollment"], 146)

    async def test_instructors_carry_ratings(self):
        payload = await self.payload()
        self.assertEqual(payload["instructors"][0]["name"], "Jim Williams")
        self.assertIsNotNone(payload["instructors"][0]["rmp_data"]["average_rating"])

    async def test_meetings_do_not_invent_section_instructors(self):
        # Course Map lists instructors per course, not per section.
        payload = await self.payload(term="1272")
        self.assertTrue(all(m["instructors"] == [] for m in payload["meetings"]))

    async def test_unknown_course_maps_to_404(self):
        async def missing(path, *, params=None, optional=False):
            if optional:
                return None
            raise FileNotFoundError(path)

        with patch.object(_uw_source, "_fetch_json", side_effect=missing):
            with self.assertRaises(HTTPException) as context:
                await courses._build_course_payload("BOGUS_999", None)
        self.assertEqual(context.exception.status_code, 404)

    async def test_upstream_outage_maps_to_502(self):
        with patch.object(_uw_source, "_fetch_json", new=AsyncMock(side_effect=RuntimeError("down"))):
            with self.assertRaises(HTTPException) as context:
                await courses._build_course_payload("COMPSCI_300", None)
        self.assertEqual(context.exception.status_code, 502)

    async def test_route_maps_bad_identifier_to_400(self):
        with self.assertRaises(HTTPException) as context:
            await courses.get_course_detail("../../secret", None, object())
        self.assertEqual(context.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
