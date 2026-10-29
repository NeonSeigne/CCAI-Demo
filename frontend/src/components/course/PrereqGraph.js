import React, {
  useEffect, useId, useMemo, useRef, useState,
} from 'react';
import '../../styles/CourseVisuals.css';

/**
 * The prerequisite graph (DESIGN.md "In-chat cards", R11): a layered SVG.
 * Columns run prerequisites → this term → the course asked → the courses it
 * unlocks (dashed); on a narrow container they become rows. AND parts each
 * get their own edge into the course; an OR group is one "One of" box with
 * its options inside and one edge out (an AND inside an OR is an "All of"
 * box). Course nodes are focusable buttons named by their code, with their
 * state as the description.
 *
 * Props:
 *   course       the course asked about (its id)
 *   tree         prereq_tree JSON ({kind: 'course'|'all'|'any', course, children})
 *   unlocks      ids or {identifier, title} the course opens
 *   states       {id: 'done' | 'now'} from the student's plan; optional
 *   titles       {id: title} for node subtitles; optional
 *   onOpenCourse called with an id when a node is chosen
 *   size         'tile' (pop-up tile, three unlocks) or 'full'
 *   label        the graph's accessible name
 */

const NW = 148;
const NH = 52;
const GAP = 14;
const COL_GAP = 40;
const PAD = 10;
const LABEL = 20;
const MARGIN = 8;
const VERTICAL_BELOW = 520;
const NONE = [];

export const STATE_WORD = {
  done: 'done', now: 'this term', asked: 'you asked', unlock: 'unlocks',
};

/** "comp sci  400" → "COMPSCI400", for matching ids from the plan and the catalog. */
export const courseKey = (id) => String(id || '').replace(/\s+/g, '').toUpperCase();

const unlockId = (item) => (typeof item === 'string' ? item : item?.identifier);

/**
 * The graph's items from `tree`, keeping its AND/OR meaning: an array of
 * top-level AND parts, each `{kind: 'course', id}` or
 * `{kind: 'group', mode: 'any'|'all', children}`.
 */
export function prereqItems(self, tree) {
  const seen = new Set([courseKey(self)]);
  const course = (node) => {
    const key = courseKey(node.course);
    if (!node.course || seen.has(key)) return null;
    seen.add(key);
    return { kind: 'course', id: node.course };
  };
  // Options of an OR: courses, "All of" boxes; a nested OR adds its options here.
  const options = (node) => {
    if (!node) return [];
    if (node.kind === 'course') return [course(node)].filter(Boolean);
    if (node.kind === 'any') return (node.children || []).flatMap(options);
    const parts = (node.children || []).flatMap(andParts);
    if (parts.length === 1) return parts;
    return parts.length ? [{ kind: 'group', mode: 'all', children: parts }] : [];
  };
  // Parts of an AND: courses, "One of" boxes; a nested AND adds its parts here.
  function andParts(node) {
    if (!node) return [];
    if (node.kind === 'course') return [course(node)].filter(Boolean);
    if (node.kind === 'any') {
      const opts = options(node);
      if (opts.length === 1) return opts;
      return opts.length ? [{ kind: 'group', mode: 'any', children: opts }] : [];
    }
    return (node.children || []).flatMap(andParts);
  }
  return andParts(tree);
}

const leaves = (item) => (item.kind === 'course' ? [item] : item.children.flatMap(leaves));

/** A group's edge colour: an OR is as far along as its best option, an AND as its least. */
function toneOf(item, stateOf) {
  if (item.kind === 'course') return stateOf(item.id) || 'plain';
  const tones = item.children.map((child) => toneOf(child, stateOf));
  const order = ['done', 'now', 'plain'];
  const pick = item.mode === 'any' ? Math.min : Math.max;
  return order[pick(...tones.map((t) => order.indexOf(t)))];
}

function sizeOf(item) {
  if (item.kind !== 'group') return { w: NW, h: NH };
  const kids = item.children.map(sizeOf);
  return {
    w: Math.max(...kids.map((k) => k.w)) + 2 * PAD,
    h: LABEL + PAD + kids.reduce((sum, k) => sum + k.h, 0) + GAP * (kids.length - 1) + PAD,
  };
}

/** Positions `item` (and a group's children) with its top-left at x, y. */
function place(item, x, y) {
  const { w, h } = sizeOf(item);
  if (item.kind !== 'group') return { ...item, x, y, w, h };
  let top = y + LABEL + PAD;
  const children = item.children.map((child) => {
    const size = sizeOf(child);
    const placed = place(child, x + (w - size.w) / 2, top);
    top += size.h + GAP;
    return placed;
  });
  return { ...item, x, y, w, h, children };
}

/**
 * Node and edge positions. `layers` are arrays of items, left to right (or
 * top to bottom when `vertical`); `width` caps a vertical layout's rows.
 */
export function layout(layers, { vertical = false, width = 0 } = {}) {
  const sized = layers.map((layer) => layer.map((item) => ({ item, ...sizeOf(item) })));
  if (!vertical) {
    let x = MARGIN;
    const heights = sized.map((layer) => layer.reduce((sum, s) => sum + s.h, 0) + GAP * (layer.length - 1));
    const H = Math.max(...heights) + 2 * MARGIN;
    const placed = sized.map((layer, i) => {
      const colW = Math.max(...layer.map((s) => s.w));
      let y = (H - heights[i]) / 2;
      const out = layer.map((s) => {
        const p = place(s.item, x + (colW - s.w) / 2, y);
        y += s.h + GAP;
        return p;
      });
      x += colW + COL_GAP;
      return out;
    });
    return { layers: placed, W: x - COL_GAP + MARGIN, H, vertical };
  }
  const maxW = Math.max(width - 2 * MARGIN, NW + 2 * PAD);
  let y = MARGIN;
  let W = 0;
  const lines = sized.map((layer) => {
    // Wrap a layer into lines that fit the width.
    const rows = [[]];
    let used = 0;
    layer.forEach((s) => {
      const row = rows[rows.length - 1];
      if (row.length && used + GAP + s.w > maxW) {
        rows.push([s]);
        used = s.w;
      } else {
        row.push(s);
        used += (row.length > 1 ? GAP : 0) + s.w;
      }
    });
    return rows.map((row) => {
      const rowW = row.reduce((sum, s) => sum + s.w, 0) + GAP * (row.length - 1);
      W = Math.max(W, rowW);
      return { row, rowW };
    });
  });
  const totalW = W + 2 * MARGIN;
  const placed = lines.map((rows) => {
    const out = [];
    rows.forEach(({ row, rowW }) => {
      let x = (totalW - rowW) / 2;
      const rowH = Math.max(...row.map((s) => s.h));
      row.forEach((s) => {
        out.push(place(s.item, x, y));
        x += s.w + GAP;
      });
      y += rowH + GAP;
    });
    y += COL_GAP - GAP;
    return out;
  });
  return { layers: placed, W: totalW, H: y - COL_GAP + MARGIN, vertical };
}

function edgePath(a, b, vertical) {
  if (vertical) {
    const x1 = a.x + a.w / 2; const y1 = a.y + a.h;
    const x2 = b.x + b.w / 2; const y2 = b.y;
    const my = (y1 + y2) / 2;
    return { d: `M${x1} ${y1} C${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - 5}`, end: [x2, y2 - 3] };
  }
  const x1 = a.x + a.w; const y1 = a.y + a.h / 2;
  const x2 = b.x; const y2 = b.y + b.h / 2;
  const mx = (x1 + x2) / 2;
  return { d: `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2 - 5} ${y2}`, end: [x2 - 3, y2] };
}

/** "Introduction to Econometrics" cut to what fits a node. */
const fit = (text, chars) => (text && text.length > chars ? `${text.slice(0, chars - 1).trimEnd()}…` : text);

function CourseNode({ node, onOpen }) {
  const { x, y, w, h, id, state, title } = node;
  const interactive = Boolean(onOpen) && state !== 'asked' && state !== 'more';
  const word = STATE_WORD[state];
  const open = () => onOpen(id);
  const descId = useId();
  return (
    <g
      className={`pg-node is-${state}`}
      data-course={id}
      data-state={state}
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={id}
      aria-describedby={word ? descId : undefined}
      onClick={interactive ? open : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      } : undefined}
    >
      {word && <desc id={descId}>{word}</desc>}
      <rect className="pg-box" x={x} y={y} width={w} height={h} rx={16} />
      <text className="pg-code" x={x + 14} y={title ? y + 22 : y + h / 2 + 4} aria-hidden="true">{id}</text>
      {title && <text className="pg-title" x={x + 14} y={y + 39} aria-hidden="true">{fit(title, 18)}</text>}
      {state === 'done' && (
        <g aria-hidden="true">
          <circle className="pg-check" cx={x + w - 16} cy={y + 16} r={8} />
          <path className="pg-check-mark" d={`M${x + w - 20} ${y + 16} l3 3 l5 -6`} />
        </g>
      )}
    </g>
  );
}

function GroupNode({ node, onOpen }) {
  const label = node.mode === 'any' ? 'One of' : 'All of';
  return (
    <g className={`pg-group is-${node.mode}`} role="group" aria-label={label}>
      <rect className="pg-group-box" x={node.x} y={node.y} width={node.w} height={node.h} rx={20} />
      <text className="pg-group-label" x={node.x + 12} y={node.y + 15} aria-hidden="true">{label}</text>
      {node.children.map((child) => (
        child.kind === 'group'
          ? <GroupNode key={leaves(child).map((l) => l.id).join('|')} node={child} onOpen={onOpen} />
          : <CourseNode key={child.id} node={child} onOpen={onOpen} />
      ))}
    </g>
  );
}

/** The container's width, for choosing columns or rows; 0 until measured. */
function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export default function PrereqGraph({
  course, tree, unlocks = NONE, states, titles, onOpenCourse, size = 'full', label,
}) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const vertical = width > 0 && width < VERTICAL_BELOW;

  const model = useMemo(() => {
    const stateMap = new Map(Object.entries(states || {}).map(([id, s]) => [courseKey(id), s]));
    const titleMap = new Map(Object.entries(titles || {}).map(([id, t]) => [courseKey(id), t]));
    const stateOf = (id) => stateMap.get(courseKey(id));
    const dress = (item) => (item.kind === 'course'
      ? { ...item, state: stateOf(item.id) || 'plain', title: titleMap.get(courseKey(item.id)) }
      : { ...item, children: item.children.map(dress) });

    const items = prereqItems(course, tree).map(dress);
    const isNow = (item) => leaves(item).every((leaf) => leaf.state === 'now');
    const before = items.filter((item) => !isNow(item));
    const now = items.filter(isNow);

    const cap = size === 'tile' ? 3 : 6;
    const ids = [];
    unlocks.forEach((item) => {
      const id = unlockId(item);
      if (id && courseKey(id) !== courseKey(course) && !ids.some((x) => courseKey(x.id) === courseKey(id))) {
        ids.push({ id, title: typeof item === 'object' ? item.title : undefined });
      }
    });
    const opens = ids.slice(0, cap).map(({ id, title }) => ({
      kind: 'course', id, state: 'unlock', title: title || titleMap.get(courseKey(id)),
    }));
    if (ids.length > cap) opens.push({ kind: 'course', id: `+${ids.length - cap} more`, state: 'more' });

    const asked = { kind: 'course', id: course, state: 'asked', title: titleMap.get(courseKey(course)) };
    const layers = [before, now, [asked], opens].filter((layer) => layer.length);
    return { layers, askedIndex: layers.findIndex((layer) => layer[0] === asked), stateOf };
  }, [course, tree, unlocks, states, titles, size]);

  const geo = useMemo(() => layout(model.layers, { vertical, width }), [model, vertical, width]);
  if (!course || geo.layers.length < 2) return null;

  const asked = geo.layers[model.askedIndex][0];
  const edges = [];
  geo.layers.forEach((layer, i) => {
    if (i === model.askedIndex) return;
    layer.forEach((node) => {
      if (node.state === 'more') return;
      const into = i < model.askedIndex;
      const from = into ? node : asked;
      const to = into ? asked : node;
      const tone = into ? toneOf(node, model.stateOf) : 'unlock';
      const fromId = from.kind === 'group' ? (from.mode === 'any' ? 'One of' : 'All of') : from.id;
      edges.push({ ...edgePath(from, to, geo.vertical), tone, fromId, toId: to.id, key: `${fromId}-${to.id}-${edges.length}` });
    });
  });
  const present = new Set(geo.layers.flat().flatMap(leaves).map((leaf) => leaf.state));
  // "You asked" only means something in an answer, where the plan's states come too.
  if (!states) present.delete('asked');
  const legend = ['done', 'now', 'asked', 'unlock'].filter((s) => present.has(s));

  return (
    <div className={`pg ${geo.vertical ? 'is-vertical' : ''}`.trim()} ref={wrapRef}>
      <div className="pg-scroll">
        <svg
          className="pg-svg"
          data-testid="prereq-web-graph"
          role="group"
          aria-label={label || `Prerequisites for ${course}`}
          width={geo.W}
          height={geo.H}
          viewBox={`0 0 ${geo.W} ${geo.H}`}
        >
          {edges.map((edge) => (
            <g key={edge.key} className={`pg-edge is-${edge.tone}`} data-from={edge.fromId} data-to={edge.toId} aria-hidden="true">
              <path d={edge.d} />
              <circle cx={edge.end[0]} cy={edge.end[1]} r={4} />
            </g>
          ))}
          {geo.layers.flat().map((node) => (node.kind === 'group'
            ? <GroupNode key={leaves(node).map((l) => l.id).join('|')} node={node} onOpen={onOpenCourse} />
            : <CourseNode key={node.id} node={node} onOpen={onOpenCourse} />))}
        </svg>
      </div>
      {legend.length > 0 && (
        <ul className="pg-legend" aria-hidden="true">
          {legend.map((s) => (
            <li key={s} className={`is-${s}`}>
              <i />
              {{ done: 'Done', now: 'This term', asked: 'You asked', unlock: 'Unlocks' }[s]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
