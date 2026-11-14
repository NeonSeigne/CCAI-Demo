import React from 'react';
import { render, screen, within } from '@testing-library/react';
import Differences from './Differences';
import Answer from './Answer';
import groupMessages from '../../utils/messageGroups';

const PERSONAS = [
  { id: 'academic_planner', name: 'Academic Planner', image: 'icon://BookOpen' },
  { id: 'career_coach', name: 'Career Coach', image: 'icon://Briefcase' },
];

let mockUser = null;
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { personas: { items: PERSONAS } } }),
}));
jest.mock('../../contexts/ChatContext', () => ({ useChat: () => null }));

const DIFFERENCES = [{
  topic: 'When to take it',
  positions: [
    { persona_id: 'academic_planner', stance: 'Take it next term.' },
    { persona_id: 'career_coach', stance: 'Wait until after the internship.' },
  ],
}];

// A saved data answer with its panel: the orchestrator's answer, then two takes.
const SAVED = [
  {
    id: 'a1',
    type: 'advisor',
    persona_id: 'orchestrator',
    responseGroupId: 'g1',
    content: 'ECON 3720 is a solid next step.',
    source_personas: ['academic_planner', 'career_coach'],
    differences: DIFFERENCES,
  },
  { id: 't1', type: 'advisor', persona_id: 'academic_planner', responseGroupId: 'g1', content: 'Take it next term.' },
  { id: 't2', type: 'advisor', persona_id: 'career_coach', responseGroupId: 'g1', content: 'Wait a term.' },
];

beforeEach(() => {
  mockUser = null;
});

test('each position shows the advisor avatar, the name in bold and the stance', () => {
  const { container } = render(<Differences differences={DIFFERENCES} />);
  const block = screen.getByRole('region', { name: 'Where they differ' });
  expect(within(block).getByRole('heading', { name: 'When to take it' })).toBeInTheDocument();
  const rows = within(block).getAllByRole('listitem');
  expect(rows.map((row) => row.querySelector('b').textContent)).toEqual(['Academic Planner', 'Career Coach']);
  expect(rows[1]).toHaveTextContent('Career Coach Wait until after the internship.');
  expect(container.querySelectorAll('.ap-diff-position .ap-avatar')).toHaveLength(2);
});

test('no differences, no block', () => {
  for (const value of [[], null, undefined, [{ topic: 'Empty', positions: [] }]]) {
    const { container, unmount } = render(<Differences differences={value} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
  }
});

test('a data answer groups with its takes and shows the block before the panel row', () => {
  const [group] = groupMessages(SAVED);
  expect(group.aggregatedMessages.map((m) => m.id)).toEqual(['a1']);
  expect(group.panelMessages.map((m) => m.id)).toEqual(['t1', 't2']);

  const { container } = render(<Answer message={group.aggregatedMessages[0]} panel={group.panelMessages} />);
  const diff = container.querySelector('.ap-diff');
  const panel = container.querySelector('.ap-panel');
  expect(diff).not.toBeNull();
  expect(panel).not.toBeNull();
  // eslint-disable-next-line no-bitwise
  expect(diff.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(panel).getByRole('button', { name: 'Career Coach' })).toBeInTheDocument();
});

test('the block hides when the student turned the panel off', () => {
  mockUser = { show_panel: false };
  const [group] = groupMessages(SAVED);
  const { container } = render(<Answer message={group.aggregatedMessages[0]} panel={group.panelMessages} />);
  expect(screen.getByText('ECON 3720 is a solid next step.')).toBeInTheDocument();
  expect(container.querySelector('.ap-diff')).toBeNull();
  expect(container.querySelector('.ap-panel')).toBeNull();
});
