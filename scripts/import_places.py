#!/usr/bin/env python3
"""Build schools/<slug>/places.geojson from OpenStreetMap.

Reads the school pack's ``campus.osm_area`` ({type: way|relation, id}) and asks
the Overpass API for named buildings, libraries, dining, health, recreation,
landmarks (lawns, quads, monuments, museums) and bus stops inside it. Each
place becomes a GeoJSON Point with ``name``, ``aliases``, ``category``, the
OSM ``type/id``, the tag behind the category (``osm_tag``,
"amenity=library") and, when OSM has them, ``hours``, ``website``, ``phone``,
``wheelchair``, ``cuisine``, ``building_levels``, ``address`` (addr:*
street address), ``operator``, ``description``, ``wikidata`` and
``wikipedia``. Aliases come from OSM
(alt_name, short_name, official_name, old_name) plus the pack's optional
``aliases.yaml`` ({"<OSM name>": ["UMC", ...]}), which is where hand-curated
student nicknames go.

Places with a ``wikidata`` tag get that item's image (Wikidata P18, a Wikimedia
Commons file) as ``photo: {url, author, license, page}``: a ~640px thumbnail,
the file's author (plain text) and licence from Commons ``extmetadata``, and
the file page. An image without a licence is skipped (eng review R7).

Usage:
    python3 scripts/import_places.py cu-boulder

Respects Overpass and Wikimedia usage: one Overpass query, batched Wikidata and
Commons requests, an identified User-Agent, 60s timeout.
"""

import argparse
import html
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit

import httpx
import yaml

REPO = Path(__file__).resolve().parents[1]
# Set OVERPASS_URL to use another public instance when the main one is busy.
OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
USER_AGENT = "CCAI-Demo-import-places/1.0 (+https://github.com/NeonSeigne/CCAI-Demo)"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
PHOTO_WIDTH = 640
# Wikimedia APIs take at most 50 ids or titles per request.
WIKI_BATCH = 50

CATEGORY_BY_TAG = [
    ("amenity", {"library"}, "library"),
    ("amenity", {"cafe", "restaurant", "fast_food", "food_court"}, "dining"),
    ("amenity", {"clinic", "doctors", "hospital", "pharmacy"}, "health"),
    ("amenity", {"student_accommodation"}, "housing"),
    ("amenity", {"theatre", "arts_centre", "cinema"}, "arts"),
    ("leisure", {"sports_centre", "stadium", "fitness_centre", "pitch", "track"}, "recreation"),
    ("tourism", {"attraction", "museum", "artwork", "viewpoint"}, "landmark"),
    ("historic", {"monument", "memorial"}, "landmark"),
    ("leisure", {"park", "garden"}, "landmark"),
    ("place", {"square"}, "landmark"),
    ("highway", {"bus_stop"}, "transit"),
    ("public_transport", {"platform", "stop_position"}, "transit"),
    ("building", {"dormitory", "residential", "apartments"}, "housing"),
    ("building", {"university", "college", "school"}, "academic"),
]


def category(tags):
    for key, values, label in CATEGORY_BY_TAG:
        if tags.get(key) in values:
            return label
    if "library" in tags.get("name", "").lower():
        return "library"
    return "academic" if tags.get("building") else "other"


def osm_tag(tags):
    """The tag behind the category, as ``key=value`` ("amenity=library"), else
    a specific ``building`` value; None for ``building=yes`` or nothing. The
    backend turns it into the place card's type label."""
    for key, values, _ in CATEGORY_BY_TAG:
        if tags.get(key) in values:
            return f"{key}={tags[key]}"
    building = tags.get("building", "").strip()
    if building and building != "yes" and re.fullmatch(r"[a-z_]+", building):
        return f"building={building}"
    return None


def overpass_query(area_type, area_id):
    area = f"{area_type}({area_id});map_to_area->.campus;"
    named = '["name"]'
    return (
        "[out:json][timeout:60];"
        + area
        + "("
        + f"nwr{named}[\"building\"](area.campus);"
        + f"nwr{named}[\"amenity\"~\"^(library|cafe|restaurant|fast_food|food_court|clinic|doctors|hospital|pharmacy|theatre|arts_centre|cinema|student_accommodation)$\"](area.campus);"
        + f"nwr{named}[\"leisure\"~\"^(sports_centre|stadium|fitness_centre)$\"](area.campus);"
        + f"nwr{named}[\"tourism\"~\"^(attraction|museum|artwork|viewpoint)$\"](area.campus);"
        + f"nwr{named}[\"historic\"~\"^(monument|memorial)$\"](area.campus);"
        + f"nwr{named}[\"leisure\"~\"^(park|garden)$\"](area.campus);"
        + f"nwr{named}[\"place\"=\"square\"](area.campus);"
        + f"node{named}[\"highway\"=\"bus_stop\"](area.campus);"
        + ");out center tags;"
    )


_TAG_RE = re.compile(r"<[^>]+>")
_WIKIDATA_RE = re.compile(r"^Q[1-9][0-9]*$")


def plain_text(value):
    """Commons ``extmetadata`` values are HTML; keep the visible text."""
    return " ".join(html.unescape(_TAG_RE.sub(" ", str(value or ""))).split())


def web_url(value):
    """An http(s) URL, adding ``https://`` to a bare domain; None otherwise."""
    url = (value or "").split(";")[0].strip()
    if url and "://" not in url and re.match(r"^[a-z0-9.-]+\.[a-z]{2,}(/|$)", url, re.I):
        url = "https://" + url
    parts = urlsplit(url)
    return url if parts.scheme in ("http", "https") and parts.netloc and " " not in url else None


def street_address(tags):
    """``addr:housenumber`` + ``addr:street`` (+ unit), e.g. "1826 University Ave"."""
    street = tags.get("addr:street", "").strip()
    if not street:
        return None
    number = tags.get("addr:housenumber", "").strip()
    unit = tags.get("addr:unit", "").strip()
    return " ".join(p for p in (number, street, f"Unit {unit}" if unit else "") if p)


def wikipedia_url(tag):
    """OSM ``wikipedia`` ("en:Alderman Library") to the article URL."""
    lang, sep, title = (tag or "").partition(":")
    if not sep or not re.fullmatch(r"[a-z]{2,3}(-[a-z]+)?", lang.strip()) or not title.strip():
        return None
    return f"https://{lang.strip()}.wikipedia.org/wiki/{quote(title.strip().replace(' ', '_'))}"


def details(tags):
    """The extra OSM tags a place sheet shows; a missing or unusable tag is left out."""
    out = {}
    website = web_url(tags.get("website") or tags.get("contact:website") or tags.get("url"))
    if website:
        out["website"] = website
    phone = (tags.get("phone") or tags.get("contact:phone") or "").split(";")[0].strip()
    if phone:
        out["phone"] = phone
    if tags.get("wheelchair") in ("yes", "no", "limited", "designated"):
        out["wheelchair"] = tags["wheelchair"]
    cuisine = [c.strip().replace("_", " ") for c in tags.get("cuisine", "").split(";") if c.strip()]
    if cuisine:
        out["cuisine"] = cuisine
    levels = tags.get("building:levels", "").strip()
    if re.fullmatch(r"\d{1,3}", levels) and int(levels) > 0:
        out["building_levels"] = int(levels)
    address = street_address(tags)
    if address:
        out["address"] = address
    for key in ("operator", "description"):
        if tags.get(key, "").strip():
            out[key] = " ".join(tags[key].split())
    if _WIKIDATA_RE.match(tags.get("wikidata", "").strip()):
        out["wikidata"] = tags["wikidata"].strip()
    wikipedia = wikipedia_url(tags.get("wikipedia"))
    if wikipedia:
        out["wikipedia"] = wikipedia
    return out


def to_feature(element, curated):
    tags = element.get("tags") or {}
    name = tags.get("name", "").strip()
    if element["type"] == "node":
        lat, lon = element.get("lat"), element.get("lon")
    else:
        center = element.get("center") or {}
        lat, lon = center.get("lat"), center.get("lon")
    if not name or lat is None or lon is None:
        return None
    aliases = []
    for key in ("alt_name", "short_name", "official_name", "old_name"):
        aliases += [a.strip() for a in tags.get(key, "").split(";") if a.strip()]
    aliases += curated.get(name, [])
    props = {
        "name": name,
        "aliases": sorted(set(a for a in aliases if a != name)),
        "category": category(tags),
        "osm": f"{element['type']}/{element['id']}",
    }
    if osm_tag(tags):
        props["osm_tag"] = osm_tag(tags)
    if tags.get("opening_hours"):
        props["hours"] = tags["opening_hours"]
    props.update(details(tags))
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props}


def image_files(entities):
    """{Q-id: Commons file title} from a ``wbgetentities`` response (first P18)."""
    out = {}
    for qid, entity in ((entities or {}).get("entities") or {}).items():
        for claim in ((entity or {}).get("claims") or {}).get("P18") or []:
            value = ((claim.get("mainsnak") or {}).get("datavalue") or {}).get("value")
            if isinstance(value, str) and value.strip():
                out[qid] = "File:" + value.strip().replace("_", " ")
                break
    return out


def photo_from_imageinfo(page):
    """``photo`` from one Commons ``imageinfo`` page, or None without a
    thumbnail or a licence."""
    info = ((page or {}).get("imageinfo") or [None])[0] or {}
    meta = info.get("extmetadata") or {}
    license_name = plain_text((meta.get("LicenseShortName") or {}).get("value"))
    url = web_url(info.get("thumburl") or info.get("url"))
    if not license_name or not url:
        return None
    photo = {"url": url, "license": license_name, "page": info.get("descriptionurl") or None}
    author = plain_text((meta.get("Artist") or {}).get("value"))
    if author:
        photo["author"] = author
    return {k: v for k, v in photo.items() if v}


def photos_by_file(response):
    """{file title as asked: photo} from a Commons ``imageinfo`` query response."""
    query = (response or {}).get("query") or {}
    asked = {n["to"]: n["from"] for n in query.get("normalized") or []}
    out = {}
    for page in (query.get("pages") or {}).values():
        photo = photo_from_imageinfo(page)
        if photo and page.get("title"):
            out[asked.get(page["title"], page["title"])] = photo
    return out


def _warn(message):
    print(f"warning: {message}", file=sys.stderr)


def _get_json(client, url, params):
    """One Wikimedia API answer, or None (logged) when the request fails or
    the API answers with an ``error`` body: a failed batch only loses photos."""
    try:
        response = client.get(url, params={**params, "format": "json"}, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        _warn(f"{url} failed: {exc}")
        return None
    if isinstance(body, dict) and body.get("error"):
        _warn(f"{url} answered with an error: {body['error']}")
        return None
    return body


def fetch_photos(client, qids):
    """{Q-id: photo} for the Wikidata items that have a licensed P18 image.

    A failed Wikidata or Commons batch is logged and skipped; its items get
    no photo. Ends with a count of the items left without one."""
    qids = sorted(set(qids))
    files = {}
    for i in range(0, len(qids), WIKI_BATCH):
        files.update(image_files(_get_json(client, WIKIDATA_API, {
            "action": "wbgetentities", "ids": "|".join(qids[i:i + WIKI_BATCH]), "props": "claims",
        })))
    titles = sorted(set(files.values()))
    photos = {}
    for i in range(0, len(titles), WIKI_BATCH):
        photos.update(photos_by_file(_get_json(client, COMMONS_API, {
            "action": "query", "titles": "|".join(titles[i:i + WIKI_BATCH]), "prop": "imageinfo",
            "iiprop": "url|extmetadata", "iiurlwidth": PHOTO_WIDTH,
            "iiextmetadatafilter": "Artist|LicenseShortName",
        })))
    found = {qid: photos[title] for qid, title in files.items() if title in photos}
    skipped = len(qids) - len(found)
    if skipped:
        print(f"{skipped} of {len(qids)} wikidata places got no photo "
              "(no image, no licence, or a failed request)", file=sys.stderr)
    return found


def add_photos(features, client):
    """Set ``photo`` on each feature whose wikidata item has a licensed image."""
    qids = [f["properties"]["wikidata"] for f in features if f["properties"].get("wikidata")]
    if not qids:
        return 0
    photos = fetch_photos(client, qids)
    for feature in features:
        photo = photos.get(feature["properties"].get("wikidata"))
        if photo:
            feature["properties"]["photo"] = photo
    return sum(1 for f in features if f["properties"].get("photo"))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("slug", help="school pack folder under schools/")
    args = parser.parse_args()

    pack_dir = REPO / "schools" / args.slug
    pack = yaml.safe_load((pack_dir / "school.yaml").read_text()) or {}
    area = (pack.get("campus") or {}).get("osm_area") or {}
    if area.get("type") not in ("way", "relation") or not area.get("id"):
        sys.exit(f"{pack_dir}/school.yaml needs campus.osm_area: {{type: way|relation, id: <osm id>}}")

    curated_path = pack_dir / "aliases.yaml"
    curated = yaml.safe_load(curated_path.read_text()) if curated_path.exists() else {}

    response = httpx.post(
        OVERPASS_URL,
        data={"data": overpass_query(area["type"], area["id"])},
        headers={"User-Agent": USER_AGENT},
        timeout=90,
    )
    response.raise_for_status()
    elements = response.json().get("elements") or []

    with httpx.Client(timeout=60, follow_redirects=True) as client:
        out_path, counts, with_photos = write_places(pack_dir, area, elements, curated or {}, client)
    print(f"Wrote {sum(counts.values())} places ({with_photos} with photos) to {out_path.relative_to(REPO)}: {counts}")


def write_places(pack_dir, area, elements, curated, client):
    """Build and write ``places.geojson`` from Overpass elements; Wikimedia
    goes through *client*. Returns (path, counts by category, photo count)."""
    features, seen = [], set()
    for element in elements:
        feature = to_feature(element, curated)
        if not feature:
            continue
        key = (feature["properties"]["name"].lower(), feature["properties"]["category"])
        if key in seen:
            continue
        seen.add(key)
        features.append(feature)
    features.sort(key=lambda f: (f["properties"]["category"], f["properties"]["name"]))
    with_photos = add_photos(features, client)

    out = {
        "type": "FeatureCollection",
        "source": "OpenStreetMap contributors (ODbL), via Overpass API; photos from Wikimedia Commons",
        "osm_area": f"{area['type']}/{area['id']}",
        "features": features,
    }
    out_path = pack_dir / "places.geojson"
    out_path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    counts = {}
    for f in features:
        counts[f["properties"]["category"]] = counts.get(f["properties"]["category"], 0) + 1
    return out_path, counts, with_photos


if __name__ == "__main__":
    main()
