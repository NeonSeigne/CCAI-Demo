"""scripts/import_places.py: the OSM detail tags it keeps and the R7 photo
credit from Wikidata P18 + Commons imageinfo. Wikimedia is served from
fixtures through an httpx MockTransport; nothing reaches the network, and no
school's places.geojson is touched."""

import importlib.util
import json
import unittest
from pathlib import Path

import httpx

REPO = Path(__file__).resolve().parents[4]
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "places"

_spec = importlib.util.spec_from_file_location("import_places", REPO / "scripts" / "import_places.py")
import_places = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(import_places)


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


def features():
    out = [import_places.to_feature(e, {}) for e in fixture("overpass_elements.json")["elements"]]
    return {f["properties"]["name"]: f for f in out if f}


class FakeWikimedia:
    def __init__(self):
        self.requests = []

    def handler(self, request):
        self.requests.append(request)
        if request.url.host == "www.wikidata.org":
            return httpx.Response(200, json=fixture("wbgetentities.json"))
        if request.url.host == "commons.wikimedia.org":
            return httpx.Response(200, json=fixture("imageinfo.json"))
        return httpx.Response(404)

    def client(self):
        return httpx.Client(transport=httpx.MockTransport(self.handler))


class TestDetailTags(unittest.TestCase):
    def test_library_keeps_its_tags(self):
        props = features()["Alderman Library"]["properties"]
        self.assertEqual(props["osm"], "way/23620211")
        self.assertEqual(props["category"], "library")
        self.assertEqual(props["website"], "https://www.library.virginia.edu/libraries/alderman")
        self.assertEqual(props["phone"], "+1 434-924-3021")
        self.assertEqual(props["wheelchair"], "yes")
        self.assertEqual(props["building_levels"], 5)
        self.assertEqual(props["address"], "160 McCormick Road")
        self.assertEqual(props["operator"], "University of Virginia Library")
        self.assertEqual(props["wikidata"], "Q99990001")
        self.assertEqual(props["wikipedia"], "https://en.wikipedia.org/wiki/Alderman_Library")
        self.assertEqual(props["hours"], "Mo-Fr 08:00-22:00")

    def test_cafe_cuisine_bare_domain_and_description(self):
        props = features()["Greenberry's"]["properties"]
        self.assertEqual(props["osm"], "node/5512345678")
        self.assertEqual(props["cuisine"], ["coffee shop", "bagel"])
        self.assertEqual(props["website"], "https://greenberrys.com")
        self.assertEqual(props["description"], "Coffee and pastries.")

    def test_unusable_tags_are_left_out(self):
        props = features()["1 Dawson's Row"]["properties"]
        for key in ("building_levels", "wheelchair", "website", "wikidata", "wikipedia", "address", "photo"):
            self.assertNotIn(key, props)
        self.assertEqual(set(props), {"name", "aliases", "category", "osm"})


class TestPhotos(unittest.TestCase):
    def test_imageinfo_gives_url_author_licence_and_page(self):
        page = fixture("imageinfo.json")["query"]["pages"]["81234567"]
        self.assertEqual(import_places.photo_from_imageinfo(page), {
            "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/"
                   "Alderman_Library_UVA_2019.jpg/640px-Alderman_Library_UVA_2019.jpg",
            "author": "Jane Q. Photographer & UVA Library",  # HTML stripped to plain text
            "license": "CC BY-SA 4.0",
            "page": "https://commons.wikimedia.org/wiki/File:Alderman_Library_UVA_2019.jpg",
        })

    def test_image_without_a_licence_is_skipped(self):
        page = fixture("imageinfo.json")["query"]["pages"]["81234568"]
        self.assertIsNone(import_places.photo_from_imageinfo(page))

    def test_add_photos_end_to_end(self):
        found = features()
        wiki = FakeWikimedia()
        with wiki.client() as client:
            count = import_places.add_photos(list(found.values()), client)
        self.assertEqual(count, 1)
        self.assertEqual(found["Alderman Library"]["properties"]["photo"]["license"], "CC BY-SA 4.0")
        self.assertNotIn("photo", found["Greenberry's"]["properties"])  # no licence
        entities, imageinfo = wiki.requests
        self.assertEqual(entities.url.params["ids"], "Q99990001|Q99990002")
        self.assertEqual(entities.url.params["props"], "claims")
        self.assertEqual(imageinfo.url.params["titles"], "File:Alderman Library UVA 2019.jpg|File:greenberrys cafe.jpg")
        self.assertEqual(imageinfo.url.params["iiurlwidth"], "640")
        self.assertIn("extmetadata", imageinfo.url.params["iiprop"])
        for request in wiki.requests:
            self.assertEqual(request.headers["User-Agent"], import_places.USER_AGENT)
            self.assertNotIn("@", request.headers["User-Agent"])

    def test_normalized_titles_map_back_to_the_wikidata_file(self):
        response = {"query": {
            "normalized": [{"from": "File:greenberrys cafe.jpg", "to": "File:Greenberrys cafe.jpg"}],
            "pages": {"1": {"title": "File:Greenberrys cafe.jpg", "imageinfo": [{
                "thumburl": "https://upload.wikimedia.org/x/640px-g.jpg",
                "extmetadata": {"LicenseShortName": {"value": "CC0"}},
            }]}},
        }}
        self.assertEqual(import_places.photos_by_file(response), {
            "File:greenberrys cafe.jpg": {"url": "https://upload.wikimedia.org/x/640px-g.jpg", "license": "CC0"},
        })

    def test_places_without_wikidata_ask_nothing(self):
        wiki = FakeWikimedia()
        with wiki.client() as client:
            self.assertEqual(import_places.add_photos([features()["1 Dawson's Row"]], client), 0)
        self.assertEqual(wiki.requests, [])


if __name__ == "__main__":
    unittest.main()
