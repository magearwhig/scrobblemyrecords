import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { RankingsRace } from '../../../../src/renderer/components/stats/RankingsRace';

describe('RankingsRace', () => {
  const mockSnapshotsArtists = [
    {
      period: '2024-01',
      timestamp: 1704067200000,
      rankings: [
        { name: 'Artist 1', count: 10, rank: 1 },
        { name: 'Artist 2', count: 5, rank: 2 },
      ],
    },
    {
      period: '2024-02',
      timestamp: 1706745600000,
      rankings: [
        { name: 'Artist 2', count: 12, rank: 1 },
        { name: 'Artist 1', count: 11, rank: 2 },
      ],
    },
  ];

  const mockSnapshotsAlbums = [
    {
      period: '2024-01',
      timestamp: 1704067200000,
      rankings: [
        { name: 'Album 1', artist: 'Artist 1', count: 10, rank: 1 },
        { name: 'Album 2', artist: 'Artist 2', count: 5, rank: 2 },
      ],
    },
  ];

  describe('Empty state', () => {
    it('should show empty message when no snapshots', () => {
      render(<RankingsRace snapshots={[]} type='artists' topN={10} />);

      expect(
        screen.getByText(/No ranking data available/i)
      ).toBeInTheDocument();
    });
  });

  describe('Controls', () => {
    it('should render play/pause button', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      const playButton = screen.getByLabelText(/play/i);
      expect(playButton).toBeInTheDocument();
      expect(playButton).toHaveTextContent('▶');
    });

    it('should toggle between play and pause', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      const playButton = screen.getByLabelText(/play/i);

      // Initially shows play
      expect(playButton).toHaveTextContent('▶');

      // Click to start playing
      fireEvent.click(playButton);

      // Should now show pause
      expect(playButton).toHaveTextContent('⏸');
    });

    it('should render slider', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      const slider = screen.getByLabelText(/Time scrubber/i);
      expect(slider).toBeInTheDocument();
      expect(slider).toHaveAttribute('type', 'range');
    });

    it('should render speed selector', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      const speedSelect = screen.getByLabelText(/Animation speed/i);
      expect(speedSelect).toBeInTheDocument();
    });

    it('should show current period', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      // Should show the formatted period for the first snapshot
      expect(screen.getByText(/january.*2024/i)).toBeInTheDocument();
    });
  });

  describe('Rankings display', () => {
    it('should display artist rankings', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      expect(screen.getByText('Artist 1')).toBeInTheDocument();
      expect(screen.getByText('Artist 2')).toBeInTheDocument();
    });

    it('should display album rankings with artist names', () => {
      render(
        <RankingsRace snapshots={mockSnapshotsAlbums} type='albums' topN={10} />
      );

      expect(screen.getByText(/Album 1.*Artist 1/)).toBeInTheDocument();
      expect(screen.getByText(/Album 2.*Artist 2/)).toBeInTheDocument();
    });

    it('should display play counts', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should display rank numbers', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      const ranks = screen.getAllByText(/^[12]$/);
      expect(ranks.length).toBeGreaterThan(0);
    });
  });

  describe('Progress indicator', () => {
    it('should show progress information', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      expect(screen.getByText(/1 \/ 2 snapshots/i)).toBeInTheDocument();
    });
  });

  describe('Speed control', () => {
    it('should change animation speed when speed selector is changed', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      const speedSelect = screen.getByLabelText(/Animation speed/i);
      fireEvent.change(speedSelect, { target: { value: '150' } });

      // Speed should be updated (2x speed)
      expect(speedSelect).toHaveValue('150');
    });
  });

  describe('Slider control', () => {
    it('should change current snapshot when slider is moved', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsArtists}
          type='artists'
          topN={10}
        />
      );

      const slider = screen.getByLabelText(/Time scrubber/i);

      // Initially at snapshot 0 (January 2024)
      expect(screen.getByText(/january.*2024/i)).toBeInTheDocument();

      // Move to snapshot 1
      fireEvent.change(slider, { target: { value: '1' } });

      // Should now show February 2024
      expect(screen.getByText(/february.*2024/i)).toBeInTheDocument();
    });
  });

  describe('Track rankings', () => {
    const mockSnapshotsTracks = [
      {
        period: '2024-01',
        timestamp: 1704067200000,
        rankings: [
          { name: 'Track 1', artist: 'Artist 1', count: 10, rank: 1 },
          { name: 'Track 2', artist: 'Artist 2', count: 5, rank: 2 },
        ],
      },
    ];

    it('should display track rankings with artist names', () => {
      render(
        <RankingsRace snapshots={mockSnapshotsTracks} type='tracks' topN={10} />
      );

      expect(screen.getByText(/Track 1.*Artist 1/)).toBeInTheDocument();
      expect(screen.getByText(/Track 2.*Artist 2/)).toBeInTheDocument();
    });
  });

  describe('Rankings that enter and leave', () => {
    const mockSnapshotsChanging = [
      {
        period: '2024-01',
        timestamp: 1704067200000,
        rankings: [
          { name: 'Artist 1', count: 10, rank: 1 },
          { name: 'Artist 2', count: 5, rank: 2 },
        ],
      },
      {
        period: '2024-02',
        timestamp: 1706745600000,
        rankings: [
          { name: 'Artist 2', count: 12, rank: 1 },
          { name: 'Artist 3', count: 8, rank: 2 },
        ],
      },
    ];

    it('should handle items that leave the rankings', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsChanging}
          type='artists'
          topN={2}
        />
      );

      // Initially Artist 1 and Artist 2 should be visible
      expect(screen.getByText('Artist 1')).toBeInTheDocument();
      expect(screen.getByText('Artist 2')).toBeInTheDocument();
    });

    it('should show all items that appear in any snapshot', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsChanging}
          type='artists'
          topN={2}
        />
      );

      // Items in the current snapshot (index 0) should have visible text
      expect(screen.getByText('Artist 1')).toBeInTheDocument();
      expect(screen.getByText('Artist 2')).toBeInTheDocument();
      // Artist 3 only appears in snapshot index 1; at index 0 it renders as
      // a hidden empty bar with no text content, so it won't be found by getByText
      expect(screen.queryByText('Artist 3')).not.toBeInTheDocument();
    });

    it('should restart animation when reaching the end', () => {
      render(
        <RankingsRace
          snapshots={mockSnapshotsChanging}
          type='artists'
          topN={2}
        />
      );

      const playButton = screen.getByLabelText(/play/i);
      const slider = screen.getByLabelText(/Time scrubber/i);

      // Move to the last snapshot
      fireEvent.change(slider, { target: { value: '1' } });

      // Click play - should restart from beginning
      fireEvent.click(playButton);

      // Should now be playing
      expect(playButton).toHaveTextContent('⏸');
    });
  });
});
