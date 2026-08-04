import React from 'react';
import { CourseGradeDistribution } from '../course/CourseVisuals';

/**
 * Legacy chat visual wrapper for persisted `gpa_chart` specs.
 * New messages emit `course_*` refs rendered by CourseVisualCard.
 */
const GpaChart = ({ visual }) => {
  if (!visual) return null;
  const grades = {
    ...(visual.distribution || {}),
    total: visual.total || 0,
  };
  return (
    <CourseGradeDistribution
      grades={grades}
      termLabel={visual.course ? `${visual.course} (all terms)` : 'Historical'}
      variant="compact"
      titleSuffix={
        visual.average_gpa != null
          ? `${visual.course || 'Course'} — avg GPA ${Number(visual.average_gpa).toFixed(2)}`
          : undefined
      }
    />
  );
};

export default GpaChart;
