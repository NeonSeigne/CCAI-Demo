import React from 'react';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SettingsPage from './SettingsPage';

const mockAuth = {
  user: { email: 'ada@virginia.edu', firstName: 'Ada', lastName: 'Lovelace' },
  authToken: 'token',
  handleUserUpdate: jest.fn(),
  handleSignOut: jest.fn(),
};

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));

const provider = {
  available_backends: ['gemini', 'openai'],
  llm_config: { default_backend: 'gemini', temperature: 0.2 },
};

function respond(url, options = {}) {
  const json = (body, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });
  if (url.endsWith('/current-provider')) return json(provider);
  if (url.endsWith('/switch-provider')) return json({ llm_config: JSON.parse(options.body) });
  if (url.endsWith('/auth/me') && options.method === 'PATCH') return json({ firstName: 'Ada', lastName: 'King' });
  if (url.endsWith('/auth/me') && options.method === 'DELETE') return json({});
  return json({});
}

const renderPage = (entry = '/settings') => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/" element={<p>Signed out</p>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  jest.spyOn(global, 'fetch').mockImplementation(respond);
});

afterEach(() => { jest.restoreAllMocks(); });

test('one page of panels: Profile, Password, Model, Theme, Delete account', async () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent))
    .toEqual(['Profile', 'Password', 'Model', 'Theme', 'Delete account']);
  expect(screen.getByLabelText('Email')).toHaveValue('ada@virginia.edu');
  expect(screen.getByLabelText('Email')).toBeDisabled();
  await screen.findByRole('option', { name: 'Openai' });
});

test('the model select lists the backend options and saves through /switch-provider', async () => {
  renderPage('/settings#model');
  const select = screen.getByRole('combobox', { name: 'Model' });
  await screen.findByRole('option', { name: 'Openai' });
  expect(within(select).getAllByRole('option').map((o) => o.value)).toEqual(['gemini', 'openai']);
  expect(select).toHaveValue('gemini');
  const save = screen.getByRole('button', { name: 'Save configuration' });
  expect(save).toBeDisabled();

  fireEvent.change(select, { target: { value: 'openai' } });
  fireEvent.click(save);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save configuration' })).toBeDisabled());
  const call = global.fetch.mock.calls.find(([url]) => url.endsWith('/switch-provider'));
  expect(JSON.parse(call[1].body)).toEqual({ mode: 'uniform', default_backend: 'openai', temperature: 0.2 });
});

test('Cancel puts the saved model back', async () => {
  renderPage();
  await screen.findByRole('option', { name: 'Openai' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: 'openai' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('gemini');
});

test('Save changes updates the profile', async () => {
  renderPage();
  fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'King' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Profile updated.')).toBeInTheDocument();
  expect(mockAuth.handleUserUpdate).toHaveBeenCalledWith({ firstName: 'Ada', lastName: 'King' });
});

test('Change password checks the two new passwords match', async () => {
  renderPage();
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'oldpassword' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword1' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpassword2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText('New passwords do not match.')).toBeInTheDocument();
});

test('deleting needs DELETE typed, then signs out', async () => {
  renderPage();
  const remove = screen.getByRole('button', { name: 'Permanently delete account' });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'secret' } });
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'delete' } });
  fireEvent.click(remove);
  expect(await screen.findByText('Type DELETE to confirm.')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
  fireEvent.click(remove);
  expect(await screen.findByText('Signed out')).toBeInTheDocument();
  expect(mockAuth.handleSignOut).toHaveBeenCalled();
});
