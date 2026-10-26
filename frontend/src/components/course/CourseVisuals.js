import React, { useEffect, useMemo, useRef } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { courseRoute, GRADE_KEYS } from './courseUtils';

cytoscape.use(fcose);

const chartColors = [
  'var(--ink-soft)',
  'var(--accent-red)',
  'var(--ink-soft)',
  'var(--ink-soft)',
  'var(--accent-blue)',
  'var(--ink)',
  'var(--accent-green)',
  'var(--ink)',
];

const sectionClass = (variant) => (
  `course-section ${variant === 'compact' ? 'course-card--compact' : ''}`
);

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

/** @deprecated Prefer CourseGradeDistribution */
export const GradeDistribution = CourseGradeDistribution;

export function CourseTrends({ rows, variant = 'page' }) {
  const keys = ['f', 'd', 'c', 'bc', 'b', 'ab', 'a'];
  if (!rows?.length) {
    return <div className="course-empty">No historical grade trends are available.</div>;
  }

  return (
    <section className={sectionClass(variant)} aria-labelledby="trends-title">
      <div className="course-section-heading">
        <div>
          <p className="course-eyebrow">Historical performance</p>
          <h2 id="trends-title">Grade trends by term</h2>
        </div>
      </div>
      <div className={`course-chart ${variant === 'compact' ? 'course-chart--compact' : 'course-chart--tall'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="term" tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tickLine={false} axisLine={false} width={42} />
            <Tooltip />
            <Legend />
            {keys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={key.toUpperCase()}
                stackId="grades"
                fill={chartColors[index + 1]}
                stroke={chartColors[index + 1]}
                fillOpacity={index % 2 ? 0.42 : 0.68}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {variant !== 'compact' && (
        <div className="course-table-wrap">
          <table className="course-data-table">
            <caption className="sr-only">Historical letter-grade counts by term</caption>
            <thead>
              <tr>
                <th>Term</th>
                {keys.map((key) => <th key={key}>{key.toUpperCase()}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code}>
                  <th scope="row">{row.term}</th>
                  {keys.map((key) => (
                    <td key={key}>{Number(row[key] || 0).toLocaleString()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** @deprecated Prefer CourseTrends */
export const TrendsChart = CourseTrends;

export function CoursePrereqMap({ elements, onNavigate, variant = 'page' }) {
  const containerRef = useRef(null);
  const courseNodes = useMemo(
    () => (elements || []).filter((element) => element?.data?.id && !element.data.source),
    [elements],
  );

  useEffect(() => {
    if (!containerRef.current || !elements?.length) return undefined;
    const tokens = getComputedStyle(document.documentElement);
    const ink = tokens.getPropertyValue('--ink').trim();
    const inkSoft = tokens.getPropertyValue('--ink-soft').trim();
    const font = tokens.getPropertyValue('--font-app').trim();
    const graph = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': ink,
            color: ink,
            label: 'data(id)',
            'font-family': font,
            'font-size': 12,
            'text-valign': 'bottom',
            'text-margin-y': 8,
            width: 22,
            height: 22,
          },
        },
        {
          selector: 'node:parent',
          style: {
            'background-opacity': 0.04,
            'border-color': inkSoft,
            'border-opacity': 0.25,
            label: 'data(id)',
            'text-valign': 'top',
            padding: 22,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': inkSoft,
            'target-arrow-color': inkSoft,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
      ],
      layout: { name: 'fcose', animate: false, fit: true, padding: 38 },
    });
    graph.on('tap', 'node', (event) => {
      const id = event.target.id();
      if (/\d/.test(id)) onNavigate?.(id);
    });
    return () => graph.destroy();
  }, [elements, onNavigate]);

  if (!elements?.length) {
    return <div className="course-empty">No prerequisite map is available for this course.</div>;
  }

  return (
    <section className={sectionClass(variant)} aria-labelledby="prereq-map-title">
      <div className="course-section-heading">
        <div>
          <p className="course-eyebrow">Course relationships</p>
          <h2 id="prereq-map-title">Prerequisites map</h2>
        </div>
        <span className="course-hint">Select a node to open its course page</span>
      </div>
      <div
        ref={containerRef}
        className={`course-prereq-graph ${variant === 'compact' ? 'course-prereq-graph--compact' : ''}`}
        aria-hidden="true"
      />
      <div className="course-node-fallback" aria-label="Courses in prerequisite map">
        {courseNodes.filter((node) => /\d/.test(node.data.id)).map((node) => (
          <button key={node.data.id} type="button" onClick={() => onNavigate?.(node.data.id)}>
            {node.data.id}
          </button>
        ))}
      </div>
    </section>
  );
}

/** @deprecated Prefer CoursePrereqMap */
export const PrerequisiteGraph = CoursePrereqMap;

export const getCourseHref = courseRoute;
