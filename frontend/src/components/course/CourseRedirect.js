import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

/** The old course page (eng R6): `/courses/:id` opens the pop-up on Courses. */
export default function CourseRedirect() {
  const { courseIdentifier = '' } = useParams();
  const search = new URLSearchParams({ course: courseIdentifier }).toString();
  return <Navigate to={`/courses?${search}`} replace />;
}
