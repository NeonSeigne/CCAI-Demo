import React, { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppDialog from '../AppDialog';
import CoursePopup from './CoursePopup';
import { usePlanner } from '../../contexts/PlannerContext';
import { usePopupContainer } from '../shell/PageColumnContext';
import { useToast } from '../Toast';
import { normalizeCourseId } from '../planner/completedCourses';
import usePopupAsk from '../../hooks/usePopupAsk';
import {
  COURSE_PARAM, useCloseCourse, useCloseOnce, useOpenCourse,
} from '../../utils/openCourse';

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
 * Reads `?course=ID` on any signed-in route and shows the course pop-up over
 * the page column, so the rail and the chat dock stay live (eng R8, R15, D3).
 */
export default function CoursePopupHost() {
  const [params] = useSearchParams();
  const courseId = (params.get(COURSE_PARAM) || '').trim();
  const close = useCloseOnce(courseId, useCloseCourse());
  const openCourse = useOpenCourse();
  const ask = usePopupAsk(courseId, close);
  const planner = usePlanner();
  const toast = useToast();
  const { container, ready } = usePopupContainer();

  // The plan for Fits and Add, once per course: the planner object changes
  // with every load, and a failing load would otherwise retry in a loop.
  const plannerRef = useRef(planner);
  plannerRef.current = planner;
  useEffect(() => {
    if (courseId) plannerRef.current?.ensureLoaded?.();
  }, [courseId]);

  const plan = planner?.view?.plan || null;
  const term = plan?.term || null;
  const requirements = useMemo(
    () => requirementLabels(courseId, planner?.programs, plan?.profile?.program_ids),
    [courseId, planner?.programs, plan?.profile?.program_ids],
  );

  if (!courseId || !ready) return null;

  // A course already in the plan can't be added again, so it gets no Add and no Fits.
  const planned = (plan?.courses || []).some((c) => normalizeCourseId(c.id) === normalizeCourseId(courseId));

  const onAdd = planner && term && !planned ? (id) => {
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
      container={container}
      onClose={close}
      maxWidth={false}
      aria-labelledby="course-popup-title"
      slotProps={{ paper: { className: 'pop-dialog-paper' } }}
    >
      <CoursePopup
        courseId={courseId}
        term={term}
        plan={plan && !planned ? { revision: plan.revision } : null}
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
