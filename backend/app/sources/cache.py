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

import hashlib
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
    readable = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{parts.netloc}{parts.path}".strip("/"))[-120:]
    # The hash covers the whole URL, so feeds that differ only by query string
    # (or share a long common tail) never share a file.
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
    base = CACHE_DIR / slug / f"{readable}-{digest}"
    return base, base.with_name(base.name + ".meta.json")


def _legacy_path(url: str) -> Path:
    """Where the cache kept *url* before file names carried a URL hash."""
    parts = urlparse(url)
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{parts.netloc}{parts.path}".strip("/"))[-150:]
    return CACHE_DIR / (get_settings().school.slug or "default") / name


def _meta_url_is(meta_path: Path, url: str) -> bool:
    try:
        return json.loads(meta_path.read_text()).get("url") == url
    except (OSError, ValueError, AttributeError):
        return False


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
        # Copies warmed before the URL hash was added stay readable.
        data_path = _legacy_path(url)
        meta_path = data_path.with_name(data_path.name + ".meta.json")
        if not data_path.exists() or not _meta_url_is(meta_path, url):
            # Old names could collide across URLs; only trust a legacy copy
            # whose meta says it is this exact URL.
            return None
    try:
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        return data_path.read_text(), float(meta.get("fetched_at", 0.0)), meta.get("as_of")
    except (OSError, ValueError, TypeError, AttributeError) as exc:
        logger.warning("Ignoring unreadable cache entry for %s: %s", url, exc)
        return None


def _write_atomic(path: Path, text: str) -> None:
    """Write via a temp file and ``os.replace`` so readers never see half a file."""
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def _write(url: str, text: str, as_of: Optional[str]) -> bool:
    """Cache *text*; returns False (and logs) when the disk write fails."""
    data_path, meta_path = _paths(url)
    try:
        data_path.parent.mkdir(parents=True, exist_ok=True)
        # Data first, then meta: a crash in between leaves the old meta's
        # timestamp, so the entry is refetched once it ages out.
        _write_atomic(data_path, text)
        _write_atomic(meta_path, json.dumps({"fetched_at": time.time(), "as_of": as_of, "url": url}))
    except OSError as exc:
        logger.warning("Could not cache %s (%s); serving the download uncached", url, exc)
        return False
    return True


def load_text(
    url: str, refresh_hours: float, *, with_commit_date: bool = False, strict: bool = False
) -> Tuple[str, Optional[str]]:
    """Return ``(text, as_of)`` for *url*, following the cache rules above.

    ``as_of`` is the source file's last commit date when *with_commit_date* is
    set and the file lives on GitHub, else ``None``. With *strict*, a failed
    refresh or cache write raises instead of being worked around (for
    ``warm_cache.py``).
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
        if cached and not strict:
            logger.warning("Refresh of %s failed (%s); serving cached copy", url, exc)
            return cached[0], cached[2]
        raise RuntimeError(f"Source unavailable: {exc}") from exc
    if not _write(url, text, as_of) and strict:
        raise RuntimeError(f"Downloaded {url} but could not write the cache copy")
    return text, as_of


def fetched_at(url: str) -> Optional[float]:
    """When the cached copy of *url* was downloaded (epoch seconds), if any."""
    cached = _read(url)
    return cached[1] if cached else None


def read_entry(key: str) -> Optional[Tuple[str, float]]:
    """``(text, fetched_at)`` stored under *key* by :func:`write_entry`.

    For results that are not one URL's download (walking routes keyed by a
    place pair); the caller decides how old is too old.
    """
    cached = _read(key)
    return (cached[0], cached[1]) if cached else None


def write_entry(key: str, text: str) -> bool:
    """Store *text* under *key*; False when the disk write fails."""
    return _write(key, text, None)
