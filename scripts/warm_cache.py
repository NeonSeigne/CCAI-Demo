#!/usr/bin/env python3
"""Download a school pack's feeds into the source cache before a demo.

Fetches every event feed and academics snapshot file the pack configures, so
the backend can then run with SOURCES_OFFLINE=1 (no third-party campus data
calls). Prints what was cached and each file's data date.

Usage (from the repo root):
    backend/.venv/bin/python scripts/warm_cache.py uva
"""

import argparse
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("slug", help="school pack folder under schools/")
    args = parser.parse_args()

    os.environ["SCHOOL"] = args.slug
    os.environ.pop("CONFIG_PATH", None)
    os.environ.pop("SOURCES_OFFLINE", None)

    from app.config import get_settings
    from app.sources import cache

    settings = get_settings()
    targets = [(f.name or "event feed", f.url, False) for f in settings.student_life.event_feeds]
    snapshot = settings.academics.snapshot
    if settings.academics.provider == "csv_snapshot":
        if snapshot.sections_url:
            targets.append(("sections snapshot", snapshot.sections_url, True))
        targets += [("grades snapshot", url, True) for url in snapshot.grades_urls]

    failures = 0
    for label, url, with_date in targets:
        try:
            # refresh_hours=0 forces a fresh download.
            text, as_of = cache.load_text(url, 0, with_commit_date=with_date)
            when = f", data as of {as_of}" if as_of else ""
            print(f"ok    {label}: {len(text) // 1024} KB{when}  {url}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL  {label}: {exc}  {url}")
    places = settings.campus.places_file
    if places:
        path = REPO / "schools" / args.slug / places
        print(f"{'ok' if path.exists() else 'MISSING':5} places: {path.relative_to(REPO)}"
              + ("" if path.exists() else f" (run scripts/import_places.py {args.slug})"))
    print(f"Cache: {cache.CACHE_DIR / args.slug}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
