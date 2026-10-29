import React, { useEffect, useState } from 'react';
import { DOMAIN_COLORS } from './domainColors';
import { formatEventTime, hasPhysicalLocation } from './visuals/EventListCard';
import { Icon } from './icons';

const DOMAIN_ICONS = { academics: 'school', student_life: 'event', campus: 'map' };

const API_URL = process.env.REACT_APP_API_URL;
const ALSO_TODAY_LIMIT = 4;

/** The newest answer's visuals, or [] when no answer carries any. */
export function latestVisuals(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.type === 'user') return [];
    if (message.type === 'advisor' && Array.isArray(message.visuals) && message.visuals.length) {
      return message.visuals;
    }
  }
  return [];
}

/** Places an answer pointed at: matched places first, then event venues. */
export function placesMentioned(visuals = []) {
  const seen = new Set();
  const places = [];
  const add = (place) => {
    const key = place.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    places.push(place);
  };
  visuals.filter((v) => v.type === 'place_card').forEach((v) => {
    (v.places || []).forEach((p) => p?.name && add({ name: p.name, mapUrl: p.map_url }));
  });
  visuals.filter((v) => v.type === 'event_list').forEach((v) => {
    (v.events || []).forEach((e) => hasPhysicalLocation(e?.location) && add({ name: e.location }));
  });
  return places;
}

/**
 * Up to three follow-ups for the chips above the composer: directions to
 * the first place this answer mentioned, then home starters not yet asked.
 */
export function buildSuggestions({ visuals = [], starters = [], asked = [] }) {
  const askedSet = new Set(asked.map((text) => text.trim().toLowerCase()));
  const suggestions = [];
  const push = (text, domain) => {
    if (suggestions.length >= 3 || askedSet.has(text.toLowerCase())) return;
    if (suggestions.some((s) => s.text === text)) return;
    suggestions.push({ text, domain });
  };
  const [firstPlace] = placesMentioned(visuals);
  if (firstPlace) push(`How do I get to ${firstPlace.name}?`, 'campus');
  starters.forEach((group) => (group.prompts || []).forEach((prompt) => push(prompt, group.domain)));
  return suggestions;
}

function Section({ title, children }) {
  return (
    <section className="answer-panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Right-hand "This answer" panel: what was checked, places, and today's events. */
export default function AnswerPanel({ visuals = [], authToken, timezone, onAsk }) {
  const [today, setToday] = useState([]);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_URL}/api/campus/today`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((data) => setToday(Array.isArray(data.events) ? data.events : []))
      .catch(() => setToday([]));
  }, [authToken]);

  const checked = visuals.find((v) => v.type === 'sources_checked')?.domains || [];
  const places = placesMentioned(visuals);
  const shownTitles = new Set(
    visuals.filter((v) => v.type === 'event_list').flatMap((v) => (v.events || []).map((e) => e.title)),
  );
  const alsoToday = today.filter((event) => !shownTitles.has(event.title)).slice(0, ALSO_TODAY_LIMIT);
  const hasAnswer = checked.length > 0 || places.length > 0;

  return (
    <aside className="answer-panel" aria-label="This answer">
      <h2>{hasAnswer ? 'This answer' : 'On campus'}</h2>

      {checked.length > 0 && (
        <Section title="Checked">
          <div className="answer-panel-chips">
            {checked.map((domain) => (
              <span className="vc-src" key={domain.id}>
                <Icon name={DOMAIN_ICONS[domain.id] || 'check'} size={16} />
                {domain.label}
              </span>
            ))}
          </div>
        </Section>
      )}

      {places.length > 0 && (
        <Section title="Places mentioned">
          {places.map((place) => (
            <div className="answer-panel-row" key={place.name}>
              <span className="answer-panel-dot" style={{ background: DOMAIN_COLORS.campus }} aria-hidden="true" />
              <span className="answer-panel-text">{place.name}</span>
              {place.mapUrl ? (
                <a className="answer-panel-link" href={place.mapUrl} target="_blank" rel="noopener noreferrer">Map</a>
              ) : (
                onAsk && (
                  <button type="button" className="answer-panel-link" onClick={() => onAsk(`How do I get to ${place.name}?`)}>
                    Directions
                  </button>
                )
              )}
            </div>
          ))}
        </Section>
      )}

      <Section title={hasAnswer ? 'Also today' : 'Today'}>
        {alsoToday.length === 0 ? (
          <p className="answer-panel-empty">Nothing else on the calendar today.</p>
        ) : (
          alsoToday.map((event) => (
            <button
              type="button"
              className="answer-panel-row answer-panel-event"
              key={`${event.title}-${event.start}`}
              onClick={() => onAsk?.(`Tell me about ${event.title}`)}
            >
              <span className="answer-panel-time">{formatEventTime(event, timezone)}</span>
              <span className="answer-panel-text">{event.title}</span>
            </button>
          ))
        )}
      </Section>
    </aside>
  );
}
