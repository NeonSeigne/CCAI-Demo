import React from 'react';
import './eventKind.css';

/**
 * An event's `kind` (backend: academic, campus_life, arts, athletics,
 * career, or null) as the screens show it: a label and one of the three data
 * colours (DESIGN.md: academics, student life, campus). Null for an unknown
 * kind, so nothing is drawn rather than a guessed colour.
 */
const KINDS = {
  academic: { label: 'Academics', domain: 'academics' },
  career: { label: 'Career', domain: 'academics' },
  campus_life: { label: 'Student life', domain: 'life' },
  arts: { label: 'Arts', domain: 'life' },
  athletics: { label: 'Athletics', domain: 'campus' },
};

export function eventKind(event) {
  return KINDS[event?.kind] || null;
}

/** The domain dot; nothing when the kind is unknown. */
export function KindDot({ event, className = '' }) {
  const kind = eventKind(event);
  if (!kind) return null;
  return <span className={`ev-kd is-${kind.domain} ${className}`.trim()} aria-hidden="true" />;
}

/** "Academics · Hoos Hacking": the parts that exist, or '' when none do. */
export function kindHostLine(event) {
  const host = event?.host || event?.details?.hosted_by || event?.details?.sponsor || null;
  return [eventKind(event)?.label, host].filter(Boolean).join(' · ');
}

/** The matched campus place's name, else the feed's location. */
export const placeName = (event) => event?.place_name || event?.location || '';

/**
 * The room when the feed packs it after the place ("Center for Community,
 * Abrams Lounge"), or the feed's own room field; null otherwise.
 */
export function roomOf(event) {
  if (event?.details?.room) return event.details.room;
  const { place_name: name, location } = event || {};
  if (!name || !location || location === name) return null;
  if (!location.startsWith(name)) return null;
  const rest = location.slice(name.length).replace(/^[\s,–-]+/, '').trim();
  return rest || null;
}
