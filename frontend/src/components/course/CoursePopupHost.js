import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppDialog from '../AppDialog';
import CoursePopup from './CoursePopup';
import { useChat } from '../../contexts/ChatContext';
import { usePlanner } from '../../contexts/PlannerContext';
import { useToast } from '../Toast';
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
 * Reads `?course=ID` on any route and shows the course pop-up (eng R8).
 *
 * TODO(tab-workspaces, Lane D): render inside the page-column container
 * (AppDialog `container`, between the rail and the chat dock, D3) once that
 * shell lands; for now it is a plain AppDialog over the whole window.
 */
export default function CoursePopupHost() {
  const [params] = useSearchParams();
  const courseId = (params.get(COURSE_PARAM) || '').trim();
  const closeCourse = useCloseCourse();
  const openCourse = useOpenCourse();
  const chat = useChat();
  const planner = usePlanner();
  const toast = useToast();

  const plan = planner?.view?.plan || null;
  const term = plan?.term || null;
  const requirements = useMemo(
    () => requirementLabels(courseId, planner?.programs, plan?.profile?.program_ids),
    [courseId, planner?.programs, plan?.profile?.program_ids],
  );

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
      onClose={closeCourse}
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
        onAsk={chat?.attach ? (item) => chat.attach(item) : undefined}
        onClose={closeCourse}
        onOpenCourse={openCourse}
        titleId="course-popup-title"
      />
    </AppDialog>
  );
}
