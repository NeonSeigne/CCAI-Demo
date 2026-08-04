"""
Shared SQLite helpers for the UW-Madison course-data tools.

The leading underscore keeps this module out of the tool registry
(``app.tools.__init__`` only registers modules that export both
``TOOL_DEFINITION`` and ``execute``).

The database is produced by ``scripts/scrape_uw_courses.py`` and ships as a
committed snapshot. Tools read from it read-only; queries are synchronous
(SQLite), so callers wrap :func:`query` in ``asyncio.to_thread`` to avoid
blocking the event loop.
"""

import logging
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from app.config import get_settings

logger = logging.getLogger(__name__)

# Backend root = directory that contains the ``app`` package
# (.../backend). __file__ is .../app/tools/_uw_db.py.
_BACKEND_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_DB_PATH = "data/uw_courses.db"


def get_db_path(tool_name: str) -> Path:
    """Resolve the SQLite path for *tool_name* from its tool config.

    Relative paths are resolved against the backend root so the tools work
    regardless of the process working directory. Falls back to
    :data:`DEFAULT_DB_PATH` when the tool config omits ``db_path``.
    """
    cfg = get_settings().tools.get_tool_config(tool_name)
    raw = cfg.get("db_path") or DEFAULT_DB_PATH
    path = Path(raw)
    if not path.is_absolute():
        path = _BACKEND_ROOT / path
    return path


def query(
    db_path: Path,
    sql: str,
    params: Optional[Sequence[Any]] = None,
) -> List[Dict[str, Any]]:
    """Run a read-only query and return rows as a list of dicts.

    Raises :class:`FileNotFoundError` when the database file is missing so the
    calling tool can surface a clear configuration error.
    """
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"UW course database not found at {db_path}")

    uri = f"file:{db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(sql, tuple(params or ()))
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def normalize_identifier(text: str) -> str:
    """Collapse whitespace in a course identifier, e.g. ``" comp sci  300 "``.

    The stored identifier format is ``"COMP SCI 300"`` (subjects upper-cased,
    single spaces). This only normalizes spacing/case; subject ordering is left
    to the caller's LIKE matching.
    """
    return " ".join((text or "").split()).upper()
