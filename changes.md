# Changes

A running log of changes made to support modular, per-school branding.

## Modular per-school branding

Per-deployment model: one config file per school, selected via `CONFIG_PATH`. The
goal is that adding a new school requires only a new `<school>_config.yaml` and a
`CONFIG_PATH` pointing at it -- no code edits and no hard-coded institution strings.

### Added
- `app.institution` config field in the backend `AppConfig`
  (`multi_llm_chatbot_backend/app/config.py`) so the school/institution name is
  config-driven. It is exposed to the frontend automatically via
  `get_frontend_config()` (`app.dict()`).
- "Adding a school" section in `README.md` documenting the per-deployment recipe.

### Changed
- `phd-advisor-frontend/src/components/CopyrightNotice.js` now renders the
  institution name from `config.app.institution` (via `useAppConfig`) instead of a
  hard-coded "University of Colorado Boulder". When `institution` is empty the
  school clause is omitted gracefully.
- `undergrad_config.yaml` and `phd_config.yaml` now set `app.institution`.

### Notes
- Out of scope (follow-up): the course-search (FOSE) tool
  (`multi_llm_chatbot_backend/app/tools/search_courses.py`) and the Rate My
  Professor tool description remain CU-specific.
