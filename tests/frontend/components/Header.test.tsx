import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import Header from '../../../src/renderer/components/Header';

// Mock ThemeContext
const mockToggleDarkMode = jest.fn();
const mockUseTheme = {
  isDarkMode: false,
  toggleDarkMode: mockToggleDarkMode,
};

jest.mock('../../../src/renderer/context/ThemeContext', () => ({
  useTheme: () => mockUseTheme,
}));

// Mock useNotifications hook
jest.mock('../../../src/renderer/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    removeNotification: jest.fn(),
    clearAll: jest.fn(),
  }),
}));

// Mock NotificationBell component
jest.mock('../../../src/renderer/components/NotificationBell', () => ({
  NotificationBell: () => <div data-testid='notification-bell' />,
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Sun: ({ size }: { size: number }) => (
    <svg data-testid='sun-icon' data-size={size} />
  ),
  Moon: ({ size }: { size: number }) => (
    <svg data-testid='moon-icon' data-size={size} />
  ),
}));

const renderHeader = (isDarkMode: boolean = false) => {
  mockUseTheme.isDarkMode = isDarkMode;
  mockUseTheme.toggleDarkMode = mockToggleDarkMode;

  return render(<Header />);
};

describe('Header', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the brand name Listenography', () => {
    renderHeader();
    expect(screen.getByText('Listenography')).toBeInTheDocument();
  });

  it('does not render version or connection status', () => {
    renderHeader();
    expect(screen.queryByText(/v\d+\.\d+\.\d+/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('All services connected')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument();
  });

  it('renders the NotificationBell', () => {
    renderHeader();
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  it('renders Moon icon in light mode', () => {
    renderHeader(false);
    expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('sun-icon')).not.toBeInTheDocument();
  });

  it('renders Sun icon in dark mode', () => {
    renderHeader(true);
    expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('moon-icon')).not.toBeInTheDocument();
  });

  it('toggles dark mode when the theme button is clicked', async () => {
    const user = userEvent.setup();
    renderHeader(false);

    const themeButton = screen.getByTitle('Switch to dark mode');
    await user.click(themeButton);

    expect(mockToggleDarkMode).toHaveBeenCalledTimes(1);
  });

  it('shows correct title in light mode', () => {
    renderHeader(false);
    expect(screen.getByTitle('Switch to dark mode')).toBeInTheDocument();
  });

  it('shows correct title in dark mode', () => {
    renderHeader(true);
    expect(screen.getByTitle('Switch to light mode')).toBeInTheDocument();
  });

  it('applies correct CSS class to theme button', () => {
    renderHeader(false);
    const themeButton = screen.getByTitle('Switch to dark mode');
    expect(themeButton).toHaveClass('header-theme-toggle');
  });

  it('icons are rendered at 18px size', () => {
    renderHeader(false);
    const moonIcon = screen.getByTestId('moon-icon');
    expect(moonIcon).toHaveAttribute('data-size', '18');
  });
});
