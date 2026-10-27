import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import useCourseDetail from '../../hooks/useCourseDetail';

/** Where an answer's cards came from, one line per source, in a closed dropdown. */
export function sourceLines(visuals = [], courseSource) {
  const lines = [];
  const courses = visuals.filter((v) => v.type === 'course_answer');
  if (courses.length && courseSource?.name) {
    const seats = courses.some((v) => v.types?.includes('course_schedule'));
    lines.push({ label: seats ? 'Grades and seats' : 'Grades', name: courseSource.name, url: courseSource.url });
  }
  if (courses.some((v) => v.types?.includes('course_instructors'))) {
    lines.push({ label: 'Instructor ratings', name: 'Rate My Professors' });
  }
  const calendars = new Set(
    visuals.filter((v) => v.type === 'event_list')
      .flatMap((v) => (v.events || []).map((e) => e.calendar).filter(Boolean)),
  );
  calendars.forEach((calendar) => lines.push({ label: 'Events', name: `${calendar} calendar` }));
  const osm = visuals.some((v) => v.type === 'place_card'
    && (v.places || []).some((p) => (p.map_url || '').includes('openstreetmap.org')));
  if (osm) lines.push({ label: 'Map', name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' });
  return lines;
}

export default function AnswerSources({ visuals = [] }) {
  const { authToken } = useAuth();
  const firstCourse = visuals.find((v) => v.type === 'course_answer');
  const { data } = useCourseDetail(firstCourse?.course, authToken, firstCourse?.term);
  const lines = sourceLines(visuals, data?.source);
  if (!lines.length) return null;

  return (
    <details className="answer-sources">
      <summary>Sources</summary>
      <ul>
        {lines.map((line) => (
          <li key={`${line.label}-${line.name}`}>
            {line.label}:{' '}
            {line.url ? <a href={line.url} target="_blank" rel="noopener noreferrer">{line.name}</a> : line.name}
          </li>
        ))}
      </ul>
    </details>
  );
}
