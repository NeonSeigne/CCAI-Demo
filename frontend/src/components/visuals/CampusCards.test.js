import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import EventListCard, { formatEventTime, hasPhysicalLocation } from './EventListCard';
import PlaceCard from './PlaceCard';
import SourcesChecked from './SourcesChecked';

const EVENT = {
  title: 'Jazz Night',
  start: '2026-10-27T19:00:00-06:00',
  end: '2026-10-27T21:00:00-06:00',
  all_day: false,
  location: 'Macky Auditorium',
  url: 'https://example.edu/jazz',
};

test('event card lists events and asks for directions to the venue', () => {
  const onAsk = jest.fn();
  render(<EventListCard visual={{ type: 'event_list', timezone: 'America/Denver', events: [EVENT], more: 3 }} onAsk={onAsk} />);
  expect(screen.getByText('Jazz Night')).toBeInTheDocument();
  expect(screen.getByText(/7:00\s?PM/)).toBeInTheDocument();
  expect(screen.getByText('3 more on the calendar')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Directions' }));
  expect(onAsk).toHaveBeenCalledWith('How do I get to Macky Auditorium?');
});

test('online events get no Directions button', () => {
  render(<EventListCard visual={{ type: 'event_list', events: [{ ...EVENT, location: '(Online)' }] }} onAsk={jest.fn()} />);
  expect(screen.getByText('(Online)')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Directions' })).not.toBeInTheDocument();
  expect(hasPhysicalLocation('Zoom webinar')).toBe(false);
  expect(hasPhysicalLocation('Check T.I.T.U., Memorial Union')).toBe(true);
});

test('all-day and ongoing events read "All day"', () => {
  expect(formatEventTime({ ...EVENT, all_day: true })).toBe('All day');
  expect(formatEventTime({ ...EVENT, ongoing: true })).toBe('All day');
});

test('place card shows the walking estimate as an estimate', () => {
  render(
    <PlaceCard
      visual={{
        type: 'place_card',
        from: { name: 'Norlin Library' },
        places: [{ name: 'University Memorial Center', category: 'academic', distance_m: 233, walk_minutes_estimate: 3, map_url: 'https://osm.example' }],
      }}
    />,
  );
  expect(screen.getByText('~3 min')).toBeInTheDocument();
  expect(screen.getByText('233 m straight line')).toBeInTheDocument();
  expect(screen.getByText(/from Norlin Library/)).toBeInTheDocument();
  expect(screen.getByText(/estimates/)).toBeInTheDocument();
});

test('checked line names each domain', () => {
  render(<SourcesChecked visual={{ type: 'sources_checked', domains: [{ id: 'student_life', label: 'Events' }, { id: 'campus', label: 'Campus map' }] }} />);
  expect(screen.getByText('Events')).toBeInTheDocument();
  expect(screen.getByText('Campus map')).toBeInTheDocument();
});

test('empty cards render nothing', () => {
  const { container } = render(
    <>
      <EventListCard visual={{ events: [] }} />
      <PlaceCard visual={{ places: [] }} />
      <SourcesChecked visual={{ domains: [] }} />
    </>,
  );
  expect(container).toBeEmptyDOMElement();
});
