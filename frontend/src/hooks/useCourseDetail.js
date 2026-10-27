import { useCallback, useEffect, useState } from 'react';
import { fetchCourseDetail } from '../services/courseApi';

// One request per course and term for the page's lifetime: an answer's course
// card and its sources line read the same payload. Failures are not kept.
const responses = new Map();

function loadCourse(identifier, token, term) {
  const key = `${identifier.trim().toUpperCase()}|${term || ''}`;
  if (!responses.has(key)) {
    const request = fetchCourseDetail(identifier, { token, term });
    request.catch(() => responses.delete(key));
    responses.set(key, request);
  }
  return responses.get(key);
}

export default function useCourseDetail(identifier, token, term) {
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

    loadCourse(identifier, token, term)
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
  }, [identifier, token, term, requestVersion]);

  return { data, error, loading, retry };
}
