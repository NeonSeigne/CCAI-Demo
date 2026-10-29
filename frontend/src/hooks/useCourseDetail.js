import { useCallback, useEffect, useState } from 'react';
import { getCatalogCourse } from '../api/campus';

// One request per course for the page's lifetime: an answer's course card and
// its sources line read the same payload. Failures are not kept.
const responses = new Map();

function loadCourse(identifier, token) {
  const key = identifier.trim().toUpperCase();
  if (!responses.has(key)) {
    const request = getCatalogCourse(token, identifier.trim());
    request.catch(() => responses.delete(key));
    responses.set(key, request);
  }
  return responses.get(key);
}

/** Test hook: forget cached answers. */
export function clearCourseDetailCache() {
  responses.clear();
}

/**
 * The chat cards' course summary (`GET /api/catalog/{id}`, every school),
 * shared between the cards of one answer: `{data, error, loading, retry}`.
 */
export default function useCourseDetail(identifier, token) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => setRequestVersion((version) => version + 1), []);

  useEffect(() => {
    if (!identifier || !token) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadCourse(identifier, token)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError);
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [identifier, token, requestVersion]);

  return { data, error, loading, retry };
}
