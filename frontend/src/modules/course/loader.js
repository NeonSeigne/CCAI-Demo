/**
 * One cached reader for course data: catalog summaries (`GET /api/catalog/{id}`)
 * and instructor ratings (`GET /api/catalog/ratings/{id}?term=`).
 *
 * Every screen (pop-up, chat cards, Home, Courses, Compare, Saved, the
 * Semester view) reads through here, so one course is fetched once per
 * session. Requests in flight are shared; a failed one is forgotten so the
 * next reader tries again. The cache is cleared on sign-out and whenever the
 * signed-in token changes.
 *
 * The adapter is the seam: `httpAdapter` in the app, `memoryAdapter({...})`
 * in tests (`setCourseAdapter`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCatalogCourse, getCourseRatings } from '../../api/campus';
import { useAuth } from '../../contexts/AuthContext';

/** The app's adapter: the catalog API. */
export const httpAdapter = {
  course: (token, id) => getCatalogCourse(token, id, {}),
  ratings: (token, id, { term } = {}) => getCourseRatings(token, id, term ? { term } : {}),
};

/**
 * An adapter over fixed data, for tests: `courses` and `ratings` map an id to
 * a payload, or to an Error (or a function returning either) to fail with.
 * Unknown ids reject with a 404-like error. `calls` records every load.
 */
export function memoryAdapter({ courses = {}, ratings = {} } = {}) {
  const calls = [];
  const answer = (table, id, kind) => {
    calls.push({ kind, id });
    const key = Object.keys(table).find((k) => k.toUpperCase() === id.toUpperCase());
    let value = key === undefined ? undefined : table[key];
    if (typeof value === 'function') value = value(id);
    if (value instanceof Error) return Promise.reject(value);
    if (value === undefined) return Promise.reject(Object.assign(new Error('Not Found'), { status: 404, notFound: true }));
    return Promise.resolve(value);
  };
  return {
    calls,
    course: (token, id) => answer(courses, id, 'course'),
    ratings: (token, id, { term } = {}) => answer(ratings, id, term ? `ratings:${term}` : 'ratings'),
  };
}

let adapter = httpAdapter;
const cache = new Map(); // key -> {promise, settled, data, error}
let lastToken;

/** Use another adapter (tests); null puts the HTTP one back. Clears the cache. */
export function setCourseAdapter(next) {
  adapter = next || httpAdapter;
  cache.clear();
}

/** Forget every course and rating (sign-out, tests). */
export function clearCourseCache() {
  cache.clear();
  lastToken = undefined;
}

const courseKey = (id) => `course:${String(id || '').trim().toUpperCase()}`;
const ratingsKey = (id, term) => `ratings:${String(id || '').trim().toUpperCase()}|${term || ''}`;

/** Signing out (no token) or in as someone else (a different token) starts a fresh cache. */
function noteToken(token) {
  if (lastToken !== undefined && (token || null) !== lastToken) cache.clear();
  lastToken = token || null;
}

function once(key, load) {
  const hit = cache.get(key);
  if (hit) return hit.promise;
  const entry = { settled: false, data: undefined, error: undefined };
  entry.promise = Promise.resolve()
    .then(load)
    .then((data) => {
      entry.settled = true;
      entry.data = data;
      return data;
    }, (error) => {
      if (cache.get(key) === entry) cache.delete(key);
      throw error;
    });
  cache.set(key, entry);
  return entry.promise;
}

/** The catalog summary of `id` (a promise); shared while in flight, kept once loaded. */
export function loadCourse(token, id) {
  noteToken(token);
  const course = String(id || '').trim();
  return once(courseKey(course), () => adapter.course(token, course));
}

/** The ratings payload of `id` for `term` (a promise), cached like `loadCourse`. */
export function loadCourseRatings(token, id, { term } = {}) {
  noteToken(token);
  const course = String(id || '').trim();
  return once(ratingsKey(course, term), () => adapter.ratings(token, course, { term }));
}

/** A summary already loaded, without a request; undefined otherwise. */
export function peekCourse(id) {
  const hit = cache.get(courseKey(id));
  return hit?.settled ? hit.data : undefined;
}

function useToken() {
  try {
    return useAuth()?.authToken || null;
  } catch {
    return null;
  }
}

const IDLE = { data: null, error: null, loading: false };

/** {data, error, loading, retry} for one cached load; `key` null holds it. */
function useCached(key, peek, load, token) {
  const [state, setState] = useState(() => {
    const data = key && token ? peek() : undefined;
    return data !== undefined ? { data, error: null, loading: false } : { ...IDLE, loading: Boolean(key && token) };
  });
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion((n) => n + 1), []);

  useEffect(() => {
    noteToken(token);
    if (!key || !token) {
      setState(IDLE);
      return undefined;
    }
    const known = peek();
    if (known !== undefined) {
      setState({ data: known, error: null, loading: false });
      return undefined;
    }
    let alive = true;
    setState({ data: null, error: null, loading: true });
    load().then(
      (data) => { if (alive) setState({ data, error: null, loading: false }); },
      (error) => { if (alive) setState({ data: null, error, loading: false }); },
    );
    return () => { alive = false; };
    // peek/load are rebuilt each render from `key` and `token`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token, version]);

  return useMemo(() => ({ ...state, retry }), [state, retry]);
}

/**
 * The catalog summary for a course: {data, error, loading, retry}. `data`
 * stays null until it answers; `error` is the thrown ApiError (404 means the
 * course doesn't exist). `enabled: false` holds the request.
 */
export function useCourse(id, { enabled = true } = {}) {
  const token = useToken();
  const course = String(id || '').trim();
  const key = enabled && course ? courseKey(course) : null;
  return useCached(key, () => peekCourse(course), () => loadCourse(token, course), token);
}

/**
 * Instructor ratings for a course and term: {data, error, loading, retry}.
 * `data.instructor_rating` is the band's "Instructor rating" (null: hide it).
 */
export function useCourseRatings(id, { term, enabled = true } = {}) {
  const token = useToken();
  const course = String(id || '').trim();
  const key = enabled && course ? ratingsKey(course, term) : null;
  const peek = () => {
    const hit = cache.get(ratingsKey(course, term));
    return hit?.settled ? hit.data : undefined;
  };
  return useCached(key, peek, () => loadCourseRatings(token, course, { term }), token);
}

/**
 * Summaries and ratings for many courses at once (the Semester view):
 * `{[id]: {summary, ratings, error}}`, filled in as each lookup lands.
 * `summary` is null and `error` true when a summary failed; ratings load
 * after the summary and stay undefined when they fail.
 */
export function useCourses(ids, { ratings: withRatings = true } = {}) {
  const token = useToken();
  const [details, setDetails] = useState({});
  const list = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))].sort();
  const key = list.join('|');

  useEffect(() => {
    noteToken(token);
    let alive = true;
    const put = (id, fields) => {
      if (alive) setDetails((current) => ({ ...current, [id]: { ...current[id], ...fields } }));
    };
    (key ? key.split('|') : []).forEach((id) => {
      loadCourse(token, id).then((summary) => {
        put(id, { summary, error: false });
        if (withRatings) {
          loadCourseRatings(token, id).then((data) => put(id, { ratings: data?.ratings || [] }), () => {});
        }
      }, () => put(id, { summary: null, error: true }));
    });
    return () => { alive = false; };
  }, [token, key, withRatings]);

  return details;
}
