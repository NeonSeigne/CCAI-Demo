import { useEffect, useState } from 'react';
import { getCatalogCourse, request } from '../../../api/campus';
import { useAuth } from '../../../contexts/AuthContext';

/**
 * Catalog summaries (`/api/catalog/{id}`: grades, sections) and instructor
 * ratings (`/api/catalog/ratings/{id}`) for the semester view's cards, one
 * request per course per session. A failed lookup leaves the card with the
 * report's own fields; nothing is shown in place of missing data (D7).
 */
const summaries = new Map();
const ratings = new Map();

/** Forget cached lookups (tests, sign-out). */
export function clearCourseDetailsCache() {
  summaries.clear();
  ratings.clear();
}

const once = (cache, key, load) => {
  if (!cache.has(key)) {
    const run = load().catch(() => null);
    cache.set(key, run);
  }
  return cache.get(key);
};

/** The catalog summary of `id`, or null when it can't be loaded. */
export const loadCourseSummary = (token, id) => once(summaries, id, () => getCatalogCourse(token, id));

const loadRatings = (token, id) => once(ratings, id, () => request(
  token,
  `/api/catalog/ratings/${encodeURIComponent(String(id))}`,
));

/** `{[id]: {summary, ratings}}` for every id, filled in as each lookup lands. */
export default function useCourseDetails(ids) {
  const { authToken } = useAuth() || {};
  const [details, setDetails] = useState({});
  const key = [...new Set(ids)].sort().join('|');

  useEffect(() => {
    let alive = true;
    const list = key ? key.split('|') : [];
    list.forEach((id) => {
      loadCourseSummary(authToken, id).then((summary) => {
        if (!alive) return;
        setDetails((current) => ({ ...current, [id]: { ...current[id], summary } }));
        if (!summary) return;
        loadRatings(authToken, id).then((data) => {
          if (!alive || !data) return;
          setDetails((current) => ({ ...current, [id]: { ...current[id], ratings: data.ratings || [] } }));
        });
      });
    });
    return () => { alive = false; };
  }, [authToken, key]);

  return details;
}
