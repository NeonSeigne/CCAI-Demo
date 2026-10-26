import { useCallback, useEffect, useState } from 'react';
import { fetchCourseDetail } from '../services/courseApi';

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

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchCourseDetail(identifier, { token, term, signal: controller.signal })
      .then((payload) => setData(payload))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError(requestError);
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [identifier, token, term, requestVersion]);

  return { data, error, loading, retry };
}
