import React, { useId, useState } from 'react';
import { useCourse } from '../../modules/course';
import { Icon } from '../icons';

/** Where an answer's cards came from, one line per source dataset. */
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

const eventDate = (start, timeZone) => {
  if (!start) return null;
  try {
    return new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
  } catch {
    return null;
  }
};

/** The courses, events and places an answer's cards used, once each, in card order. */
export function citationItems(visuals = []) {
  const items = [];
  const seen = new Set();
  const add = (item) => {
    const key = `${item.kind}:${item.name}`;
    if (!item.name || seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };
  visuals.forEach((v) => {
    if (v.type === 'course_answer') add({ kind: 'course', icon: 'school', name: v.course });
    if (v.type === 'event_list') {
      (v.events || []).forEach((e) => add({ kind: 'event', icon: 'event', name: e.title, detail: eventDate(e.start, v.timezone) }));
    }
    if (v.type === 'place_card') (v.places || []).forEach((p) => add({ kind: 'place', icon: 'location_on', name: p.name }));
  });
  return items;
}

const PILLS = 2;

/**
 * Sources (DESIGN.md Components): citation pills under the answer, the first
 * two items and "+N" for the rest. They open a panel listing every item and
 * the datasets behind them.
 */
export default function AnswerSources({ visuals = [] }) {
  const firstCourse = visuals.find((v) => v.type === 'course_answer');
  const { data } = useCourse(firstCourse?.course);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const lines = sourceLines(visuals, data?.source);
  const items = citationItems(visuals);
  if (!lines.length && !items.length) return null;

  const shown = items.slice(0, PILLS);
  const more = items.length - shown.length;

  return (
    <div className="answer-sources">
      <button
        type="button"
        className="answer-cites"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {items.length > 0 && <span className="sr-only">Sources: </span>}
        {shown.map((item) => (
          <span key={`${item.kind}-${item.name}`} className="answer-cite">
            <Icon name={item.icon} size={16} />
            {item.name}
          </span>
        ))}
        {more > 0 && <span className="answer-cite is-more">+{more}</span>}
        {!items.length && (
          <span className="answer-cite">
            <Icon name="description" size={16} />
            Sources
          </span>
        )}
      </button>
      {open && (
        <div id={panelId} className="answer-sources-panel" role="region" aria-label="Sources">
          <ul>
            {items.map((item) => (
              <li key={`${item.kind}-${item.name}`} className="answer-source-row">
                <span className="answer-source-tile"><Icon name={item.icon} size={16} /></span>
                <span className="answer-source-name">{item.name}</span>
                {item.detail && <span className="answer-source-detail">{item.detail}</span>}
              </li>
            ))}
            {lines.map((line) => (
              <li key={`${line.label}-${line.name}`} className="answer-source-row">
                <span className="answer-source-tile"><Icon name="description" size={16} /></span>
                <span className="answer-source-name">
                  {line.url ? <a href={line.url} target="_blank" rel="noopener noreferrer">{line.name}</a> : line.name}
                </span>
                <span className="answer-source-label">{line.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
