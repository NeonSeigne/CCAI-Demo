import React, { useState } from 'react';
import {
  fireEvent, render, screen, within,
} from '@testing-library/react';
import StartTermField from './StartTermField';

const TERMS = ['Spring 2024', 'Fall 2024', 'Spring 2025', 'Fall 2025'];

function Harness({ initial = 'Fall 2024' }) {
  const [value, setValue] = useState(initial);
  return <StartTermField value={value} terms={TERMS} onChange={setValue} />;
}

test('the trigger names the field and the term; the menu lists terms newest first, the picked one ticked', () => {
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Start term Fall 2024' });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const menu = screen.getByRole('menu', { name: 'Start term' });
  const items = within(menu).getAllByRole('menuitemradio');
  expect(items.map((item) => item.textContent.replace(/^check/, ''))).toEqual(['Fall 2025', 'Spring 2025', 'Fall 2024', 'Spring 2024']);
  expect(items[2]).toHaveAttribute('aria-checked', 'true');
});

test('picking a term sets it; picking the ticked one clears it', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /Start term/ }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Spring 2025/ }));
  expect(screen.getByRole('button', { name: 'Start term Spring 2025' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Start term/ }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Spring 2025/ }));
  expect(screen.getByRole('button', { name: 'Start term' })).toBeInTheDocument();
});
