import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getEvent, getPlace, listEvents } from '../api/campus';
import { previewEdits } from '../api/planner';
import { isAbort } from '../utils/loading';

/**
 * Data hooks for the event and place pop-ups and the course pop-up's plan
 * preview. Course summaries and ratings come from the course module's cached
 * loader (`modules/course`). Each returns
 * `{data, error, loading, retry}`: `data` stays null until the request
 * answers, `error` is the thrown `ApiError` (D7: a failed request is shown,
 * a missing field is not). A changed key aborts the previous request.
 */


/** One request per `key`; `load(token, signal)` resolves to the data. */
function useRequest(key, load, enabled = true) {
  const { authToken } = useAuth() || {};
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(enabled && key) });
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const retry = useCallback(() => setVersion((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !key || !authToken) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });
    Promise.resolve()
      .then(() => loadRef.current(authToken, controller.signal))
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (isAbort(error) || controller.signal.aborted) return;
        setState({ data: null, error, loading: false });
      });
    return () => controller.abort();
  }, [authToken, key, enabled, version]);

  return { ...state, retry };
}

/**
 * What adding `id` would change in the plan (`POST /api/planner/preview`):
 * `{diff, revision}`. Keyed by the ops payload and the plan revision (R2).
 */
export function useCoursePreview(id, { revision, enabled = true } = {}) {
  const course = (id || '').trim();
  const ops = [{ op: 'add', course }];
  const key = course ? `${JSON.stringify(ops)}@${revision ?? ''}` : '';
  return useRequest(
    key,
    (token, signal) => previewEdits(token, { ops, expected_revision: revision }, { signal }),
    enabled,
  );
}

/** One event (`GET /api/events/{id}`): `{event, timezone}`. `from` adds walk minutes. */
export function useEventDetail(id, { from } = {}) {
  const key = id ? `${id}|${from || ''}` : '';
  return useRequest(key, (token, signal) => getEvent(token, id, { from: from || undefined, signal }));
}

/** An events window (`GET /api/events`), for the related lists. */
export function useEventList({ window = 'next_7_days', from, enabled = true } = {}) {
  const key = `${window}|${from || ''}`;
  return useRequest(
    key,
    (token, signal) => listEvents(token, { window, from: from || undefined }, { signal }),
    enabled,
  );
}

/** One place (`GET /api/places/{id}`): `{place}`. `from` adds walk minutes. */
export function usePlaceDetail(id, { from } = {}) {
  const key = id ? `${id}|${from || ''}` : '';
  return useRequest(key, (token, signal) => getPlace(token, id, { from: from || undefined, signal }));
}
