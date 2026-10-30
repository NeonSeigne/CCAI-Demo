/**
 * The school, read once from `/api/config` with the fallbacks inside, so no
 * screen reads raw config paths.
 */
import { useAppConfig } from '../../contexts/AppConfigContext';
import { zoneName } from '../../utils/eventWindows';

/** The monogram: the first part of the slug (uva, cu-boulder, uw-madison), else the name's capitals. */
function markOf(slug, name) {
  if (slug) return slug.split('-')[0].slice(0, 3).toUpperCase();
  return String(name || '').split(/\s+/).filter((word) => /^[A-Z]/.test(word)).map((word) => word[0]).join('').slice(0, 3) || '?';
}

/**
 * {name, shortName, mark, timezone, zoneLabel, slug, title, termDates} from a config:
 *
 *   name       "University of Virginia" (institution, else the app title, else "Your campus")
 *   shortName  "UVA" (app.short_name, else the name)
 *   mark       "UVA", "CU", "UW": the rail's monogram
 *   timezone   "America/New_York" or null
 *   zoneLabel  "Eastern Time", or "" without a zone
 *   termDates  {term: {first_day, last_day}} ({} when the config has none)
 */
export function schoolFacts(config) {
  const app = config?.app || {};
  const school = config?.school || {};
  const name = app.institution || app.title || 'Your campus';
  const shortName = app.short_name || name;
  const timezone = school.timezone || null;
  return {
    name,
    shortName,
    mark: markOf(school.slug, shortName),
    timezone,
    zoneLabel: zoneName(timezone),
    slug: school.slug || null,
    title: app.title || null,
    termDates: school.term_dates || {},
  };
}

/** The config, or null outside an AppConfigProvider. */
function useConfigOrNull() {
  try {
    return useAppConfig()?.config || null;
  } catch {
    return null;
  }
}

/** The school's facts for the current config (see `schoolFacts`). */
export function useSchool() {
  return schoolFacts(useConfigOrNull());
}
