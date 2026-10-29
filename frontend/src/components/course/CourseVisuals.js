import React from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import '../../styles/CourseVisuals.css';

cytoscape.use(fcose);

/** cytoscape with the fcose layout registered, for every course graph. */
export { cytoscape };

/** UW Course Map letter buckets, as legacy `gpa_chart` visuals carry them. */
export const GRADE_KEYS = ['other', 'f', 'd', 'c', 'bc', 'b', 'ab', 'a'];

const sectionClass = (variant) => (
  `course-section ${variant === 'compact' ? 'course-card--compact' : ''}`
);

/** The legacy chat grade chart (`gpa_chart` visuals with an embedded distribution). */
export function CourseGradeDistribution({
  grades,
  termLabel,
  variant = 'page',
  titleSuffix,
}) {
  const data = GRADE_KEYS.map((key) => ({
    grade: key === 'other' ? 'Other' : key.toUpperCase(),
    students: Number(grades?.[key] || 0),
  }));
  const heading = titleSuffix
    || `${termLabel || 'Historical'} grade distribution`;

  return (
    <section className={sectionClass(variant)} aria-labelledby="grade-distribution-title">
      <div className="course-section-heading">
        <div>
          <p className="course-eyebrow">Grade Distribution</p>
          <h2 id="grade-distribution-title">{heading}</h2>
        </div>
      </div>
      <div
        className={`course-chart ${variant === 'compact' ? 'course-chart--compact' : ''}`}
        aria-label={heading}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="grade" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={42} />
            <Tooltip cursor={{ fill: 'var(--paper-sunken)' }} />
            <Bar dataKey="students" fill="var(--ink)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
