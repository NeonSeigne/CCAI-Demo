import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import EnhancedChatInput from './EnhancedChatInput';

const defaultProps = {
  onSendMessage: jest.fn(),
  uploadedDocuments: [],
  isLoading: false,
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

test('shows attached items as chips with a remove button', () => {
  const onRemoveAttachment = jest.fn();
  const course = { type: 'course', id: 'ECON 3720', title: 'Intermediate Macroeconomics' };
  render(
    <EnhancedChatInput
      {...defaultProps}
      compact
      attachments={[course, { type: 'place', id: 'pl-2', title: 'Memorial Library' }]}
      onRemoveAttachment={onRemoveAttachment}
    />,
  );

  expect(screen.getByText('ECON 3720 Intermediate Macroeconomics')).toBeInTheDocument();
  expect(screen.getByText('Memorial Library')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove ECON 3720 Intermediate Macroeconomics' }));
  expect(onRemoveAttachment).toHaveBeenCalledWith(course);
});

test('the composer card shows +, the scope chip, mic and Send', () => {
  const { rerender } = render(<EnhancedChatInput {...defaultProps} compact />);
  expect(screen.getByRole('button', { name: 'Add documents or skills' })).toBeInTheDocument();
  expect(screen.getByText('Courses, events and places')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Voice input' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

  rerender(<EnhancedChatInput {...defaultProps} compact showScope={false} />);
  expect(screen.queryByText('Courses, events and places')).not.toBeInTheDocument();
});
