import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** The query parameters the pop-up hosts read (eng R8): `?course=`, `?event=`. */
export const COURSE_PARAM = 'course';
export const EVENT_PARAM = 'event';

/**
 * History-state key marking an entry a pop-up added, so closing goes back
 * instead of pushing. Namespaced so pages reading their own state (ChatPage's
 * pendingPrompt / sessionId / startNew) leave it alone.
 */
export const POPUP_STATE = 'ccPopup';

/** `location` with `?param=value` set (or removed when `value` is empty), as a path string. */
export function paramLocation(location, param, value) {
  const params = new URLSearchParams(location?.search || '');
  const next = (value || '').trim();
  if (next) params.set(param, next);
  else params.delete(param);
  const search = params.toString();
  return `${location?.pathname || '/'}${search ? `?${search}` : ''}${location?.hash || ''}`;
}

export const courseLocation = (location, id) => paramLocation(location, COURSE_PARAM, id);

/**
 * `open(value)` sets `?param=value` on the current location: a new history
 * entry (Back closes it), or a replacement when one is already open.
 */
export function useOpenParam(param) {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback((value) => {
    const next = (value || '').trim();
    if (!next) return;
    const alreadyOpen = new URLSearchParams(location.search).has(param);
    navigate(paramLocation(location, param, next), alreadyOpen
      ? { replace: true, state: location.state }
      : { replace: false, state: { [POPUP_STATE]: param } });
  }, [navigate, location, param]);
}

/**
 * `close()` removes `?param=`: back through history when `useOpenParam`
 * added the entry, else by replacing the location (a link or the redirect).
 */
export function useCloseParam(param) {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (location.state?.[POPUP_STATE] === param) navigate(-1);
    else navigate(paramLocation(location, param, ''), { replace: true, state: location.state });
  }, [navigate, location, param]);
}

/** `openCourse(id)` opens the course pop-up over the current page (R8). */
export const useOpenCourse = () => useOpenParam(COURSE_PARAM);

/** `closeCourse()` removes `?course=`. */
export const useCloseCourse = () => useCloseParam(COURSE_PARAM);

/**
 * `close` that runs once per open value: Escape, the scrim and the Close
 * button can all fire before the location changes, and a second
 * `navigate(-1)` would leave the page.
 */
export function useCloseOnce(value, close) {
  const closingRef = useRef(false);
  useEffect(() => { closingRef.current = false; }, [value]);
  return useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    close();
  }, [close]);
}
