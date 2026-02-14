import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import {
  QuickTimePresets,
  QuickTimePresetsProps,
} from '../../../src/renderer/components/scrobble/QuickTimePresets';
import { ListeningPatterns } from '../../../src/shared/types';

const mockPatterns: ListeningPatterns = {
  typicalStartTimes: [
    { dayOfWeek: 0, morning: null, afternoon: 14, evening: 20 },
    { dayOfWeek: 1, morning: null, afternoon: 13, evening: 19 },
    { dayOfWeek: 2, morning: null, afternoon: 14, evening: 20 },
    { dayOfWeek: 3, morning: null, afternoon: 14, evening: 20 },
    { dayOfWeek: 4, morning: null, afternoon: 15, evening: 21 },
    { dayOfWeek: 5, morning: null, afternoon: 14, evening: 20 },
    { dayOfWeek: 6, morning: 10, afternoon: 14, evening: 19 },
  ],
  averageSessionLengthMinutes: 90,
  averageGapBetweenAlbumsMinutes: 12,
  averageAlbumsPerSession: 2.5,
  weekdayPattern: { peakHour: 20, sessionCount: 45 },
  weekendPattern: { peakHour: 15, sessionCount: 20 },
  analyzedFromTimestamp: 1700000000,
  analyzedToTimestamp: 1705000000,
  sessionCount: 65,
  lastCalculated: Date.now(),
};

const defaultProps: QuickTimePresetsProps = {
  patterns: null,
  onSelectPreset: jest.fn(),
  onSelectCustom: jest.fn(),
};

describe('QuickTimePresets', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
  });

  describe('rendering', () => {
    it('should render all preset buttons', () => {
      render(<QuickTimePresets {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /just now/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /earlier today/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /yesterday evening/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /custom/i })
      ).toBeInTheDocument();
    });

    it('should render the label text', () => {
      render(<QuickTimePresets {...defaultProps} />);

      expect(screen.getByText('When did you listen?')).toBeInTheDocument();
    });

    it('should not show pattern hint when patterns are null', () => {
      render(<QuickTimePresets {...defaultProps} patterns={null} />);

      expect(screen.queryByText(/you usually listen/i)).not.toBeInTheDocument();
    });

    it('should show pattern hint when patterns are provided', () => {
      render(<QuickTimePresets {...defaultProps} patterns={mockPatterns} />);

      expect(screen.getByText(/you usually listen/i)).toBeInTheDocument();
      expect(screen.getByText(/8 PM/i)).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onSelectPreset with current timestamp for "Just now"', async () => {
      const onSelectPreset = jest.fn();
      render(
        <QuickTimePresets {...defaultProps} onSelectPreset={onSelectPreset} />
      );

      const before = Math.floor(Date.now() / 1000);
      await user.click(screen.getByRole('button', { name: /just now/i }));
      const after = Math.floor(Date.now() / 1000);

      expect(onSelectPreset).toHaveBeenCalledTimes(1);
      const calledTimestamp = onSelectPreset.mock.calls[0][0];
      expect(calledTimestamp).toBeGreaterThanOrEqual(before);
      expect(calledTimestamp).toBeLessThanOrEqual(after);
    });

    it('should call onSelectPreset with a past timestamp for "Earlier today"', async () => {
      const onSelectPreset = jest.fn();
      render(
        <QuickTimePresets {...defaultProps} onSelectPreset={onSelectPreset} />
      );

      await user.click(screen.getByRole('button', { name: /earlier today/i }));

      expect(onSelectPreset).toHaveBeenCalledTimes(1);
      const calledTimestamp = onSelectPreset.mock.calls[0][0];
      // Should be in the past
      expect(calledTimestamp).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000)
      );
    });

    it('should call onSelectPreset with yesterday timestamp for "Yesterday evening"', async () => {
      const onSelectPreset = jest.fn();
      render(
        <QuickTimePresets {...defaultProps} onSelectPreset={onSelectPreset} />
      );

      await user.click(
        screen.getByRole('button', { name: /yesterday evening/i })
      );

      expect(onSelectPreset).toHaveBeenCalledTimes(1);
      const calledTimestamp = onSelectPreset.mock.calls[0][0];
      const now = Math.floor(Date.now() / 1000);
      // Should be at least ~12 hours ago, at most ~48 hours ago
      expect(calledTimestamp).toBeLessThan(now);
      expect(calledTimestamp).toBeGreaterThan(now - 48 * 3600);
    });

    it('should call onSelectCustom when "Custom..." is clicked', async () => {
      const onSelectCustom = jest.fn();
      render(
        <QuickTimePresets {...defaultProps} onSelectCustom={onSelectCustom} />
      );

      await user.click(screen.getByRole('button', { name: /custom/i }));

      expect(onSelectCustom).toHaveBeenCalledTimes(1);
    });

    it('should use pattern data for "Earlier today" timestamp', async () => {
      const onSelectPreset = jest.fn();
      render(
        <QuickTimePresets
          {...defaultProps}
          patterns={mockPatterns}
          onSelectPreset={onSelectPreset}
        />
      );

      await user.click(screen.getByRole('button', { name: /earlier today/i }));

      expect(onSelectPreset).toHaveBeenCalledTimes(1);
      const calledTimestamp = onSelectPreset.mock.calls[0][0];
      const date = new Date(calledTimestamp * 1000);
      // With patterns, the afternoon hour should come from typicalStartTimes
      const hour = date.getHours();
      expect(hour).toBeGreaterThanOrEqual(12);
      expect(hour).toBeLessThanOrEqual(17);
    });
  });
});
