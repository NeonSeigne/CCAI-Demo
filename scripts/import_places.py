#!/usr/bin/env python3
"""Build schools/<slug>/places.geojson from OpenStreetMap.

Reads the school pack's ``campus.osm_area`` ({type: way|relation, id}) and asks
the Overpass API for named buildings, libraries, dining, health, recreation,
landmarks (lawns, quads, monuments, museums) and bus stops inside it. Each
place becomes a GeoJSON Point with ``name``, ``aliases``, ``category`` and
optional ``hours``. Aliases come from OSM
(alt_name, short_name, official_name, old_name) plus the pack's optional
``aliases.yaml`` ({"<OSM name>": ["UMC", ...]}), which is where hand-curated
student nicknames go.

Usage:
    python3 scripts/import_places.py cu-boulder

Respects Overpass usage: one query, identified User-Agent, 60s timeout.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import httpx
import yaml

REPO = Path(__file__).resolve().parents[1]
# Set OVERPASS_URL to use another public instance when the main one is busy.
OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
USER_AGENT = "CCAI-Demo-import-places/1.0 (+https://github.com/NeonSeigne/CCAI-Demo)"

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
    if tags.get("opening_hours"):
        props["hours"] = tags["opening_hours"]
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props}


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

    features, seen = [], set()
    for element in elements:
        feature = to_feature(element, curated or {})
        if not feature:
            continue
        key = (feature["properties"]["name"].lower(), feature["properties"]["category"])
        if key in seen:
            continue
        seen.add(key)
        features.append(feature)
    features.sort(key=lambda f: (f["properties"]["category"], f["properties"]["name"]))

    out = {
        "type": "FeatureCollection",
        "source": "OpenStreetMap contributors (ODbL), via Overpass API",
        "osm_area": f"{area['type']}/{area['id']}",
        "features": features,
    }
    out_path = pack_dir / "places.geojson"
    out_path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    counts = {}
    for f in features:
        counts[f["properties"]["category"]] = counts.get(f["properties"]["category"], 0) + 1
    print(f"Wrote {len(features)} places to {out_path.relative_to(REPO)}: {counts}")


if __name__ == "__main__":
    main()
