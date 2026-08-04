import React from 'react';
import {
  calculateARate,
  calculateCompletionRate,
  calculateGpa,
  formatMetric,
  getHistoricalAverageClassSize,
  resolveGradeContext,
} from './courseUtils';

export function CourseDelta({ current, historical, percentagePoints = false }) {
  if (current == null || historical == null) {
    return <span className="course-delta">No historical comparison</span>;
  }
  const delta = percentagePoints
    ? current - historical
    : historical === 0 ? 0 : ((current - historical) / historical) * 100;
  return (
    <span className={`course-delta ${delta >= 0 ? 'course-delta--up' : 'course-delta--down'}`}>
      {delta >= 0 ? '+' : ''}{delta.toFixed(2)}% <small>from Historical</small>
    </span>
  );
}

export function CourseMetricCard({
  label,
  value,
  current,
  historical,
  percentagePoints,
  variant = 'page',
}) {
  return (
    <article className={`course-metric-card ${variant === 'compact' ? 'course-card--compact' : ''}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <CourseDelta current={current} historical={historical} percentagePoints={percentagePoints} />
    </article>
  );
}

const METRIC_BUILDERS = {
  course_gpa: ({ selectedGrades, historical }) => {
    const current = calculateGpa(selectedGrades);
    return {
      label: 'Grade Point Average',
      value: formatMetric(current),
      current,
      historical: calculateGpa(historical),
    };
  },
  course_completion_rate: ({ selectedGrades, historical }) => {
    const current = calculateCompletionRate(selectedGrades);
    return {
      label: 'Completion Rate',
      value: formatMetric(current, 2, '%'),
      current,
      historical: calculateCompletionRate(historical),
      percentagePoints: true,
    };
  },
  course_a_rate: ({ selectedGrades, historical }) => {
    const current = calculateARate(selectedGrades);
    return {
      label: 'A Rate',
      value: formatMetric(current, 2, '%'),
      current,
      historical: calculateARate(historical),
      percentagePoints: true,
    };
  },
  course_class_size: ({ selectedGrades, course }) => ({
    label: 'Class Size',
    value: Number(selectedGrades?.total || 0).toLocaleString(),
    current: selectedGrades?.total,
    historical: getHistoricalAverageClassSize(course.term_data),
  }),
};

/** Render one metric card from a hydrated course payload + visual type. */
export function CourseMetricFromPayload({ payload, metricType, variant = 'page' }) {
  const ctx = resolveGradeContext(payload);
  const builder = METRIC_BUILDERS[metricType];
  if (!builder || !ctx.selectedGrades) {
    return <div className="course-empty">Metric unavailable for this course.</div>;
  }
  return <CourseMetricCard variant={variant} {...builder(ctx)} />;
}

export function CourseMetricsRow({ payload, variant = 'page' }) {
  return (
    <div className={`course-metrics ${variant === 'compact' ? 'course-metrics--compact' : ''}`}>
      {Object.keys(METRIC_BUILDERS).map((metricType) => (
        <CourseMetricFromPayload
          key={metricType}
          payload={payload}
          metricType={metricType}
          variant={variant}
        />
      ))}
    </div>
  );
}

export default CourseMetricCard;
