"""Event detail fields: full description, image, categories, geo and UVA's
Trumba custom fields, parsed from VEVENTs recorded from each school's feed
(``fixtures/events``), plus what the Events API and chat tool send."""

import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

import icalendar

import app.config
from app.api.routes import events as events_api
from app.config import AppSettings
from app.sources import ical_events, places
from app.tools import events_search

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "events"
EASTERN = ZoneInfo("America/New_York")


def recorded(name):
    """{title: parsed event} for a recorded feed snippet."""
    calendar = icalendar.Calendar.from_ical((FIXTURES / name).read_text(encoding="utf-8"))
    events = [ical_events._event(c, EASTERN, "Campus") for c in calendar.walk("VEVENT")]
    return {e["title"]: e for e in events}


def one(vevent_lines):
    text = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:test\nBEGIN:VEVENT\nUID:x\nSUMMARY:Test\n" \
           "DTSTART:20261027T190000\nDTEND:20261027T200000\n" + vevent_lines + "\nEND:VEVENT\nEND:VCALENDAR\n"
    return ical_events._event(icalendar.Calendar.from_ical(text).walk("VEVENT")[0], EASTERN, "Campus")


class TestUvaTrumba(unittest.TestCase):
    def setUp(self):
        self.events = recorded("uva.ics")

    def test_image_categories_and_details(self):
        exhibit = self.events["Color is Life: Women's Work Today"]
        self.assertEqual(exhibit["image_url"], "https://www.trumba.com/i/DgDOYpMG3vEdyhPSQwh2rRDq.jpg")
        self.assertEqual(exhibit["categories"], ["kluge-ruhe"])
        self.assertEqual(exhibit["details"], {
            "audience": "Undergraduate, Graduate, Professional Students, Faculty & Staff, Alumni, Public",
            "event_type": "Exhibit",  # not the TYPE=number template name
        })
        self.assertNotIn("geo", exhibit)

    def test_links_come_from_the_href(self):
        workshop = self.events["Finding My Way: Mentoring Faculty"]
        self.assertEqual(workshop["details"], {
            "audience": "Faculty",  # "Audience Type" when there is no "Audience"
            "event_type": "Workshop",
            "hosted_by": "Center for Faculty Well-Being and Development",
            "registration_url": "https://virginia.az1.qualtrics.com/jfe/form/SV_74DdhUO6BTkvI1g",
        })
        self.assertNotIn("image_url", workshop)

    def test_room_and_entities(self):
        session = self.events["UVA Batten Graduate Certificate Information Session"]
        self.assertEqual(session["details"]["room"], "Great Hall (100)")
        webinar = self.events["Managing Anxiety in Uncertain Times"]
        self.assertEqual(webinar["details"]["sponsor"],
                         "UVA Provost’s Faculty Guide Program, UVA FEAP and Hoos Well’s")
        # "Online Location: Webinar" names no link, so there is no online_url.
        self.assertNotIn("online_url", webinar["details"])

    def test_full_description_keeps_line_breaks_and_strips_html(self):
        exhibit = self.events["Color is Life: Women's Work Today"]
        description = exhibit["description"]
        self.assertGreater(len(description), 400)
        self.assertTrue(description.endswith("The exhibition is supported by UVA Arts."))
        self.assertNotIn("<br>", description)
        self.assertIn("Audience: Undergraduate,Graduate", description)
        self.assertIn("\n\n'Color is Life", description)

    def test_event_image_custom_field_without_image_property(self):
        event = one('X-TRUMBA-CUSTOMFIELD;NAME="Event image";ID=40;TYPE=Image:<a href="https://www.trumba.com/i/a.jpg">x</a>')
        self.assertEqual(event["image_url"], "https://www.trumba.com/i/a.jpg")

    def test_placeholder_values_are_left_out(self):
        event = one(
            'X-TRUMBA-CUSTOMFIELD;NAME="Room";ID=1;TYPE=CustomAsset:See Event Details for More Info\n'
            'X-TRUMBA-CUSTOMFIELD;NAME="Cost";ID=2;TYPE=SingleLine:N/A\n'
            'X-TRUMBA-CUSTOMFIELD;NAME="Cost";ID=3;TYPE=SingleLine:Free'
        )
        self.assertEqual(event["details"], {"cost": "Free"})


class TestCuLocalist(unittest.TestCase):
    def test_geo_and_categories(self):
        tour = recorded("cu.ics")["Cruiser guided Ebike Tour of Boulder"]
        self.assertEqual(tour["geo"], {"lat": 40.029253, "lon": -105.287785})
        self.assertEqual(tour["categories"], ["Tour"])
        self.assertNotIn("image_url", tour)
        self.assertNotIn("details", tour)
        self.assertTrue(tour["description"].endswith("Weather permitting we are open year round."))


class TestUwToday(unittest.TestCase):
    def test_plain_event_has_no_extra_fields(self):
        workshop = recorded("uw.ics")["STEM Extension (OPT): ISS Advising Workshop"]
        for key in ("image_url", "categories", "geo", "details"):
            self.assertNotIn(key, workshop)
        self.assertIn("\n\nCONTACT: 262-2044, issprograms@iss.wisc.edu\n\nONLINE:", workshop["description"])


class TestMalformedFields(unittest.TestCase):
    def test_bad_values_drop_only_that_field(self):
        event = one(
            "IMAGE;VALUE=URI:javascript:alert(1)\n"
            "GEO:north;west\n"
            "CATEGORIES:Talk,Music\n"
            'X-TRUMBA-CUSTOMFIELD;NAME="Registration Link";ID=4;TYPE=MultiLine:<a href="ftp://x.edu/f">Register</a>\n'
            'X-TRUMBA-CUSTOMFIELD;NAME="Cost";ID=2;TYPE=SingleLine:$5'
        )
        self.assertNotIn("image_url", event)
        self.assertNotIn("geo", event)
        self.assertEqual(event["categories"], ["Talk", "Music"])
        self.assertEqual(event["details"], {"cost": "$5"})
        self.assertEqual(event["title"], "Test")

    def test_out_of_range_geo_is_dropped(self):
        self.assertNotIn("geo", one("GEO:123.0;-105.2"))

    def test_a_parser_error_drops_only_that_field(self):
        with patch.object(ical_events, "_categories", side_effect=ValueError("boom")):
            event = one("CATEGORIES:Talk\nGEO:40.0;-105.2")
        self.assertNotIn("categories", event)
        self.assertEqual(event["geo"], {"lat": 40.0, "lon": -105.2})


class TestApiAndChat(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        app.config._settings = AppSettings(
            school={"slug": "demo", "timezone": "America/New_York"},
            mongodb={"database_name": "demo_advisor"},
            rag={"chroma_collection": "demo_docs"},
            student_life={"event_feeds": [{"url": "https://x.edu/e.ics", "name": "Campus"}]},
            tools={"events_search": {"enabled": True, "max_results": 15}},
        )
        uva = recorded("uva.ics")
        uw = recorded("uw.ics")
        self.events = []
        for e in (uva["Color is Life: Women's Work Today"], uw["STEM Extension (OPT): ISS Advising Workshop"]):
            e = dict(e)
            e.pop("_start"), e.pop("_end")
            self.events.append(e)
        self.patches = [
            patch.object(ical_events, "events_between", AsyncMock(return_value=(self.events, []))),
            patch.object(ical_events, "listed_through", AsyncMock(return_value=None)),
            patch.object(places, "match_venue", return_value=None),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        app.config._settings = None

    async def test_list_sends_description_and_present_fields_only(self):
        body = await events_api.list_events(window="today", q="", from_="", current_user=None)
        exhibit, workshop = body["events"]
        self.assertEqual(exhibit["description"], self.events[0]["description"])
        self.assertEqual(exhibit["image_url"], "https://www.trumba.com/i/DgDOYpMG3vEdyhPSQwh2rRDq.jpg")
        self.assertEqual(exhibit["details"]["event_type"], "Exhibit")
        self.assertEqual(exhibit["categories"], ["kluge-ruhe"])
        for key in ("image_url", "categories", "geo", "details"):
            self.assertNotIn(key, workshop)
        self.assertNotIn("geo", exhibit)

    async def test_detail_sends_the_same_fields(self):
        body = await events_api.get_event(event_id=self.events[0]["id"], from_="", current_user=None)
        self.assertEqual(body["event"]["details"]["audience"].split(", ")[0], "Undergraduate")
        self.assertGreater(len(body["event"]["description"]), 400)

    async def test_chat_tool_keeps_the_short_form(self):
        result = await events_search.execute(when="today")
        exhibit = result["events"][0]
        self.assertLessEqual(len(exhibit["description"]), 400)
        self.assertNotIn("\n", exhibit["description"])
        for key in ("image_url", "categories", "geo", "details"):
            self.assertNotIn(key, exhibit)


if __name__ == "__main__":
    unittest.main()
