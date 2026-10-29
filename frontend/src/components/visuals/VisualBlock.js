import React from 'react';
import CourseVisualCard, { isCourseVisualType } from './CourseVisualCard';
import { CourseGradeDistribution } from '../course/CourseVisuals';
import PrereqTree from './PrereqTree';
import EventListCard from './EventListCard';
import PlaceCard from './PlaceCard';
import CourseAnswerCard from './CourseAnswerCard';
import SourcesChecked from './SourcesChecked';
import ProposalCard from './ProposalCard';
import CourseShortlistCard from './CourseShortlistCard';
import '../../styles/CampusCards.css';

/**
 * Registry mapping a structured visual spec (`visual.type`) to a vetted,
 * pre-built component. Unknown types render nothing, so the backend can add
 * new visual kinds without breaking older clients.
 *
 * Legacy `gpa_chart` specs (persisted in older sessions) map onto the shared
 * CourseGradeDistribution card using embedded distribution data — no fetch.
 * New `course_*` refs hydrate from /api/catalog/{id} via CourseVisualCard.
 */

function LegacyGpaChart({ visual }) {
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
}

const REGISTRY = {
  gpa_chart: LegacyGpaChart,
  prereq_tree: PrereqTree,
  next_courses_tree: PrereqTree,
  event_list: EventListCard,
  place_card: PlaceCard,
  sources_checked: SourcesChecked,
  course_answer: CourseAnswerCard,
  proposed_change: ProposalCard,
  course_shortlist: CourseShortlistCard,
};

const VisualBlock = ({ visual, onSelectCourse, onAsk }) => {
  if (!visual || !visual.type) return null;

  if (isCourseVisualType(visual.type)) {
    return <CourseVisualCard visual={visual} onSelectCourse={onSelectCourse} />;
  }

  const Component = REGISTRY[visual.type];
  if (!Component) return null;
  return <Component visual={visual} onSelectCourse={onSelectCourse} onAsk={onAsk} />;
};

export default VisualBlock;
