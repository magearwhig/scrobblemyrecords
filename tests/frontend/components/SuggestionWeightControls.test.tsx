import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import SuggestionWeightControls from '../../../src/renderer/components/SuggestionWeightControls';
import { SuggestionWeights } from '../../../src/shared/types';

describe('SuggestionWeightControls', () => {
  const defaultWeights: SuggestionWeights = {
    recencyGap: 1.0,
    neverPlayed: 1.5,
    recentAddition: 0.8,
    artistAffinity: 0.6,
    eraPreference: 0.3,
    userRating: 1.2,
    timeOfDay: 0.2,
    diversityPenalty: 0.5,
    albumCompleteness: 0.4,
  };

  const mockOnChange = jest.fn();
  const mockOnReset = jest.fn();
  const mockOnToggleCollapsed = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('collapsed state', () => {
    it('should show collapsed view with toggle button', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
          collapsed={true}
          onToggleCollapsed={mockOnToggleCollapsed}
        />
      );

      expect(screen.getByText('Show Weight Controls')).toBeInTheDocument();
    });

    it('should call onToggleCollapsed when button is clicked in collapsed state', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
          collapsed={true}
          onToggleCollapsed={mockOnToggleCollapsed}
        />
      );

      fireEvent.click(screen.getByText('Show Weight Controls'));
      expect(mockOnToggleCollapsed).toHaveBeenCalled();
    });

    it('should not render collapsed view if onToggleCollapsed is not provided', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
          collapsed={true}
        />
      );

      // Without onToggleCollapsed, collapsed is ignored and full controls are shown
      expect(screen.getByText('Suggestion Weights')).toBeInTheDocument();
    });
  });

  describe('expanded state', () => {
    it('should show all weight controls', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
        />
      );

      expect(screen.getByText('Suggestion Weights')).toBeInTheDocument();
      expect(screen.getByText('Recency Gap')).toBeInTheDocument();
      expect(screen.getByText('Never Played')).toBeInTheDocument();
      expect(screen.getByText('Recent Addition')).toBeInTheDocument();
      expect(screen.getByText('Artist Affinity')).toBeInTheDocument();
      expect(screen.getByText('Era Preference')).toBeInTheDocument();
      expect(screen.getByText('Your Rating')).toBeInTheDocument();
      expect(screen.getByText('Time of Day')).toBeInTheDocument();
      expect(screen.getByText('Diversity Penalty')).toBeInTheDocument();
      expect(screen.getByText('Album Completeness')).toBeInTheDocument();
    });

    it('should display current weight values', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
        />
      );

      expect(screen.getByText('1.0')).toBeInTheDocument(); // recencyGap
      expect(screen.getByText('1.5')).toBeInTheDocument(); // neverPlayed
      expect(screen.getByText('0.8')).toBeInTheDocument(); // recentAddition
    });

    it('should call onChange when slider is changed', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
        />
      );

      const sliders = screen.getAllByRole('slider');
      expect(sliders.length).toBe(9); // 9 weight sliders

      // Change the first slider (recencyGap)
      fireEvent.change(sliders[0], { target: { value: '1.5' } });

      expect(mockOnChange).toHaveBeenCalledWith({
        ...defaultWeights,
        recencyGap: 1.5,
      });
    });

    it('should call onReset when Reset button is clicked', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      expect(mockOnReset).toHaveBeenCalled();
    });

    it('should show Hide button when onToggleCollapsed is provided', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
          onToggleCollapsed={mockOnToggleCollapsed}
        />
      );

      expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
    });

    it('should not show Hide button when onToggleCollapsed is not provided', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
        />
      );

      expect(
        screen.queryByRole('button', { name: 'Hide' })
      ).not.toBeInTheDocument();
    });

    it('should call onToggleCollapsed when Hide button is clicked', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
          onToggleCollapsed={mockOnToggleCollapsed}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
      expect(mockOnToggleCollapsed).toHaveBeenCalled();
    });

    it('should show hint text', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
        />
      );

      expect(
        screen.getByText(
          'Higher values increase factor importance. Set to 0 to disable.'
        )
      ).toBeInTheDocument();
    });
  });

  describe('slider properties', () => {
    it('should have correct slider attributes', () => {
      render(
        <SuggestionWeightControls
          weights={defaultWeights}
          onChange={mockOnChange}
          onReset={mockOnReset}
        />
      );

      const sliders = screen.getAllByRole('slider');
      const firstSlider = sliders[0];

      expect(firstSlider).toHaveAttribute('min', '0');
      expect(firstSlider).toHaveAttribute('max', '2');
      expect(firstSlider).toHaveAttribute('step', '0.1');
    });
  });
});
