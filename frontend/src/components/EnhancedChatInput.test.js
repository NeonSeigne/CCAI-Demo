import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import EnhancedChatInput from './EnhancedChatInput';

const AdvisorIcon = () => <svg aria-hidden="true" />;

jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({
    advisors: {
      academic_planner: {
        name: 'Academic Planner',
        icon: AdvisorIcon,
        avatarUrl: null,
      },
    },
    isAdvisorEnabled: () => true,
  }),
}));

const defaultProps = {
  onSendMessage: jest.fn(),
  uploadedDocuments: [],
  isLoading: false,
  responseMode: 'panel',
  onResponseModeChange: jest.fn(),
  onSelectedAdvisorIdsChange: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('prefills, enables send, and submits the controlled message', () => {
  const onSendMessage = jest.fn();
  const onMessageChange = jest.fn();
  render(
    <EnhancedChatInput
      {...defaultProps}
      messageValue="Plan my semester"
      onMessageChange={onMessageChange}
      onSendMessage={onSendMessage}
    />,
  );

  const enabledSendButton = document.querySelector('.send-button.enabled');
  expect(enabledSendButton).toBeEnabled();
  fireEvent.click(enabledSendButton);
  expect(onSendMessage).toHaveBeenCalledWith('Plan my semester');
  expect(onMessageChange).toHaveBeenCalledWith('');
});

test('opens the advisor menu and selects an exact responder', () => {
  const onSelectedAdvisorIdsChange = jest.fn();
  render(
    <EnhancedChatInput
      {...defaultProps}
      onSelectedAdvisorIdsChange={onSelectedAdvisorIdsChange}
    />,
  );

  fireEvent.click(screen.getByTitle('Choose advisors for this message'));
  fireEvent.click(screen.getByRole('button', { name: /Academic Planner/ }));
  expect(onSelectedAdvisorIdsChange).toHaveBeenCalledWith(['academic_planner']);
});
