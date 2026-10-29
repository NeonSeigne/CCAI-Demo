"""Tests for the OpenStreetMap opening_hours parser (sources/hours.py)."""

import json
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from app.config import SCHOOLS_DIR
from app.sources import hours

CHICAGO = ZoneInfo("America/Chicago")
TUESDAY_NOON = datetime(2026, 10, 27, 12, 0, tzinfo=CHICAGO)
SATURDAY_0030 = datetime(2026, 10, 31, 0, 30, tzinfo=CHICAGO)

# Every distinct `hours` string in schools/*/places.geojson (2026-10-27), with
# open_now at Tuesday 12:00 and Saturday 00:30; None means unknown.
TABLE = {
    "07:00-23:00": (True, False),
    "09:00-17:00": (True, False),
    "24/7": (True, True),
    'Fr-Su unknown "Only For Showings"': (None, None),
    "May-Sep: Mo-Th 08:00-19:00; May-Sep: Fr,Sa 08:00-17:00; Sep-May: Mo-Th 08:00-21:00; Sep-May: Fr,Sa 08:00-17:00; PH closed": (None, None),
    "Mo 07:30-18:00; Tu-Th 07:30-18:30; Fr 07:30-17:00": (True, False),
    "Mo 18:15-20:00; We 11:30-13:30": (False, False),
    "Mo,Tu,Th,Fr 08:00-18:00; We 08:00-20:00; Sa 09:30-12:30; Su off": (True, False),
    "Mo-Fr 00:00-02:00,11:00-24:00; Sa-Su 00:00-02:00,16:00-24:00": (True, True),
    "Mo-Fr 07:00-15:00; Sa,Su 07:00-14:00; May 15 - Sep 1 Mo-Fr 07:00-14:00; May 15 - Sep 1 Sa-Su 08:00-13:00": (None, None),
    "Mo-Fr 07:00-17:00": (True, False),
    "Mo-Fr 07:00-20:00; Sa off; Su 11:00-14:00,16:00-20:00; May 15-Sep 01 07:00-09:00,11:00-13:30,16:30-18:30": (None, None),
    "Mo-Fr 07:00-20:00; Sa-Su 10:00-20:00": (True, False),
    "Mo-Fr 07:00-21:00": (True, False),
    "Mo-Fr 07:00-23:00, Sa 07:00-24:00, Su 10:00-22:00": (True, False),
    "Mo-Fr 08:00-14:00": (True, False),
    "Mo-Fr 08:00-16:30": (True, False),
    "Mo-Fr 08:00-21:45; Sa,Su 10:00-21:45": (True, False),
    "Mo-Fr 08:30-14:30": (True, False),
    "Mo-Fr 09:00-15:00": (True, False),
    "Mo-Fr 09:00-17:00; Sa,Su off": (True, False),
    "Mo-Fr 10:00-19:00; Sa,Su 11:00-17:00; PH off": (None, None),
    "Mo-Fr 10:30-21:30; Sa-Su 11:00-21:30": (True, False),
    "Mo-Fr 08:00-16:00; PH off; SH off": (None, None),
    "Mo-Fr 08:30-16:30; Sa 09:00-13:00": (True, False),
    "Mo-Fr 11:00-17:00": (True, False),
    "Mo-Fr 11:00-19:00": (True, False),
    "Mo-Fr 11:00-20:00": (True, False),
    "Mo-Su 06:00-23:30": (True, False),
    "Mo-Su 07:00-18:00": (True, False),
    "Mo-Su 11:00-21:00": (True, False),
    "Mo-Su 12:00-00:00": (True, False),
    "Mo-Th 07:00 - 19:00; Fr 07:00-18:30": (True, False),
    "Mo-Th 07:00 - 21:00; Fr 07:00 - 18:00; Sa 10:00 - 15:00": (True, False),
    "Mo-Th 07:00 - 21:00; Fr 07:00 - 19:00; Sa 11:00 - 17:00; Su 12:00 - 17:00": (True, False),
    "Mo-Th 07:00-14:00,17:00-19:00; Fr 07:00-14:00; Sa-Su off": (True, False),
    "Mo-Th 07:00-20:30; Fr 07:00-20:00; Sa-Su 10:00-19:00": (True, False),
    "Mo-Th 07:30-09:30,10:30-21:00; Fr 07:30-09:30,10:30-19:00; Sa-Su off": (True, False),
    "Mo-Th 08:00-17:00; Fr 09:00-17:00": (True, False),
    "Mo-Th 10:30-19:00; Fr 10:30-14:00; Sa-Su off": (True, False),
    "Mo-Th 11:00-18:30; Fr 11:00-17:00": (True, False),
    "Su-Th 07:00-24:00; Fr-Sa 07:00-01:00": (True, True),
    "Su-Th 11:00-21:00; Fr,Sa 11:00-22:00": (True, False),
    "Su-We 10:00-24:00; Th-Sa 10:00-03:00": (True, True),
}


def at(day, hour, minute=0):
    return datetime(2026, 10, day, hour, minute, tzinfo=CHICAGO)


class TestShippedHoursTable(unittest.TestCase):
    def test_table_covers_every_shipped_hours_string(self):
        shipped = set()
        for path in SCHOOLS_DIR.glob("*/places.geojson"):
            for feature in json.loads(path.read_text())["features"]:
                if feature["properties"].get("hours"):
                    shipped.add(feature["properties"]["hours"])
        self.assertEqual(len(shipped), 44)
        self.assertEqual(shipped, set(TABLE))

    def test_open_now_for_each_string(self):
        for text, (noon, after_midnight) in TABLE.items():
            with self.subTest(text=text):
                schedule = hours.parse(text)
                self.assertEqual(hours.status(schedule, TUESDAY_NOON)[0], noon)
                self.assertEqual(hours.status(schedule, SATURDAY_0030)[0], after_midnight)


class TestParser(unittest.TestCase):
    def status(self, text, now):
        return hours.status(hours.parse(text), now)

    def test_open_until_same_day(self):
        self.assertEqual(self.status("Mo-Fr 08:00-21:45; Sa,Su 10:00-21:45", TUESDAY_NOON), (True, at(27, 21, 45)))

    def test_past_midnight_range_closes_next_day(self):
        self.assertEqual(self.status("Su-Th 07:00-24:00; Fr-Sa 07:00-01:00", at(30, 23)), (True, at(31, 1)))
        self.assertEqual(self.status("Su-Th 07:00-24:00; Fr-Sa 07:00-01:00", at(31, 1, 30)), (False, None))

    def test_back_to_back_ranges_report_the_real_close(self):
        text = "Mo-Fr 00:00-02:00,11:00-24:00; Sa-Su 00:00-02:00,16:00-24:00"
        self.assertEqual(self.status(text, TUESDAY_NOON), (True, at(28, 2)))

    def test_split_ranges_closed_between(self):
        text = "Mo-Th 07:30-09:30,10:30-21:00; Fr 07:30-09:30,10:30-19:00; Sa-Su off"
        self.assertEqual(self.status(text, at(27, 10)), (False, None))
        self.assertEqual(self.status(text, at(27, 9)), (True, at(27, 9, 30)))

    def test_closing_minute_is_closed(self):
        self.assertEqual(self.status("Mo-Fr 07:00-17:00", at(27, 17)), (False, None))

    def test_always_open_has_no_until(self):
        self.assertEqual(self.status("24/7", TUESDAY_NOON), (True, None))

    def test_off_and_closed_days(self):
        self.assertEqual(self.status("Mo-Fr 09:00-17:00; Sa,Su off", at(31, 12)), (False, None))
        self.assertEqual(self.status("Mo-Su 09:00-17:00; Tu closed", TUESDAY_NOON), (False, None))

    def test_later_rule_replaces_earlier_for_its_days(self):
        self.assertEqual(self.status("Mo-Su 09:00-17:00; Tu 13:00-14:00", TUESDAY_NOON), (False, None))

    def test_week_wrapping_range(self):
        self.assertEqual(self.status("Fr-Mo 10:00-12:00", at(26, 11)), (True, at(26, 12)))
        self.assertEqual(self.status("Fr-Mo 10:00-12:00", at(27, 11)), (False, None))

    def test_unknown_inputs(self):
        for text in (None, "", "PH off", "sunrise-sunset", "Mo-Fr 08:00-17:00; PH off", "Jan-Mar Mo 10:00-12:00",
                     'Mo 10:00-12:00 "by appointment"', "Mo 25:00-26:00"):
            with self.subTest(text=text):
                self.assertIsNone(hours.parse(text))
                self.assertEqual(hours.status(hours.parse(text), TUESDAY_NOON), (None, None))


if __name__ == "__main__":
    unittest.main()
