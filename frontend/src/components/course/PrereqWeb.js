import React, { useEffect, useMemo, useRef } from 'react';
import { cytoscape } from './CourseVisuals';

/**
 * The prerequisite web: AND / OR inputs -> this course, and with `unlocks`
 * the courses it opens. The graph is drawn by cytoscape (fcose) and hidden
 * from assistive tech; a nested list carries the same content (D22) and
 * shows when it takes keyboard focus.
 */

let groupSeq = 0;
const NONE = [];

/** cytoscape elements for `tree` (prereq_tree JSON) feeding `self`. */
export function webElements(self, tree, unlocks = []) {
  const nodes = new Map();
  const edges = [];
  const addNode = (id, extra = {}) => {
    if (!nodes.has(id)) nodes.set(id, { data: { id, label: extra.label ?? id, ...extra.data }, classes: extra.classes || '' });
    return id;
  };
  addNode(self, { classes: 'self' });

  const link = (source, target, classes = '') => {
    if (source === target) return;
    edges.push({ data: { id: `${source}->${target}`, source, target }, classes });
  };

  // An OR group becomes a compound node holding its options; an AND group
  // links each of its parts straight to the course.
  const place = (node, parent) => {
    if (!node) return;
    if (node.kind === 'course') {
      if (!node.course || node.course === self) return;
      if (!nodes.has(node.course)) addNode(node.course, { classes: 'prereq', data: parent ? { parent } : {} });
      if (!parent) link(node.course, self, 'and');
      return;
    }
    if (node.kind === 'any') {
      const options = (node.children || []).filter(Boolean);
      if (options.length === 1) { place(options[0], parent); return; }
      groupSeq += 1;
      const group = addNode(`or-${groupSeq}`, { label: 'or', classes: 'group', data: parent ? { parent } : {} });
      options.forEach((child) => place(child, group));
      if (!parent) link(group, self, 'and');
      return;
    }
    (node.children || []).forEach((child) => place(child, parent));
  };
  place(tree, null);

  unlocks.forEach((item) => {
    const id = typeof item === 'string' ? item : item?.identifier;
    if (!id || id === self) return;
    addNode(id, { classes: 'unlock' });
    link(self, id, 'unlock');
  });

  return [...nodes.values(), ...edges];
}

function readToken(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

function graphStyle() {
  const ink = readToken('--ink', '#111114');
  const inkSoft = readToken('--ink-soft', '#6B6B70');
  const paper = readToken('--paper', '#FFFFFF');
  const campus = readToken('--domain-campus', '#1F9D55');
  const academics = readToken('--domain-academics', '#2E7CF6');
  const academicsTint = readToken('--domain-academics-tint', '#E8F0FE');
  const academicsInk = readToken('--domain-academics-ink', '#1A4FB0');
  const font = readToken('--font-app', 'Inter, sans-serif');
  return [
    {
      selector: 'node',
      style: {
        'background-color': campus,
        color: paper,
        label: 'data(label)',
        'font-family': font,
        'font-size': 10,
        'font-weight': 700,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': 54,
        width: 46,
        height: 46,
      },
    },
    { selector: 'node.self', style: { 'background-color': ink, width: 58, height: 58, 'font-size': 12 } },
    {
      selector: 'node.unlock',
      style: { 'background-color': academicsTint, color: academicsInk, width: 40, height: 40 },
    },
    {
      selector: 'node.group',
      style: {
        'background-opacity': 0,
        'border-width': 1.5,
        'border-style': 'dashed',
        'border-color': campus,
        color: inkSoft,
        'text-valign': 'bottom',
        'font-weight': 400,
        padding: 10,
        shape: 'round-rectangle',
      },
    },
    {
      selector: 'edge',
      style: { width: 1.5, 'line-color': campus, 'curve-style': 'bezier' },
    },
    { selector: 'edge.unlock', style: { 'line-color': academics } },
  ];
}

function PrereqList({ tree, self, onOpenCourse }) {
  const item = (node, key) => {
    if (!node) return null;
    if (node.kind === 'course') {
      return (
        <li key={key}>
          {onOpenCourse && node.course !== self
            ? <button type="button" onClick={() => onOpenCourse(node.course)}>{node.course}</button>
            : node.course}
        </li>
      );
    }
    return (
      <li key={key}>
        {node.kind === 'any' ? 'One of' : 'All of'}
        <ul>{(node.children || []).map((child, i) => item(child, `${key}-${i}`))}</ul>
      </li>
    );
  };
  return <ul>{item(tree, 'root')}</ul>;
}

export default function PrereqWeb({
  course, tree, unlocks = NONE, onOpenCourse, size = 'tile',
}) {
  const containerRef = useRef(null);
  const elements = useMemo(() => webElements(course, tree, unlocks), [course, tree, unlocks]);
  const openRef = useRef(onOpenCourse);
  openRef.current = onOpenCourse;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let graph;
    try {
      graph = cytoscape({
        container: containerRef.current,
        elements,
        style: graphStyle(),
        layout: { name: 'fcose', animate: false, fit: true, padding: 16 },
        userZoomingEnabled: false,
        userPanningEnabled: false,
        boxSelectionEnabled: false,
        autoungrabify: true,
      });
      graph.on('tap', 'node', (event) => {
        const node = event.target;
        if (node.hasClass('group') || node.hasClass('self')) return;
        openRef.current?.(node.id());
      });
    } catch {
      // No canvas (tests, very old browsers): the list below still carries the web.
      graph = null;
    }
    return () => { try { graph?.destroy(); } catch { /* already gone */ } };
  }, [elements]);

  const unlockIds = unlocks
    .map((item) => (typeof item === 'string' ? item : item?.identifier))
    .filter(Boolean);

  return (
    <div className={`cp-web cp-web--${size}`}>
      <div ref={containerRef} className="cp-web-graph" aria-hidden="true" data-testid="prereq-web-graph" />
      <div className="cp-web-list">
        <p>Prerequisites</p>
        {tree ? <PrereqList tree={tree} self={course} onOpenCourse={onOpenCourse} /> : null}
        {unlockIds.length > 0 && (
          <>
            <p>Unlocks</p>
            <ul>
              {unlockIds.map((id) => (
                <li key={id}>
                  {onOpenCourse ? <button type="button" onClick={() => onOpenCourse(id)}>{id}</button> : id}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
