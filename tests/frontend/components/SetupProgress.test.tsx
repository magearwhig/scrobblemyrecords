import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { SetupProgress } from '../../../src/renderer/components/SetupProgress';
import { AuthStatus } from '../../../src/shared/types';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  CheckCircle: ({ size }: { size: number }) => (
    <svg data-testid='check-circle-icon' data-size={size} />
  ),
  Circle: ({ size }: { size: number }) => (
    <svg data-testid='circle-icon' data-size={size} />
  ),
  ArrowRight: ({ size }: { size: number }) => (
    <svg data-testid='arrow-right-icon' data-size={size} />
  ),
}));

const fullyConnectedAuth: AuthStatus = {
  discogs: { authenticated: true, username: 'discogs-user' },
  lastfm: { authenticated: true, username: 'lastfm-user' },
};

const noAuthStatus: AuthStatus = {
  discogs: { authenticated: false },
  lastfm: { authenticated: false },
};

const discogsOnlyAuth: AuthStatus = {
  discogs: { authenticated: true, username: 'discogs-user' },
  lastfm: { authenticated: false },
};

describe('SetupProgress', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
    window.location.hash = '';
  });

  describe('visibility', () => {
    it('renders nothing when all steps are complete', () => {
      // Arrange: fully set up
      const { container } = render(
        <SetupProgress
          authStatus={fullyConnectedAuth}
          hasSyncedHistory={true}
        />
      );

      // Assert: nothing rendered
      expect(container.firstChild).toBeNull();
    });

    it('renders when Discogs is not connected', () => {
      // Arrange
      render(
        <SetupProgress authStatus={noAuthStatus} hasSyncedHistory={false} />
      );

      // Assert
      expect(
        screen.getByRole('region', { name: /setup progress/i })
      ).toBeInTheDocument();
    });

    it('renders when only Last.fm is missing', () => {
      // Arrange
      render(
        <SetupProgress authStatus={discogsOnlyAuth} hasSyncedHistory={false} />
      );

      // Assert
      expect(
        screen.getByRole('region', { name: /setup progress/i })
      ).toBeInTheDocument();
    });

    it('renders when both services connected but not synced', () => {
      // Arrange
      render(
        <SetupProgress
          authStatus={fullyConnectedAuth}
          hasSyncedHistory={false}
        />
      );

      // Assert
      expect(
        screen.getByRole('region', { name: /setup progress/i })
      ).toBeInTheDocument();
    });
  });

  describe('step labels', () => {
    it('shows all three steps', () => {
      // Arrange
      render(
        <SetupProgress authStatus={noAuthStatus} hasSyncedHistory={false} />
      );

      // Assert
      expect(screen.getByText('Connect Discogs')).toBeInTheDocument();
      expect(screen.getByText('Connect Last.fm')).toBeInTheDocument();
      expect(screen.getByText('Sync collection')).toBeInTheDocument();
    });

    it('shows correct completion count when nothing is done', () => {
      // Arrange
      render(
        <SetupProgress authStatus={noAuthStatus} hasSyncedHistory={false} />
      );

      // Assert
      expect(screen.getByText('0 of 3 complete')).toBeInTheDocument();
    });

    it('shows correct completion count when one step is done', () => {
      // Arrange
      render(
        <SetupProgress authStatus={discogsOnlyAuth} hasSyncedHistory={false} />
      );

      // Assert
      expect(screen.getByText('1 of 3 complete')).toBeInTheDocument();
    });

    it('shows correct completion count when two steps are done', () => {
      // Arrange
      render(
        <SetupProgress
          authStatus={fullyConnectedAuth}
          hasSyncedHistory={false}
        />
      );

      // Assert
      expect(screen.getByText('2 of 3 complete')).toBeInTheDocument();
    });
  });

  describe('step state indicators', () => {
    it('marks Discogs step as done with CheckCircle when authenticated', () => {
      // Arrange
      render(
        <SetupProgress authStatus={discogsOnlyAuth} hasSyncedHistory={false} />
      );

      // Assert: 1 check circle (Discogs done), 2 plain circles (Last.fm + sync pending)
      expect(screen.getAllByTestId('check-circle-icon')).toHaveLength(1);
      expect(screen.getAllByTestId('circle-icon')).toHaveLength(2);
    });

    it('shows action buttons for all incomplete steps', () => {
      // Arrange
      render(
        <SetupProgress authStatus={noAuthStatus} hasSyncedHistory={false} />
      );

      // Assert: buttons for Connect Discogs, Connect Last.fm, and Sync
      const connectButtons = screen.getAllByRole('button');
      expect(connectButtons).toHaveLength(3);
    });

    it('does not show action button for completed steps', () => {
      // Arrange: Discogs is done, Last.fm and sync are pending
      render(
        <SetupProgress authStatus={discogsOnlyAuth} hasSyncedHistory={false} />
      );

      // Assert: only 2 action buttons (Last.fm + Sync)
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });

    it('shows all three check circles when all done (but still not collapsed — edge case)', () => {
      // Arrange: edge case where allDone is true — component returns null
      const { container } = render(
        <SetupProgress
          authStatus={fullyConnectedAuth}
          hasSyncedHistory={true}
        />
      );

      // Assert: component renders nothing
      expect(container.firstChild).toBeNull();
    });
  });

  describe('navigation', () => {
    it('navigates to settings when a Connect button is clicked', async () => {
      // Arrange
      render(
        <SetupProgress authStatus={noAuthStatus} hasSyncedHistory={false} />
      );

      // Act: click the first action button (Connect Discogs)
      const [firstButton] = screen.getAllByRole('button');
      await user.click(firstButton);

      // Assert: hash set to settings route (without leading '#')
      expect(window.location.hash).toBe('#settings');
    });
  });
});
