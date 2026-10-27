"""Pick the academics provider a school pack configures.

Each provider is a module exposing the same coroutines the course tools call:
``search_courses``, ``course_grades``, ``prerequisites``, ``next_courses`` and
``course_sections``, each returning the tool's result dict. A provider that
lacks a capability returns an ``error`` result for it.
"""

from types import ModuleType

from app.config import get_settings

PROVIDERS = ("uw_coursemap", "csv_snapshot")


def get_provider() -> ModuleType:
    name = get_settings().academics.provider
    if name == "uw_coursemap":
        from app.tools import _uw_source

        return _uw_source
    if name == "csv_snapshot":
        from app.sources import csv_snapshot

        return csv_snapshot
    raise ValueError(f"Unknown academics provider '{name}'. Expected one of {PROVIDERS}.")


def links_to_course_pages() -> bool:
    """Whether course identifiers resolve on the course detail page."""
    return get_settings().academics.provider == "uw_coursemap"
