import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CoursePopup from './CoursePopup';
import { usePlanner } from '../../contexts/PlannerContext';
import { useToast } from '../Toast';
import { normalizeCourseId } from '../planner/completedCourses';
import { dateIn, prereqStates } from '../planner/semester/semesterData';
import { MAX_TICKED, readTicked, writeTicked } from '../catalog/catalogFormat';
import { useSchool } from '../../modules/campus';
import { useOpenCourse } from '../../utils/openCourse';

/**
 * The ids Compare shows after adding `id` to the ticked courses: kept in
 * order, without repeats, the oldest dropped past the limit.
 */
export function compareIds(ticked, id) {
  const ids = (ticked || []).map((c) => c.identifier).filter((x) => x !== id);
  return [...ids, id].slice(-MAX_TICKED);
}

/**
 * The course pop-up as the shell's pop-up host shows it for `?course=ID`:
 * the plan's term (for the instructor rating and Add to plan), the
 * student's prerequisite states, and Compare (PopupHost owns the dialog).
 */
export default function CourseSheet({ courseId, onClose, titleId }) {
  const openCourse = useOpenCourse();
  const navigate = useNavigate();
  const planner = usePlanner();
  const toast = useToast();
  const { timezone } = useSchool();

  // The plan, once per course: the planner object changes with every load,
  // and a failing load would otherwise retry in a loop.
  const plannerRef = useRef(planner);
  plannerRef.current = planner;
  useEffect(() => {
    if (courseId) plannerRef.current?.ensureLoaded?.();
  }, [courseId]);

  const plan = planner?.view?.plan || null;
  const term = plan?.term || null;
  const states = useMemo(() => (plan ? prereqStates(plan, dateIn(timezone)) : undefined), [plan, timezone]);

  // A course already in the plan can't be added again.
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

  const onCompare = useCallback((id, title) => {
    const ticked = readTicked();
    const ids = compareIds(ticked, id);
    writeTicked(ids.map((x) => ({
      identifier: x,
      title: x === id ? title || '' : ticked.find((c) => c.identifier === x)?.title || '',
    })));
    navigate(`/courses/compare?${new URLSearchParams({ ids: ids.join(',') })}`);
  }, [navigate]);

  return (
    <CoursePopup
      courseId={courseId}
      term={term}
      states={states}
      onAdd={onAdd}
      onCompare={onCompare}
      onClose={onClose}
      onOpenCourse={openCourse}
      titleId={titleId}
    />
  );
}
