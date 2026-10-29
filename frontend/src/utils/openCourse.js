import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** The query parameter the course pop-up host reads (R8). */
export const COURSE_PARAM = 'course';

/** `location` with `?course=ID` set (or removed when `id` is empty), as a path string. */
export function courseLocation(location, id) {
  const params = new URLSearchParams(location?.search || '');
  const course = (id || '').trim();
  if (course) params.set(COURSE_PARAM, course);
  else params.delete(COURSE_PARAM);
  const search = params.toString();
  return `${location?.pathname || '/'}${search ? `?${search}` : ''}${location?.hash || ''}`;
}

/**
 * `openCourse(id)` opens the course pop-up over the current page by adding
 * `?course=ID` to the location (a new history entry, so Back closes it).
 */
export function useOpenCourse() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback((id) => {
    const course = (id || '').trim();
    if (!course) return;
    // From one open course to another: replace, so Close and Back still leave the pop-up.
    const alreadyOpen = new URLSearchParams(location.search).has(COURSE_PARAM);
    navigate(courseLocation(location, course), alreadyOpen
      ? { replace: true, state: location.state }
      : { replace: false, state: { openedCourse: true } });
  }, [navigate, location]);
}

/**
 * `closeCourse()` removes `?course=`: back through history when `openCourse`
 * added the entry, else by replacing the location (a link or the redirect).
 */
export function useCloseCourse() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (location.state?.openedCourse) navigate(-1);
    else navigate(courseLocation(location, ''), { replace: true });
  }, [navigate, location]);
}
