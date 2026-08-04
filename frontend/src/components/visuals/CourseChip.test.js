import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CourseChip from './CourseChip';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

it('opens the course detail route by default', () => {
  render(
    <MemoryRouter>
      <CourseChip identifier="COMP SCI 300" />
      <LocationProbe />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /comp sci 300/i }));
  expect(screen.getByTestId('location')).toHaveTextContent('/courses/COMP%20SCI%20300');
});

it('uses an explicit selection handler when supplied', () => {
  const onSelect = jest.fn();
  render(
    <MemoryRouter>
      <CourseChip identifier="MUSIC 113" onSelect={onSelect} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /music 113/i }));
  expect(onSelect).toHaveBeenCalledWith('MUSIC 113');
});
