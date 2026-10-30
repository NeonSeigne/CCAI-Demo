"""Degree payload for the My degree detail card and route (home-colors
alignment Phase 3): chosen sections, "opens", slot wording, graduation."""

import unittest

from app.planner import checker, degree
from app.planner.facts import CourseFacts, Meeting, PrereqNode, Section, Unlock
from app.planner.programs import Deadline
from app.tests.unit.planner_fakes import TERM, Program, Rule, course, plan

FALL = "Fall 2027"
RULES = (
    Rule("intro", "Introductory economics", "all_of", courses=("ECON 2010", "ECON 2020", "ECON 2030")),
    Rule("el", "Economics electives", "level", subjects=("ECON",), min_level=2000, n=4),
    Rule("pick", "Methods", "n_of", courses=("ECON 4710", "ECON 4720", "ECON 4730", "ECON 4740"), n=1),
    Rule("lab", "Lab credits", "credits_from", credits=6.0, courses=("ECON 4720", "ECON 4730"),
         exclude=("ECON 4730",)),
    Rule("pair", "Paired sequence", "one_of_groups", groups=(("PHYS 1010", "PHYS 1020"),)),
)
PROGRAMS = [Program("econ-ba", "Economics B.A.", rules=RULES, deadline=Deadline(rules=("intro",), by_semester=6))]


def facts():
    lecture = Section("001", "lecture", (Meeting("Mo", "10:00", "10:50"), Meeting("We", "10:00", "10:50")),
                      instructor="A. Prof")
    lab = Section("101", "lab", None)
    return {
        "ECON 2010": course("ECON 2010", unlocks=(Unlock("ECON 3010", "Microeconomics"),
                                                  Unlock("ECON 3020", "Macroeconomics"))),
        "ECON 3010": course("ECON 3010", sections=[lecture, lab],
                            prereq_tree=PrereqNode("course", course="ECON 2010")),
        "ECON 4010": course("ECON 4010", prereq_tree=PrereqNode("course", course="ECON 3010")),
    }


def a_plan(**profile):
    p = plan([("ECON 3010", TERM, ["001", "101", "999"]), ("ECON 4010", FALL)])
    p["profile"].update(program_ids=["econ-ba"], completed=[{"id": "ECON 2010", "grade": "A", "term": "Fall 2025"}],
                        **profile)
    return p


def board(p=None):
    f = facts()
    by_term = {TERM: {k: v for k, v in f.items() if k != "ECON 4010"}, FALL: {"ECON 4010": f["ECON 4010"]}}
    return degree.board(p or a_plan(), by_term, PROGRAMS)


def row(body, course_id):
    return next(c for t in body["terms"] for c in t["courses"] if c["id"] == course_id)


class TestSections(unittest.TestCase):
    def test_chosen_sections_with_meetings_and_instructor(self):
        sections = row(board(), "ECON 3010")["sections"]
        self.assertEqual(sections[0], {"id": "001", "kind": "lecture", "instructor": "A. Prof", "meetings": [
            {"day": "Mo", "start": "10:00", "end": "10:50"}, {"day": "We", "start": "10:00", "end": "10:50"}]})
        # Times and instructor not published: null, not guessed.
        self.assertEqual(sections[1], {"id": "101", "kind": "lab", "meetings": None, "instructor": None})
        # A section id the facts don't list keeps its id, the rest unknown.
        self.assertEqual(sections[2], {"id": "999", "kind": None, "meetings": None, "instructor": None})

    def test_no_sections_chosen_is_an_empty_list(self):
        self.assertEqual(row(board(), "ECON 4010")["sections"], [])


class TestOpens(unittest.TestCase):
    def test_source_list_includes_courses_outside_the_plan(self):
        done = board()["completed"][0]
        self.assertEqual(done["id"], "ECON 2010")
        self.assertTrue(done["opens_complete"])
        self.assertEqual(done["opens"], [{"id": "ECON 3010", "title": "Microeconomics", "in_plan": True},
                                         {"id": "ECON 3020", "title": "Macroeconomics", "in_plan": False}])

    def test_without_a_source_list_only_plan_courses_whose_prerequisites_name_it(self):
        opened = row(board(), "ECON 3010")
        self.assertFalse(opened["opens_complete"])
        self.assertEqual(opened["opens"], [{"id": "ECON 4010", "title": "ECON 4010 title", "in_plan": True}])
        self.assertEqual(row(board(), "ECON 4010")["opens"], [])

    def test_spacing_blind_match(self):
        f = {"COMP SCI 300": course("COMP SCI 300", unlocks=(Unlock("COMPSCI 400", "Programming III"),)),
             "COMPSCI 400": course("COMPSCI 400")}
        p = plan(["COMP SCI 300", "COMPSCI 400"])
        index = degree.opens_index(p, f)
        result = degree.opens("COMP SCI 300", f, index, {degree._key(i) for i in f})
        self.assertEqual(result["opens"], [{"id": "COMPSCI 400", "title": "Programming III", "in_plan": True}])

    def test_unavailable_facts_open_nothing(self):
        f = {"ECON 2010": CourseFacts("ECON 2010", known="unavailable")}
        self.assertEqual(degree.opens("ECON 2010", f, {}, set()), {"opens": [], "opens_complete": False})


class TestSlotWording(unittest.TestCase):
    def slots(self):
        return {s["rule_id"]: s for s in board()["route"]["slots"]}

    def test_level_rule(self):
        self.assertEqual(self.slots()["el"]["wording"], "Any ECON course, 2000 or above")
        self.assertEqual(self.slots()["el"]["options"], [])

    def test_level_wording_variants(self):
        rule = Rule("x", "X", "level", subjects=("ECON", "MATH"), min_level=3000, max_level=4999)
        self.assertEqual(degree.slot_wording(rule, [])["wording"], "Any ECON or MATH course, 3000 to 4999")
        self.assertEqual(degree.slot_wording(Rule("x", "X", "level", subjects=("ECON",)), [])["wording"],
                         "Any ECON course")
        self.assertIsNone(degree.slot_wording(Rule("x", "X", "level", min_level=3000), [])["wording"])

    def test_all_of_names_the_unchosen_courses(self):
        intro = self.slots()["intro"]
        self.assertEqual((intro["wording"], intro["options"]), ("ECON 2020 and ECON 2030", ["ECON 2020", "ECON 2030"]))

    def test_list_rules(self):
        slots = self.slots()
        self.assertEqual(slots["pick"]["wording"], "One of 4 listed courses")
        # The excluded course is no option.
        self.assertEqual((slots["lab"]["wording"], slots["lab"]["options"]), ("One of ECON 4720", ["ECON 4720"]))
        few = Rule("x", "X", "n_of", courses=("A 1", "B 2", "C 3"), n=1)
        self.assertEqual(degree.slot_wording(few, ["b 2"])["wording"], "One of A 1 or C 3")

    def test_rules_the_data_cant_word(self):
        self.assertEqual((self.slots()["pair"]["wording"], self.slots()["pair"]["options"]), (None, []))
        self.assertEqual(degree.slot_wording(None, []), {"wording": None, "options": []})


class TestGraduation(unittest.TestCase):
    def test_from_class_year(self):
        body = board(a_plan(class_year="2029", start_term="Fall 2025"))
        self.assertEqual(body["graduation"], {"term": "Spring 2029", "source": "class_year"})
        terms = body["route"]["terms"]
        self.assertEqual((terms[0], terms[-1], len(terms)), ("Fall 2025", "Spring 2029", 8))

    def test_unknown_without_class_year_and_route_runs_to_the_last_planned_term(self):
        body = board()
        self.assertEqual(body["graduation"], {"term": None, "source": None})
        # From the earliest completed term (no start_term) to the last planned one.
        self.assertEqual(body["route"]["terms"], ["Fall 2025", "Spring 2026", "Fall 2026", "Spring 2027", "Fall 2027"])

    def test_finish_when_no_class_year(self):
        self.assertEqual(degree.graduation(plan(), "Fall 2028"), {"term": "Fall 2028", "source": "finish"})

    def test_planned_summer_terms_stay_on_the_route(self):
        p = plan([("ECON 3010", "Summer 2027")])
        self.assertEqual(degree.route_terms(p, "Fall 2027"), ["Spring 2027", "Summer 2027", "Fall 2027"])

    def test_route_is_capped(self):
        p = plan()
        p["profile"]["start_term"] = "Fall 2000"
        self.assertEqual(len(degree.route_terms(p, "Spring 2030")), degree.MAX_ROUTE_TERMS + 1)  # + plan term


if __name__ == "__main__":
    unittest.main()
