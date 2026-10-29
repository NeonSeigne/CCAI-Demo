"""School short names and term dates (home-colors alignment 1.9 and R12)."""

import os
import unittest
from datetime import date
from unittest.mock import patch

from pydantic import ValidationError

import app.config
from app.config import AppSettings, TermDates, load_settings


def _shipped(slug):
    app.config._settings = None
    env = {k: v for k, v in os.environ.items() if k not in ("SCHOOL", "CONFIG_PATH", "ALLOW_DRAFT")}
    env["SCHOOL"] = slug
    with patch.dict(os.environ, env, clear=True):
        settings = load_settings()
    app.config._settings = None
    return settings


class TestShortName(unittest.TestCase):
    def test_each_pack_has_its_short_name_in_the_public_config(self):
        expected = {"uva": "UVA", "cu-boulder": "CU Boulder", "uw-madison": "UW–Madison"}
        for slug, short in expected.items():
            with self.subTest(slug=slug):
                config = _shipped(slug).get_frontend_config()
                self.assertEqual(config["app"]["short_name"], short)

    def test_short_name_defaults_to_empty(self):
        self.assertEqual(AppSettings().get_frontend_config()["app"]["short_name"], "")


class TestTermDates(unittest.TestCase):
    def test_public_config_carries_iso_dates_and_nulls(self):
        settings = AppSettings(planner={"term_dates": {
            "Fall 2026": {"first_day": "2026-08-25"},
            "Spring 2027": {"first_day": date(2027, 1, 7), "last_day": date(2027, 4, 23)},
        }})
        dates = settings.get_frontend_config()["school"]["term_dates"]
        self.assertEqual(dates, {
            "Fall 2026": {"first_day": "2026-08-25", "last_day": None},
            "Spring 2027": {"first_day": "2027-01-07", "last_day": "2027-04-23"},
        })

    def test_no_dates_is_an_empty_map(self):
        self.assertEqual(AppSettings().get_frontend_config()["school"]["term_dates"], {})

    def test_last_day_before_first_day_is_refused(self):
        with self.assertRaisesRegex(ValidationError, "before first_day"):
            TermDates(first_day=date(2027, 4, 23), last_day=date(2027, 1, 7))

    def test_shipped_packs(self):
        cu = _shipped("cu-boulder").planner.term_dates
        self.assertEqual((cu["Fall 2026"].first_day, cu["Fall 2026"].last_day), (date(2026, 8, 20), date(2026, 12, 4)))
        self.assertEqual((cu["Spring 2027"].first_day, cu["Spring 2027"].last_day), (date(2027, 1, 7), date(2027, 4, 23)))
        uw = _shipped("uw-madison").planner.term_dates
        self.assertEqual((uw["Fall 2026"].first_day, uw["Fall 2026"].last_day), (date(2026, 9, 2), date(2026, 12, 9)))
        self.assertEqual((uw["Spring 2027"].first_day, uw["Spring 2027"].last_day), (date(2027, 1, 19), date(2027, 4, 30)))
        # UVA: only the verified first day of Fall 2026.
        uva = _shipped("uva").planner.term_dates
        self.assertEqual((uva["Fall 2026"].first_day, uva["Fall 2026"].last_day), (date(2026, 8, 25), None))
        self.assertNotIn("Spring 2027", uva)


if __name__ == "__main__":
    unittest.main()
