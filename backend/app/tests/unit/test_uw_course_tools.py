"""Unit tests for the UW-Madison SQLite-backed course tools.

Each test builds a tiny temporary SQLite database matching the schema produced
by ``scripts/scrape_uw_courses.py`` and patches ``get_db_path`` (and
``get_settings`` where the tool reads ``max_results``) so the tool executors
run against the fixture.
"""

import asyncio
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.tools import list_registered_tools
from app.tools import uw_course_grades, uw_course_sections, uw_prerequisites, uw_search_courses


def _build_db(path: str) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE courses (
            identifier TEXT PRIMARY KEY, subjects TEXT, number INTEGER,
            title TEXT, description TEXT, prereq_text TEXT
        );
        CREATE TABLE course_prerequisites (
            course_identifier TEXT, prereq_identifier TEXT,
            PRIMARY KEY (course_identifier, prereq_identifier)
        );
        CREATE TABLE grades (
            course_identifier TEXT, term_code TEXT,
            total INTEGER, a INTEGER, ab INTEGER, b INTEGER, bc INTEGER,
            c INTEGER, d INTEGER, f INTEGER,
            satisfactory INTEGER, unsatisfactory INTEGER,
            credit INTEGER, no_credit INTEGER, passed INTEGER,
            incomplete INTEGER, no_work INTEGER, not_reported INTEGER, other INTEGER,
            instructors TEXT,
            PRIMARY KEY (course_identifier, term_code)
        );
        CREATE TABLE terms (term_code INTEGER PRIMARY KEY, description TEXT);
        CREATE TABLE sections (
            course_identifier TEXT, term_code TEXT, section TEXT, type TEXT,
            instructors TEXT, current_enrolled INTEGER, capacity INTEGER
        );
        CREATE TABLE instructors (
            name TEXT PRIMARY KEY, email TEXT, position TEXT, department TEXT,
            avg_rating REAL, avg_difficulty REAL, num_ratings INTEGER,
            would_take_again REAL
        );
        """
    )
    conn.executemany(
        "INSERT INTO courses (identifier, subjects, number, title, description, prereq_text) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [
            ("COMPSCI 200", "COMPSCI", 200, "PROGRAMMING I",
             "Introduction to programming.", ""),
            ("COMPSCI 300", "COMPSCI", 300, "PROGRAMMING II",
             "Object-oriented programming and data structures.", "COMP SCI 200"),
            ("COMPSCI/MATH 240", "COMPSCI/MATH", 240,
             "INTRODUCTION TO DISCRETE MATHEMATICS",
             "Discrete math for computer science with machine learning relevance.",
             "MATH 217 or 221"),
        ],
    )
    conn.execute(
        "INSERT INTO course_prerequisites (course_identifier, prereq_identifier) VALUES (?, ?)",
        ("COMPSCI 300", "COMPSCI 200"),
    )
    # Cumulative grade row for COMPSCI 300: GPA should be 3.28.
    conn.execute(
        "INSERT INTO grades (course_identifier, term_code, total, a, ab, b, bc, c, d, f, "
        "satisfactory, unsatisfactory, credit, no_credit, passed, incomplete, no_work, "
        "not_reported, other, instructors) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ("COMPSCI 300", "cumulative", 100, 40, 20, 20, 10, 5, 3, 2,
         0, 0, 0, 0, 0, 0, 0, 0, 0, ""),
    )
    conn.execute("INSERT INTO terms (term_code, description) VALUES (?, ?)", (1254, "Fall 2025"))
    conn.execute(
        "INSERT INTO sections (course_identifier, term_code, section, type, instructors, "
        "current_enrolled, capacity) VALUES (?,?,?,?,?,?,?)",
        ("COMPSCI 300", "1254", "LEC 001", "LEC", "Jane Smith", 120, 150),
    )
    conn.commit()
    conn.close()


class _UWToolTestBase(unittest.TestCase):
    """Creates a temp DB and patches each tool's db_path resolution."""

    def setUp(self):
        fd, self._db = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        _build_db(self._db)
        self._db_path = Path(self._db)

        self._patches = []
        for mod in (uw_search_courses, uw_course_grades, uw_prerequisites, uw_course_sections):
            p = patch.object(mod, "get_db_path", return_value=self._db_path)
            p.start()
            self._patches.append(p)

        # search_courses and course_sections read max_results from get_settings.
        fake_settings = MagicMock()
        fake_settings.tools.get_tool_config.return_value = {"max_results": 20}
        for mod in (uw_search_courses, uw_course_sections):
            p = patch.object(mod, "get_settings", return_value=fake_settings)
            p.start()
            self._patches.append(p)

    def tearDown(self):
        for p in self._patches:
            p.stop()
        os.remove(self._db)


class TestUWSearchCourses(_UWToolTestBase):
    def test_search_by_subject(self):
        result = asyncio.run(uw_search_courses.execute(subject="COMP SCI"))
        ids = {c["identifier"] for c in result["courses"]}
        self.assertIn("COMPSCI 200", ids)
        self.assertIn("COMPSCI 300", ids)

    def test_search_by_keyword(self):
        result = asyncio.run(uw_search_courses.execute(keyword="machine learning"))
        ids = {c["identifier"] for c in result["courses"]}
        self.assertEqual(ids, {"COMPSCI/MATH 240"})

    def test_search_by_course_number(self):
        result = asyncio.run(uw_search_courses.execute(subject="COMP SCI", course_number="300"))
        self.assertEqual(len(result["courses"]), 1)
        self.assertEqual(result["courses"][0]["identifier"], "COMPSCI 300")

    def test_search_requires_a_filter(self):
        result = asyncio.run(uw_search_courses.execute())
        self.assertEqual(result["courses"], [])
        self.assertIn("error", result)

    def test_missing_db_returns_error(self):
        with patch.object(uw_search_courses, "get_db_path", return_value=Path("/nope/missing.db")):
            result = asyncio.run(uw_search_courses.execute(subject="COMP SCI"))
        self.assertEqual(result["courses"], [])
        self.assertIn("error", result)


class TestUWCourseGrades(_UWToolTestBase):
    def test_computes_average_gpa(self):
        result = asyncio.run(uw_course_grades.execute(course_identifier="COMP SCI 300"))
        self.assertIsNotNone(result["cumulative"])
        self.assertAlmostEqual(result["cumulative"]["average_gpa"], 3.28, places=2)
        self.assertEqual(result["cumulative"]["total"], 100)

    def test_no_grades_returns_error(self):
        result = asyncio.run(uw_course_grades.execute(course_identifier="COMP SCI 200"))
        self.assertIsNone(result["grades"])
        self.assertIn("error", result)


class TestUWPrerequisites(_UWToolTestBase):
    def test_returns_prereq_text_and_edges(self):
        result = asyncio.run(uw_prerequisites.execute(course_identifier="COMP SCI 300"))
        self.assertEqual(result["course_identifier"], "COMPSCI 300")
        self.assertTrue(result["has_prerequisites"])
        edge_ids = {p["identifier"] for p in result["prerequisites"]}
        self.assertIn("COMPSCI 200", edge_ids)

    def test_unknown_course_returns_error(self):
        result = asyncio.run(uw_prerequisites.execute(course_identifier="BOGUS 999"))
        self.assertIsNone(result["course"])
        self.assertIn("error", result)


class TestUWCourseSections(_UWToolTestBase):
    def test_returns_sections_with_availability(self):
        result = asyncio.run(uw_course_sections.execute(course_identifier="COMP SCI 300"))
        self.assertEqual(len(result["sections"]), 1)
        sec = result["sections"][0]
        self.assertEqual(sec["term"], "Fall 2025")
        self.assertEqual(sec["seats_available"], 30)
        self.assertTrue(sec["is_open"])

    def test_term_filter(self):
        result = asyncio.run(
            uw_course_sections.execute(course_identifier="COMP SCI 300", term="Spring 2025")
        )
        self.assertEqual(result["sections"], [])
        self.assertIn("error", result)


class TestUWToolsRegistered(unittest.TestCase):
    """The four UW tools must be auto-discovered by the registry."""

    def test_uw_tools_discovered(self):
        registered = set(list_registered_tools())
        for name in (
            "uw_search_courses",
            "uw_course_grades",
            "uw_prerequisites",
            "uw_course_sections",
        ):
            self.assertIn(name, registered, f"Tool '{name}' was not discovered")


if __name__ == "__main__":
    unittest.main()
