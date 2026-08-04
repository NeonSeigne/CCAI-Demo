import { render, screen } from '@testing-library/react';
import App from './App';

// Avoid loading the markdown ESM stack in CRA's legacy Jest runtime. ChatPage
// has focused tests of its own; this file only verifies top-level routing.
jest.mock('./pages/ChatPage', () => () => <div>Chat page</div>);
jest.mock('./components/UserGuide', () => () => null);

test('boots the application configuration', () => {
  render(<App />);
  expect(screen.getByText(/loading configuration/i)).toBeInTheDocument();
});
