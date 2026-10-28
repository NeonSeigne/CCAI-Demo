import asyncio
import unittest
from unittest.mock import patch

from app.planner import facts as facts_module
from app.planner.facts import CourseFacts, load_facts
from app.tests.unit.planner_fakes import course


class LoadFactsTests(unittest.IsolatedAsyncioTestCase):
    async def test_twelve_courses_never_exceed_eight_calls_in_flight(self):
        in_flight = peak = calls = 0

        async def provider(ids, term):
            nonlocal in_flight, peak, calls
            calls += 1
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            return {i: course(i) for i in ids}

        ids = [f"ECON {3000 + i}" for i in range(12)]
        result = await load_facts(ids, "Spring 2027", provider=provider)
        self.assertLessEqual(peak, 8)
        self.assertGreater(peak, 1)  # still parallel
        self.assertEqual(calls, 12)
        self.assertEqual(list(result), ids)
        self.assertTrue(all(f.known == "yes" for f in result.values()))

    async def test_slow_course_past_the_budget_is_unavailable(self):
        async def provider(ids, term):
            if "ECON 4999" in ids:
                await asyncio.sleep(5)
            return {i: course(i) for i in ids}

        result = await load_facts(["ECON 3010", "ECON 4999"], "Spring 2027", provider=provider, budget_s=0.05)
        self.assertEqual(result["ECON 3010"].known, "yes")
        self.assertEqual(result["ECON 4999"].known, "unavailable")
        self.assertEqual(result["ECON 4999"].unavailable_reason, "Took too long to check")

    async def test_failed_or_missing_answer_is_unavailable(self):
        async def provider(ids, term):
            if "ECON 1" in ids:
                raise RuntimeError("Course Map unavailable")
            return {}

        result = await load_facts(["ECON 1", "ECON 2"], "Spring 2027", provider=provider)
        self.assertEqual({f.known for f in result.values()}, {"unavailable"})

    async def test_term_is_passed_and_duplicates_fetched_once(self):
        seen = []

        async def provider(ids, term):
            seen.append((tuple(ids), term))
            return {i: CourseFacts(i, known="no") for i in ids}

        await load_facts(["ECON 3010", "ECON 3010", ""], "Fall 2027", provider=provider)
        self.assertEqual(seen, [(("ECON 3010",), "Fall 2027")])

    async def test_defaults_to_the_academics_provider(self):
        async def provider(ids, term):
            return {i: course(i) for i in ids}

        from app.sources import academics

        with patch.object(academics, "course_facts", provider, create=True):
            result = await facts_module.load_facts(["ECON 3010"], "Spring 2027")
        self.assertEqual(result["ECON 3010"].known, "yes")


if __name__ == "__main__":
    unittest.main()
