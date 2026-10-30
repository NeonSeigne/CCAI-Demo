import React, { useEffect, useMemo, useRef } from 'react';
import CoursePopup from './CoursePopup';
import { usePlanner } from '../../contexts/PlannerContext';
import { useToast } from '../Toast';
import { normalizeCourseId } from '../planner/completedCourses';
import { useOpenCourse } from '../../utils/openCourse';

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
 * The course pop-up as the shell's pop-up host shows it for `?course=ID`:
 * the plan's term, requirement chips, Fits and Add (PopupHost owns the
 * dialog, close and ask).
 */
export default function CourseSheet({
  courseId, onClose, onAsk, titleId,
}) {
  const openCourse = useOpenCourse();
  const planner = usePlanner();
  const toast = useToast();

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
    <CoursePopup
      courseId={courseId}
      term={term}
      plan={plan && !planned ? { revision: plan.revision } : null}
      requirements={requirements}
      onAdd={onAdd}
      onAsk={onAsk}
      onClose={onClose}
      onOpenCourse={openCourse}
      titleId={titleId}
    />
  );
}
