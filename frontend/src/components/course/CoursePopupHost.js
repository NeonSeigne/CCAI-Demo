import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppDialog from '../AppDialog';
import CoursePopup from './CoursePopup';
import { usePlanner } from '../../contexts/PlannerContext';
import { usePageColumn } from '../shell/PageColumnContext';
import { useToast } from '../Toast';
import useAsk from '../../hooks/useAsk';
import { COURSE_PARAM, useCloseCourse, useOpenCourse } from '../../utils/openCourse';

/** "Comp Sci B.S. · Core" for each rule of the student's programs that lists `id`. */
export function requirementLabels(id, programs, programIds) {
  const wanted = new Set(programIds || []);
  const out = [];
  (programs || []).forEach((program) => {
    if (wanted.size && !wanted.has(program.id)) return;
    (program.rules || []).forEach((rule) => {
      if ((rule.courses || []).includes(id)) out.push(`${program.name} · ${rule.title}`);
    });
  });
  return [...new Set(out)];
}

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

/**
 * Reads `?course=ID` on any signed-in route and shows the course pop-up over
 * the page column, so the rail and the chat dock stay live (eng R8, R15, D3).
 */
export default function CoursePopupHost() {
  const [params] = useSearchParams();
  const courseId = (params.get(COURSE_PARAM) || '').trim();
  const close = useCloseOnce(courseId, useCloseCourse());
  const openCourse = useOpenCourse();
  const ask = useAsk();
  const planner = usePlanner();
  const toast = useToast();
  const pageColumn = usePageColumn();

  const plan = planner?.view?.plan || null;
  const term = plan?.term || null;
  const requirements = useMemo(
    () => requirementLabels(courseId, planner?.programs, plan?.profile?.program_ids),
    [courseId, planner?.programs, plan?.profile?.program_ids],
  );

  useEffect(() => {
    if (courseId) planner?.ensureLoaded?.();
  }, [courseId, planner]);

  if (!courseId) return null;

  const onAdd = planner && term ? (id) => {
    planner.edit([{ op: 'add', course: id }])
      .then(() => toast?.show?.({ message: `Added to ${term}` }))
      .catch(() => toast?.show?.({
        message: "Couldn't save",
        tone: 'error',
        actions: [{ label: 'Retry', onClick: () => onAdd(id) }],
      }));
  } : undefined;

  return (
    <AppDialog
      open
      container={pageColumn || undefined}
      onClose={close}
      maxWidth={false}
      aria-labelledby="course-popup-title"
      slotProps={{ paper: { className: 'pop-dialog-paper' } }}
    >
      <CoursePopup
        courseId={courseId}
        term={term}
        plan={plan ? { revision: plan.revision } : null}
        requirements={requirements}
        onAdd={onAdd}
        onAsk={ask}
        onClose={close}
        onOpenCourse={openCourse}
        titleId="course-popup-title"
      />
    </AppDialog>
  );
}
