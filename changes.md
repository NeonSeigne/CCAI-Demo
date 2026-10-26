# Changes

A running log of changes made to support modular, per-school branding.

## Modular per-school branding

Per-deployment model: one config file per school, selected via `CONFIG_PATH`. The
goal is that adding a new school requires only a new `<school>_config.yaml` and a
`CONFIG_PATH` pointing at it -- no code edits and no hard-coded institution strings.

### Added
- `app.institution` config field in the backend `AppConfig`
  (`backend/app/config.py`) so the school/institution name is
  config-driven. It is exposed to the frontend automatically via
  `get_frontend_config()` (`app.dict()`).
- "Adding a school" section in `README.md` documenting the per-deployment recipe.

### Changed
- `frontend/src/components/CopyrightNotice.js` now renders the
  institution name from `config.app.institution` (via `useAppConfig`) instead of a
  hard-coded "University of Colorado Boulder". When `institution` is empty the
  school clause is omitted gracefully.
- `undergrad_config.yaml` and `phd_config.yaml` now set `app.institution`.

## Per-school tools

### Changed
- `rate_my_professor` is now locked to a single school per deployment
  (`backend/app/tools/rate_my_professor.py`):
  - `school_id` is **required** whenever the tool is enabled. A new validator on
    `ToolsConfig` in `backend/app/config.py` makes the app fail
    fast on startup if it is missing.
  - Results are strict to that school: the RMP query now uses `fallback: false`
    and any returned professor whose `school.id` does not match the configured
    `school_id` is dropped.
  - The tool description is built from `app.institution`, and the leftover
    hard-coded CU school number in `RMP_SEARCH_URL` plus CU-specific docstrings
    were removed.
- `search_courses` (`backend/app/tools/search_courses.py`) is
  explicitly marked CU Boulder / FOSE-only and now returns a graceful "unsupported"
  result for non-CU `catalog` values. Non-CU schools disable it via
  `tools.search_courses.enabled: false`.
- `phd_config.yaml` / `undergrad_config.yaml` tool comments document the required
  `school_id` and the CU-only course search.

### Notes
- Out of scope (follow-up): a generic, multi-platform course-catalog provider so
  course search can work for non-FOSE schools.
