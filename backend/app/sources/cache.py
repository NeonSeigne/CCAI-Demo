"""Disk cache for downloaded source files (CSV exports, iCal feeds).

Each school pack's downloads live under ``<CACHE_DIR>/<slug>/``. A copy younger
than ``refresh_hours`` is served as is; an older one is refreshed, and if the
refresh fails the last good copy is served. With ``SOURCES_OFFLINE=1`` only
cached copies are used, so a demo can run without third-party network calls.

    fresh copy ──────────────► serve
    stale copy ─► download ─┬► ok ─► write, serve
                            └► fail ─► serve stale copy
    no copy ────► download ─┬► ok ─► write, serve
                            └► fail ─► RuntimeError
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import urlparse

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

CACHE_DIR = Path(os.getenv("SOURCES_CACHE_DIR") or Path(__file__).resolve().parents[2] / ".cache" / "sources")
FETCH_TIMEOUT = 30.0
USER_AGENT = "CCAI-Demo/1.0 (+https://github.com/NeonSeigne/CCAI-Demo)"


def _paths(url: str) -> Tuple[Path, Path]:
    slug = get_settings().school.slug or "default"
    parts = urlparse(url)
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{parts.netloc}{parts.path}".strip("/"))[-150:]
    base = CACHE_DIR / slug / name
    return base, base.with_name(base.name + ".meta.json")


def github_commit_date(url: str) -> Optional[str]:
    """Last commit date (YYYY-MM-DD) of a raw.githubusercontent.com file."""
    parts = urlparse(url)
    if parts.netloc != "raw.githubusercontent.com":
        return None
    segments = parts.path.strip("/").split("/")
    if len(segments) < 4:
        return None
    owner, repo, ref, path = segments[0], segments[1], segments[2], "/".join(segments[3:])
    try:
        response = httpx.get(
            f"https://api.github.com/repos/{owner}/{repo}/commits",
            params={"path": path, "sha": ref, "per_page": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=10.0,
        )
        response.raise_for_status()
        commits = response.json()
        return commits[0]["commit"]["committer"]["date"][:10] if commits else None
    except Exception as exc:  # noqa: BLE001 — the date is a label, never a blocker
        logger.info("Could not read commit date for %s: %s", url, exc)
        return None


def _download(url: str, with_commit_date: bool) -> Tuple[str, Optional[str]]:
    response = httpx.get(
        url, timeout=FETCH_TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT}
    )
    response.raise_for_status()
    as_of = github_commit_date(url) if with_commit_date else None
    return response.text, as_of


def _read(url: str) -> Optional[Tuple[str, float, Optional[str]]]:
    data_path, meta_path = _paths(url)
    if not data_path.exists():
        return None
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    return data_path.read_text(), meta.get("fetched_at", 0.0), meta.get("as_of")


def _write(url: str, text: str, as_of: Optional[str]) -> None:
    data_path, meta_path = _paths(url)
    data_path.parent.mkdir(parents=True, exist_ok=True)
    data_path.write_text(text)
    meta_path.write_text(json.dumps({"fetched_at": time.time(), "as_of": as_of, "url": url}))


def load_text(
    url: str, refresh_hours: float, *, with_commit_date: bool = False
) -> Tuple[str, Optional[str]]:
    """Return ``(text, as_of)`` for *url*, following the cache rules above.

    ``as_of`` is the source file's last commit date when *with_commit_date* is
    set and the file lives on GitHub, else ``None``.
    """
    cached = _read(url)
    offline = os.getenv("SOURCES_OFFLINE") == "1"
    if cached and (offline or time.time() - cached[1] < refresh_hours * 3600):
        return cached[0], cached[2]
    if offline:
        raise RuntimeError(f"SOURCES_OFFLINE=1 and no cached copy of {url}")
    try:
        text, as_of = _download(url, with_commit_date)
    except Exception as exc:  # noqa: BLE001
        if cached:
            logger.warning("Refresh of %s failed (%s); serving cached copy", url, exc)
            return cached[0], cached[2]
        raise RuntimeError(f"Source unavailable: {exc}") from exc
    _write(url, text, as_of)
    return text, as_of


def fetched_at(url: str) -> Optional[float]:
    """When the cached copy of *url* was downloaded (epoch seconds), if any."""
    cached = _read(url)
    return cached[1] if cached else None
