import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { RecentAlbums } from '../../../../src/renderer/components/dashboard/RecentAlbums';
import { DashboardRecentAlbum } from '../../../../src/shared/types';

const album = (
  overrides: Partial<DashboardRecentAlbum> = {}
): DashboardRecentAlbum =>
  ({
    artist: 'U2',
    album: 'The Unforgettable Fire',
    coverUrl: null,
    lastPlayed: 0,
    inCollection: true,
    releaseId: 42,
    ...overrides,
  }) as DashboardRecentAlbum;

const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

describe('RecentAlbums', () => {
  afterEach(() => {
    jest.useRealTimers();
    window.location.hash = '';
  });

  it('labels last night as Yesterday even under 24 hours later', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 23, 14, 0));
    render(
      <RecentAlbums
        albums={[album({ lastPlayed: seconds(new Date(2026, 9, 22, 19, 43)) })]}
      />
    );

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.queryByText(/Today/)).not.toBeInTheDocument();
  });

  it('labels a play earlier today as Today', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 23, 14, 0));
    render(
      <RecentAlbums
        albums={[album({ lastPlayed: seconds(new Date(2026, 9, 23, 0, 30)) })]}
      />
    );

    expect(screen.getByText(/^Today/)).toBeInTheDocument();
  });

  it('opens the owned release when the row is clicked', () => {
    render(
      <RecentAlbums albums={[album({ lastPlayed: seconds(new Date()) })]} />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Open The Unforgettable Fire by U2' })
    );

    expect(window.location.hash).toBe('#release-details?id=42&from=home');
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedCollectionItemId',
      '42'
    );
  });
});
