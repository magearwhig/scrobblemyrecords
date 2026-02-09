import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import ToastContainer from '../../../src/renderer/components/ToastContainer';
import {
  ToastProvider,
  useToast,
} from '../../../src/renderer/context/ToastContext';

// Helper component that triggers toasts via the context
const ToastTrigger: React.FC<{
  type?: 'success' | 'error' | 'warning' | 'info';
  message?: string;
  duration?: number;
  actionLabel?: string;
  actionFn?: () => void;
}> = ({
  type = 'success',
  message = 'Test toast',
  duration,
  actionLabel,
  actionFn,
}) => {
  const { showToast } = useToast();
  return (
    <button
      onClick={() =>
        showToast(type, message, {
          duration,
          action:
            actionLabel && actionFn
              ? { label: actionLabel, onClick: actionFn }
              : undefined,
        })
      }
    >
      Show Toast
    </button>
  );
};

const renderWithProvider = (
  triggerProps?: React.ComponentProps<typeof ToastTrigger>
) => {
  return render(
    <ToastProvider>
      <ToastTrigger {...triggerProps} />
      <ToastContainer />
    </ToastProvider>
  );
};

describe('ToastContainer', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when there are no toasts', () => {
    render(
      <ToastProvider>
        <ToastContainer />
      </ToastProvider>
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a toast when triggered', async () => {
    renderWithProvider({ message: 'Saved successfully' });

    await user.click(screen.getByText('Show Toast'));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });

  it('applies correct CSS class for toast type', async () => {
    renderWithProvider({ type: 'error', message: 'Failed' });

    await user.click(screen.getByText('Show Toast'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('toast--error');
  });

  it('shows dismiss button on each toast', async () => {
    renderWithProvider();

    await user.click(screen.getByText('Show Toast'));

    expect(screen.getByLabelText('Dismiss notification')).toBeInTheDocument();
  });

  it('removes toast when dismiss button is clicked', async () => {
    renderWithProvider({ duration: 0 });

    await user.click(screen.getByText('Show Toast'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Dismiss notification'));

    // Wait for exit animation and state flush
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('auto-dismisses toast after duration', async () => {
    renderWithProvider({ duration: 3000 });

    await user.click(screen.getByText('Show Toast'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Advance past the duration + exit animation
    await act(async () => {
      jest.advanceTimersByTime(3300);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders action button when provided', async () => {
    const actionFn = jest.fn();
    renderWithProvider({ actionLabel: 'Undo', actionFn });

    await user.click(screen.getByText('Show Toast'));

    expect(screen.getByText('Undo')).toBeInTheDocument();
  });

  it('calls action callback when action button is clicked', async () => {
    const actionFn = jest.fn();
    renderWithProvider({ actionLabel: 'Undo', actionFn, duration: 0 });

    await user.click(screen.getByText('Show Toast'));
    await user.click(screen.getByText('Undo'));

    expect(actionFn).toHaveBeenCalledTimes(1);
  });

  it('renders multiple toasts', async () => {
    render(
      <ToastProvider>
        <ToastTrigger type='success' message='First toast' duration={0} />
        <ToastTrigger type='error' message='Second toast' duration={0} />
        <ToastContainer />
      </ToastProvider>
    );

    const buttons = screen.getAllByText('Show Toast');
    await user.click(buttons[0]);
    await user.click(buttons[1]);

    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByText('First toast')).toBeInTheDocument();
    expect(screen.getByText('Second toast')).toBeInTheDocument();
  });

  it('shows correct icon for success type', async () => {
    renderWithProvider({ type: 'success' });

    await user.click(screen.getByText('Show Toast'));

    const icon = screen
      .getByRole('alert')
      .querySelector('.toast-icon--success');
    expect(icon).toBeInTheDocument();
  });

  it('shows correct icon for error type', async () => {
    renderWithProvider({ type: 'error' });

    await user.click(screen.getByText('Show Toast'));

    const icon = screen.getByRole('alert').querySelector('.toast-icon--error');
    expect(icon).toBeInTheDocument();
  });

  it('sets aria-live assertive for accessibility', async () => {
    renderWithProvider();

    await user.click(screen.getByText('Show Toast'));

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });
});
