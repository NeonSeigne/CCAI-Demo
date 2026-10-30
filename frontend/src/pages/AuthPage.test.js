import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthPage from './AuthPage';
import OnboardingPage from './OnboardingPage';

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ handleAuthSuccess: jest.fn() }) }));
jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({
    config: {
      app: { institution: 'University of Virginia' },
      school: { slug: 'uva' },
      homepage: {
        starters: [{ domain: 'academics', title: 'Academics', prompts: ['Which CS 2100 sections were open?', 'Is CS 2100 hard?'] }],
      },
    },
  }),
}));

const renderAt = (entry) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/" element={<OnboardingPage />} />
      <Route path="/auth" element={<AuthPage />} />
    </Routes>
  </MemoryRouter>,
);

describe('sign in', () => {
  test('one card with a Sign in / Create account switch, in the school frame', () => {
    renderAt('/auth');
    expect(screen.getByText('UVA')).toBeInTheDocument();
    expect(screen.getByText('University of Virginia')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    expect(screen.getByRole('tab', { name: 'Create account' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('First name')).toBeInTheDocument();
  });

  test('?mode=create opens Create account, with the stages as chips', () => {
    renderAt('/auth?mode=create');
    expect(screen.getByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument();
    const stage = screen.getByRole('radiogroup', { name: 'Academic stage' });
    const chips = [...stage.querySelectorAll('[role="radio"]')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['Beginner', 'Intermediate', 'Advanced']);
    fireEvent.click(chips[1]);
    expect(chips[1]).toHaveAttribute('aria-checked', 'true');
  });

  test('field errors keep their words', () => {
    renderAt('/auth');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });
});

describe('landing', () => {
  test('brand first, the headline, one sign-in action, then the questions', () => {
    renderAt('/');
    expect(screen.getByText('Campus Companion')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Ask about courses, events and places on campus.' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /sign in/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /developer mode/i })).not.toBeInTheDocument();
    expect(screen.getByText('“Is CS 2100 hard?”')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to start asking' }));
    expect(screen.getByRole('tab', { name: 'Sign in' })).toBeInTheDocument();
  });
});
