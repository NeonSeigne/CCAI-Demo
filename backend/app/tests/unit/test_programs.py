"""Tests for program files (schools/<slug>/programs/*.yaml)."""

import tempfile
import textwrap
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from app.planner import programs

VALID = """\
id: test-ba
name: Test B.A.
type: major
catalog_year: 2026
source_url: https://example.edu/test
checked_on: 2026-10-28
total_credits: 120
rules:
  - id: intro
    title: Intro
    kind: all_of
    courses: [econ 2010, ECON2020]
  - id: theory
    title: Theory
    kind: n_of
    n: 1
    courses: [ECON 3010, ECON 3110]
    min_grade: c+
  - id: lab
    title: Lab credits
    kind: credits_from
    credits: 3
    courses: [comp  sci 300, COMP SCI 400]
  - id: upper
    title: Upper-level electives
    kind: level
    subjects: [econ]
    min_level: 3000
    max_level: 4999
    n: 2
    exclude: [ECON 3010]
    double_count: true
    notes: [Each at least 3 credits.]
notes:
  - GPA 2.0 in the major.
"""


class ProgramFileTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.schools = Path(self.tmp.name)
        self.patch = patch.object(programs, "SCHOOLS_DIR", self.schools)
        self.patch.start()
        programs.clear_cache()

    def tearDown(self):
        self.patch.stop()
        programs.clear_cache()
        self.tmp.cleanup()

    def write(self, text, slug="test-u", name="test-ba.yaml"):
        directory = self.schools / slug / "programs"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / name
        path.write_text(textwrap.dedent(text))
        return path

    def assertBadFile(self, text, field):
        path = self.write(text)
        with self.assertRaises(ValueError) as caught:
            programs.read_file(path)
        message = str(caught.exception)
        self.assertIn(str(path), message)
        self.assertIn(field, message)

    def test_each_rule_kind_parses(self):
        program = programs.read_file(self.write(VALID))
        self.assertEqual(program.checked_on, date(2026, 10, 28))
        self.assertEqual(program.total_credits, 120)
        self.assertEqual(program.notes, ("GPA 2.0 in the major.",))
        intro, theory, lab, upper = program.rules
        self.assertEqual((intro.kind, intro.courses, intro.double_count), ("all_of", ("ECON 2010", "ECON 2020"), False))
        self.assertEqual((theory.kind, theory.n, theory.min_grade), ("n_of", 1, "C+"))
        self.assertEqual((lab.kind, lab.credits, lab.courses), ("credits_from", 3.0, ("COMP SCI 300", "COMP SCI 400")))
        self.assertEqual(upper.kind, "level")
        self.assertEqual((upper.subjects, upper.min_level, upper.max_level, upper.n), (("ECON",), 3000, 4999, 2))
        self.assertEqual(upper.exclude, ("ECON 3010",))
        self.assertTrue(upper.double_count)
        self.assertEqual(upper.notes, ("Each at least 3 credits.",))

    def test_dataclasses_are_frozen(self):
        program = programs.read_file(self.write(VALID))
        with self.assertRaises(Exception):
            program.name = "x"
        with self.assertRaises(Exception):
            program.rules[0].n = 3

    def test_bad_kind_names_file_and_field(self):
        self.assertBadFile(VALID.replace("kind: all_of", "kind: any_of"), "rules[intro]: kind")

    def test_missing_courses_names_file_and_field(self):
        self.assertBadFile(VALID.replace("    courses: [econ 2010, ECON2020]\n", ""), "rules[intro].courses")

    def test_bad_date_names_file_and_field(self):
        self.assertBadFile(VALID.replace("checked_on: 2026-10-28", "checked_on: last week"), "checked_on")

    def test_other_bad_fields(self):
        self.assertBadFile(VALID.replace("type: major", "type: degree"), "type")
        self.assertBadFile(VALID.replace("    n: 1\n", "    n: 3\n"), "rules[theory]: n")
        self.assertBadFile(VALID.replace("    credits: 3\n", ""), "rules[lab]: credits")
        self.assertBadFile(VALID.replace("    min_level: 3000\n", ""), "rules[upper]: min_level")
        self.assertBadFile(VALID.replace("min_grade: c+", "min_grade: great"), "rules[theory]: min_grade")
        self.assertBadFile(VALID.replace("[ECON 3010, ECON 3110]", "[ECON 3010, 3110]"), "rules[theory].courses")
        self.assertBadFile(VALID.replace("id: lab", "id: intro"), "rules[intro].id")
        self.assertBadFile(VALID.replace("total_credits: 120", "total_credit: 120"), "total_credit")
        self.assertBadFile(VALID.replace("id: test-ba", "id: other"), "id")
        self.assertBadFile(VALID.replace("total_credits: 120", "total_credits: 120\ncomplete: maybe"), "complete")

    def test_complete_defaults_to_false(self):
        self.assertFalse(programs.read_file(self.write(VALID)).complete)
        self.assertTrue(programs.read_file(self.write(VALID.replace("total_credits: 120", "total_credits: 120\ncomplete: true"))).complete)

    def test_identifier_normalisation(self):
        self.assertEqual(programs.normalize_course("econ  2010"), "ECON 2010")
        self.assertEqual(programs.normalize_course("ECON2010"), "ECON 2010")
        self.assertEqual(programs.normalize_course(" comp  sci 300 "), "COMP SCI 300")
        self.assertEqual(programs.normalize_course("A A E 371"), "A A E 371")
        for bad in ("ECON", "2010", "", None):
            with self.assertRaises(ValueError):
                programs.normalize_course(bad)

    def test_list_and_get_with_cache(self):
        self.write(VALID)
        listed = programs.list_programs("test-u")
        self.assertEqual([p.id for p in listed], ["test-ba"])
        self.assertIs(programs.get_program("test-u", "test-ba"), listed[0])
        (self.schools / "test-u" / "programs" / "test-ba.yaml").unlink()
        self.assertEqual(len(programs.list_programs("test-u")), 1)  # cached
        with self.assertRaises(KeyError):
            programs.get_program("test-u", "nope")

    def test_school_without_programs_dir(self):
        (self.schools / "empty-u").mkdir()
        self.assertEqual(programs.list_programs("empty-u"), [])
        self.assertEqual(programs.list_programs("missing-u"), [])

    def test_bad_slug(self):
        with self.assertRaises(ValueError):
            programs.list_programs("../etc")


class ShippedProgramsTest(unittest.TestCase):
    def setUp(self):
        programs.clear_cache()

    def tearDown(self):
        programs.clear_cache()

    def test_uva_econ_loads(self):
        program = programs.get_program("uva", "econ-ba")
        self.assertEqual(program.type, "major")
        self.assertEqual(program.checked_on, date(2026, 10, 28))
        rules = {r.id: r for r in program.rules}
        self.assertEqual(rules["intro"].courses, ("ECON 2010", "ECON 2020"))
        self.assertEqual(rules["micro-theory"].min_grade, "C+")
        self.assertEqual((rules["electives-4000"].min_level, rules["electives-4000"].n), (4000, 2))
        self.assertTrue(program.notes)

    def test_uva_mpp_loads_as_graduate(self):
        program = programs.get_program("uva", "mpp")
        self.assertEqual(program.type, "graduate")
        self.assertEqual(program.total_credits, 49)
        rules = {r.id: r for r in program.rules}
        self.assertEqual(rules["applied-policy-project-1"].courses, ("LPPP 7700", "LPPP 7710"))
        self.assertEqual(rules["leadership"].courses, ("LPPL 6050", "LPPL 7025", "LPPL 7410"))
        self.assertFalse(program.complete)

    def test_uw_econ_loads(self):
        program = programs.get_program("uw-madison", "econ-ba")
        self.assertEqual(program.total_credits, 120)
        self.assertFalse(program.complete)
        rules = {r.id: r for r in program.rules}
        self.assertEqual(rules["micro-theory"].courses, ("ECON 301", "ECON 311"))
        self.assertEqual(rules["core"].n, 2)
        self.assertIn("ECON 310", rules["statistics"].courses)
        self.assertEqual(rules["electives"].kind, "credits_from")
        self.assertEqual(rules["principles"].groups, (("ECON 101", "ECON 102"), ("ECON 111",)))
        self.assertFalse(any("ECON 101" in note for note in program.notes))


if __name__ == "__main__":
    unittest.main()
