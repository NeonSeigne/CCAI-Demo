import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PanelRow, { panelAdvisors } from './PanelRow';

const PERSONAS = [
  { id: 'academic_planner', name: 'Academic Planner', image: 'icon://BookOpen' },
  { id: 'career_coach', name: 'Career Coach', image: 'icon://Briefcase' },
  { id: 'study_strategist', name: 'Study Strategist', image: 'icon://Brain' },
  { id: 'campus_guide', name: 'Campus Guide', image: '/api/avatars/bundled/guide.png' },
];

jest.mock('../../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { personas: { items: PERSONAS } } }),
}));

const MERGED = { id: 'm2', is_aggregated: true, source_personas: ['study_strategist', 'academic_planner'] };
const PANEL = [
  { id: 'p1', persona_id: 'academic_planner', advisorName: 'Academic Planner', content: 'Take it next term.' },
  { id: 'p2', persona_id: 'study_strategist', advisorName: 'Study Strategist', content: 'Start projects **early**.' },
];

test('advisors follow source_personas, with their icon and course-palette slot', () => {
  expect(panelAdvisors(MERGED, PANEL, PERSONAS).map((a) => [a.name, a.icon, a.slot])).toEqual([
    ['Study Strategist', 'psychology', 3],
    ['Academic Planner', 'menu_book', 1],
  ]);
});

test('advisors 7 and 8 take the two advisor-only colours', () => {
  const eight = [...PERSONAS,
    { id: 'wellness_advisor', name: 'Wellness Advisor' }, { id: 'writing_tutor', name: 'Writing Tutor' },
    { id: 'money_advisor', name: 'Money Advisor', image: 'icon://PiggyBank' }, { id: 'peer_mentor', name: 'Peer Mentor', image: 'icon://Users' }];
  const replies = [
    { id: 'p7', persona_id: 'money_advisor', content: 'Check your aid first.' },
    { id: 'p8', persona_id: 'peer_mentor', content: 'Go to office hours early.' },
  ];
  expect(panelAdvisors({ is_aggregated: true }, replies, eight).map((a) => [a.name, a.icon, a.slot])).toEqual([
    ['Money Advisor', 'savings', 7],
    ['Peer Mentor', 'group', 8],
  ]);
});

test('an avatar image URL falls back to the default icon', () => {
  const guide = [{ id: 'g', persona_id: 'campus_guide', content: 'Try the Union.' }];
  expect(panelAdvisors({ is_aggregated: true }, guide, PERSONAS)[0].icon).toBe('person');
});

test('without source_personas the replies set the order; advisors with no reply are skipped', () => {
  const advisors = panelAdvisors({ is_aggregated: true, source_personas: ['career_coach', 'academic_planner'] }, PANEL, PERSONAS);
  expect(advisors.map((a) => a.id)).toEqual(['academic_planner']);
  expect(panelAdvisors({ is_aggregated: true }, PANEL, PERSONAS).map((a) => a.id))
    .toEqual(['academic_planner', 'study_strategist']);
});

test('one advisor opens at a time; pressing it again closes it', () => {
  render(<PanelRow message={MERGED} panel={PANEL} />);
  expect(screen.queryByText('Take it next term.')).not.toBeInTheDocument();

  const planner = screen.getByRole('button', { name: 'Academic Planner' });
  fireEvent.click(planner);
  expect(planner).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('article', { name: 'Academic Planner' })).toHaveTextContent('Take it next term.');

  fireEvent.click(screen.getByRole('button', { name: 'Study Strategist' }));
  expect(screen.queryByText('Take it next term.')).not.toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Study Strategist' })).toHaveTextContent(/Start projects/);

  fireEvent.click(screen.getByRole('button', { name: 'Study Strategist' }));
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});

test('no panel replies, no row', () => {
  const { container } = render(<PanelRow message={MERGED} panel={[]} />);
  expect(container).toBeEmptyDOMElement();
});
