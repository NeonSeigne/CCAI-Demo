import { useEffect, useState } from 'react';
import { getCatalogCourse, request } from '../../../api/campus';
import { useAuth } from '../../../contexts/AuthContext';

/**
 * Catalog summaries (`/api/catalog/{id}`: grades, sections) and instructor
 * ratings (`/api/catalog/ratings/{id}`) for the semester view's cards, one
 * request per course at a time. A lookup that fails is forgotten, so the
 * next caller tries again; the card keeps the report's own fields and
 * shows nothing in place of the missing data (D7).
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
    const run = Promise.resolve().then(load);
    cache.set(key, run);
    run.catch(() => { if (cache.get(key) === run) cache.delete(key); });
  }
  return cache.get(key);
};

/** The catalog summary of `id`; rejects when it can't be loaded (and is not cached). */
export const loadCourseSummary = (token, id) => once(summaries, id, () => getCatalogCourse(token, id));

const loadRatings = (token, id) => once(ratings, id, () => request(
  token,
  `/api/catalog/ratings/${encodeURIComponent(String(id))}`,
));

/** `{[id]: {summary, ratings, error}}` for every id, filled in as each lookup lands. */
export default function useCourseDetails(ids) {
  const { authToken } = useAuth() || {};
  const [details, setDetails] = useState({});
  const key = [...new Set(ids)].sort().join('|');

  useEffect(() => {
    let alive = true;
    const list = key ? key.split('|') : [];
    const put = (id, fields) => {
      if (alive) setDetails((current) => ({ ...current, [id]: { ...current[id], ...fields } }));
    };
    list.forEach((id) => {
      loadCourseSummary(authToken, id).then((summary) => {
        put(id, { summary, error: false });
        loadRatings(authToken, id).then((data) => put(id, { ratings: data?.ratings || [] }), () => {});
      }, () => put(id, { summary: null, error: true }));
    });
    return () => { alive = false; };
  }, [authToken, key]);

  return details;
}
