import React from 'react';
import {
  act, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import BriefDialog, { briefText } from './BriefDialog';
import Answer from './Answer';
import { getBrief, getBriefPdf } from '../../api/chatSessions';

const PERSONAS = [
  { id: 'academic_planner', name: 'Academic Planner', image: 'icon://BookOpen' },
  { id: 'career_coach', name: 'Career Coach', image: 'icon://Briefcase' },
];

let mockUser = null;
let mockChat = null;
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token', user: mockUser }) }));
jest.mock('../../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { personas: { items: PERSONAS } } }),
}));
jest.mock('../../contexts/ChatContext', () => ({ useChat: () => mockChat }));
jest.mock('../../api/chatSessions', () => ({ getBrief: jest.fn(), getBriefPdf: jest.fn() }));

const BRIEF = {
  question: 'Should I take ECON 3720 next spring?',
  summary: 'ECON 3720 fits your spring plan.',
  differences: [{
    topic: 'When to take it',
    positions: [
      { persona_id: 'academic_planner', name: 'Academic Planner', stance: 'Take it next term.' },
      { persona_id: 'career_coach', name: 'Career Coach', stance: 'Wait until after the internship.' },
    ],
  }],
  plan: {
    term: 'Spring 2027',
    courses: [
      { code: 'ECON 3720', title: 'Econometrics', credits: '3' },
      { code: 'MATH 3100', title: 'Probability', credits: '4–5' },
    ],
    total_credits: '7–8',
  },
  questions: ['Does ECON 3720 count toward my major?', 'Can I take it during my internship term?'],
};

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

const openDialog = async (brief = BRIEF) => {
  getBrief.mockResolvedValue(brief);
  render(<BriefDialog sessionId="s1" onClose={() => {}} />);
  await screen.findByRole('heading', { name: 'My question' });
};

const questionInputs = () => screen.getAllByRole('textbox', { name: /^Question \d$/ });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mockChat = null;
  Object.assign(navigator, { clipboard: { writeText: jest.fn(() => Promise.resolve()) } });
});

test('loads: the real layout in raised while waiting, then every section', async () => {
  const pending = deferred();
  getBrief.mockReturnValue(pending.promise);
  render(<BriefDialog sessionId="s1" onClose={() => {}} />);

  expect(screen.getByRole('heading', { name: 'Brief for my advisor' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelectorAll('.ab-sec .pnl-block').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  expect(getBrief).toHaveBeenCalledWith('token', 's1');

  await act(async () => { pending.resolve(BRIEF); });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'My question', 'What the panel said', 'Where they differed', 'My plan for Spring 2027', 'Questions for you',
  ]);
  expect(screen.getByText('Should I take ECON 3720 next spring?')).toBeInTheDocument();
  const differed = screen.getByRole('region', { name: 'Where they differed' });
  expect(within(differed).getByText('Wait until after the internship.')).toBeInTheDocument();
  const plan = screen.getByRole('region', { name: 'My plan for Spring 2027' });
  const rows = within(plan).getAllByRole('listitem');
  expect(within(rows[1]).getByText('MATH 3100')).toHaveClass('ab-code');
  expect(within(rows[1]).getByText('4–5')).toHaveClass('ab-credits');
  expect(rows[1]).toHaveTextContent('4–5 credits');
  expect(questionInputs().map((input) => input.value)).toEqual(BRIEF.questions);
  expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
});

test('a failed load shows the error with Retry, which loads again', async () => {
  getBrief.mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 })).mockResolvedValueOnce(BRIEF);
  render(<BriefDialog sessionId="s1" onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Retry/ }));
  expect(await screen.findByRole('heading', { name: 'My question' })).toBeInTheDocument();
  expect(getBrief).toHaveBeenCalledTimes(2);
});

test('questions are editable: change, remove and add', async () => {
  await openDialog();
  fireEvent.change(questionInputs()[0], { target: { value: 'Does it count toward the major?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove question 2' }));
  expect(questionInputs().map((input) => input.value)).toEqual(['Does it count toward the major?']);
  fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
  expect(questionInputs()).toHaveLength(2);
  fireEvent.change(questionInputs()[1], { target: { value: 'Who signs the form?' } });
  expect(questionInputs().map((input) => input.value)).toEqual(['Does it count toward the major?', 'Who signs the form?']);
});

test('Copy puts the edited brief on the clipboard as plain text', async () => {
  await openDialog();
  fireEvent.change(questionInputs()[0], { target: { value: 'Edited question?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove question 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add question' })); // left empty: not copied
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());

  const text = navigator.clipboard.writeText.mock.calls[0][0];
  expect(text).toBe([
    'Brief for my advisor',
    'My question\nShould I take ECON 3720 next spring?',
    'What the panel said\nECON 3720 fits your spring plan.',
    'Where they differed\n- When to take it: Academic Planner: Take it next term.; Career Coach: Wait until after the internship.',
    'My plan for Spring 2027\n- ECON 3720 Econometrics, 3 credits\n- MATH 3100 Probability, 4–5 credits\n- Total: 7–8 credits',
    'Questions for you\n- Edited question?',
  ].join('\n\n'));
});

test('Download PDF posts the edited brief and saves the file', async () => {
  const blob = new Blob(['%PDF'], { type: 'application/pdf' });
  getBriefPdf.mockResolvedValue(blob);
  window.URL.createObjectURL = jest.fn(() => 'blob:brief');
  window.URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await openDialog();
  fireEvent.click(screen.getByRole('button', { name: 'Remove question 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

  expect(getBriefPdf).toHaveBeenCalledWith('token', 's1', { ...BRIEF, questions: [BRIEF.questions[1]] });
  expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
  click.mockRestore();
});

test('a brief without differences or a plan leaves those sections out', async () => {
  await openDialog({ ...BRIEF, differences: [], plan: null });
  expect(screen.queryByRole('heading', { name: 'Where they differed' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /My plan/ })).not.toBeInTheDocument();
  expect(briefText({ ...BRIEF, differences: [], plan: null, questions: [] })).toBe(
    'Brief for my advisor\n\nMy question\nShould I take ECON 3720 next spring?\n\nWhat the panel said\nECON 3720 fits your spring plan.',
  );
});

describe('the button in the answer row', () => {
  const answer = { id: 'a2', type: 'advisor', persona_id: 'orchestrator', content: 'Fits.' };
  const older = { id: 'a1', type: 'advisor', is_aggregated: true, content: 'Earlier.' };
  const take = { id: 't1', type: 'advisor', persona_id: 'career_coach', content: 'Wait.' };
  const chatWith = (messages) => ({ sessionId: 's1', messages, rateAnswer: jest.fn() });

  test('on the latest main answer; opens the dialog', async () => {
    mockChat = chatWith([older, answer, take]);
    getBrief.mockResolvedValue(BRIEF);
    render(<Answer message={answer} />);
    const button = screen.getByRole('button', { name: 'Brief for my advisor' });
    // eslint-disable-next-line no-bitwise
    expect(screen.getByRole('button', { name: 'Bad answer' }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'My question' })).toBeInTheDocument();
    await waitFor(() => expect(getBrief).toHaveBeenCalledWith('token', 's1'));
  });

  test('not on an older answer or a take, nor in an unsaved chat', () => {
    mockChat = chatWith([older, answer, take]);
    const { unmount } = render(<><Answer message={older} /><Answer message={take} /></>);
    expect(screen.queryByRole('button', { name: 'Brief for my advisor' })).not.toBeInTheDocument();
    unmount();
    mockChat = { ...chatWith([answer]), sessionId: null };
    render(<Answer message={answer} />);
    expect(screen.queryByRole('button', { name: 'Brief for my advisor' })).not.toBeInTheDocument();
  });

  test('hidden when the student turned the panel off', () => {
    mockUser = { show_panel: false };
    mockChat = chatWith([answer]);
    render(<Answer message={answer} />);
    expect(screen.getByText('Fits.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Brief for my advisor' })).not.toBeInTheDocument();
  });
});
