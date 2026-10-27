import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AnswerPanel, { buildSuggestions, latestVisuals, placesMentioned } from './AnswerPanel';

const EVENTS = {
  type: 'event_list',
  events: [
    { title: 'Jazz Night', start: '2026-10-27T19:00:00-05:00', location: 'Union South' },
    { title: 'Webinar', start: '2026-10-27T12:00:00-05:00', location: '(Online)' },
  ],
};
const PLACES = { type: 'place_card', places: [{ name: 'Grainger Hall', map_url: 'https://maps.example/g' }] };
const CHECKED = { type: 'sources_checked', domains: [{ id: 'student_life', label: 'Events' }] };
const STARTERS = [
  { domain: 'academics', prompts: ['How hard is COMP SCI 300?', 'What can I take after COMP SCI 300?'] },
  { domain: 'campus', prompts: ['Where is Grainger Hall?'] },
];

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) }));
});

test('latestVisuals reads the newest answer and resets after a new question', () => {
  const answered = [{ type: 'user' }, { type: 'advisor', visuals: [EVENTS] }];
  expect(latestVisuals(answered)).toEqual([EVENTS]);
  expect(latestVisuals([...answered, { type: 'user' }])).toEqual([]);
});

test('placesMentioned lists matched places, then physical event venues, once each', () => {
  expect(placesMentioned([PLACES, EVENTS, EVENTS])).toEqual([
    { name: 'Grainger Hall', mapUrl: 'https://maps.example/g' },
    { name: 'Union South' },
  ]);
});

test('suggestions lead with directions and skip questions already asked', () => {
  const suggestions = buildSuggestions({
    visuals: [EVENTS],
    starters: STARTERS,
    asked: ['how hard is comp sci 300?'],
  });
  expect(suggestions.map((s) => s.text)).toEqual([
    'How do I get to Union South?',
    'What can I take after COMP SCI 300?',
    'Where is Grainger Hall?',
  ]);
  expect(suggestions[0].domain).toBe('campus');
});

test('panel shows what the answer checked and asks for directions to a venue', () => {
  const onAsk = jest.fn();
  render(<AnswerPanel visuals={[CHECKED, EVENTS]} onAsk={onAsk} />);
  expect(screen.getByText('This answer')).toBeInTheDocument();
  expect(screen.getByText('Events')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Directions' }));
  expect(onAsk).toHaveBeenCalledWith('How do I get to Union South?');
});
