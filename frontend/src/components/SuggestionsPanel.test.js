import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SuggestionsPanel from './SuggestionsPanel';

const AdvisorIcon = () => <svg aria-hidden="true" />;

jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({
    config: {
      chat_page: {
        examples: [
          {
            id: 'academic',
            title: 'Academic Planning',
            icon: 'BookOpen',
            advisor_ids: ['academic_planner', 'career_coach'],
            suggestions: ['Build a four-year plan'],
          },
          {
            id: 'career',
            title: 'Career & Internships',
            icon: 'Briefcase',
            advisor_ids: ['career_coach'],
            suggestions: ['Find an internship'],
          },
        ],
      },
    },
    resolveIcon: () => AdvisorIcon,
    advisors: {
      academic_planner: { name: 'Academic Planner', icon: AdvisorIcon },
      career_coach: { name: 'Career Coach', icon: AdvisorIcon },
    },
  }),
}));

test('filters cards and returns prompt with mapped advisors', () => {
  const onSuggestionClick = jest.fn();
  render(<SuggestionsPanel onSuggestionClick={onSuggestionClick} />);

  fireEvent.click(screen.getByRole('button', { name: 'Career' }));
  expect(screen.queryByText('Academic Planning')).not.toBeInTheDocument();
  expect(screen.getByText('Career & Internships')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Find an internship' }));
  expect(onSuggestionClick).toHaveBeenCalledWith(
    'Find an internship',
    ['career_coach'],
  );
});
