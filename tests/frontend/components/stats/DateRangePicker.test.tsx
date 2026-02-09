import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import { DateRangePicker } from '../../../../src/renderer/components/stats/DateRangePicker';

describe('DateRangePicker', () => {
  const mockOnClose = jest.fn();
  const mockOnApply = jest.fn();
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
  });

  it('should not render when isOpen is false', () => {
    render(
      <DateRangePicker
        isOpen={false}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    expect(screen.queryByText('Jan')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    // Should show month buttons
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
    expect(screen.getByText('Dec')).toBeInTheDocument();
  });

  it('should display year navigation', () => {
    const currentYear = new Date().getFullYear();
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    expect(screen.getByText(currentYear.toString())).toBeInTheDocument();
  });

  it('should navigate to previous year when clicking left arrow', async () => {
    const currentYear = new Date().getFullYear();
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    const prevButton = screen.getByRole('button', { name: /previous year/i });
    await user.click(prevButton);

    expect(screen.getByText((currentYear - 1).toString())).toBeInTheDocument();
  });

  it('should show quick select buttons', () => {
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    expect(screen.getByText('Last 3 Mo')).toBeInTheDocument();
    expect(screen.getByText('Last 6 Mo')).toBeInTheDocument();
    expect(screen.getByText('This Year')).toBeInTheDocument();
  });

  it('should select a month when clicked', async () => {
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    // Navigate to previous year where all months are available
    const prevButton = screen.getByRole('button', { name: /previous year/i });
    await user.click(prevButton);

    await user.click(screen.getByText('Mar'));

    // Should show selection message
    expect(screen.getByText(/Selected:/)).toBeInTheDocument();
  });

  it('should allow selecting a date range by clicking two months', async () => {
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    // Navigate to previous year where all months are available
    const prevButton = screen.getByRole('button', { name: /previous year/i });
    await user.click(prevButton);

    await user.click(screen.getByText('Jan'));
    await user.click(screen.getByText('Mar'));

    // Should show range selection
    expect(screen.getByText(/Selected:/)).toBeInTheDocument();
  });

  it('should call onApply with date range when Apply is clicked', async () => {
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    // Navigate to previous year where all months are available
    const prevButton = screen.getByRole('button', { name: /previous year/i });
    await user.click(prevButton);

    // Select January
    await user.click(screen.getByText('Jan'));

    // Click Apply
    await user.click(screen.getByText('Apply'));

    expect(mockOnApply).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should call onClose when Cancel is clicked', async () => {
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    await user.click(screen.getByText('Cancel'));

    expect(mockOnClose).toHaveBeenCalled();
    expect(mockOnApply).not.toHaveBeenCalled();
  });

  it('should initialize with initial date range', () => {
    const initialRange = {
      startDate: 1704067200, // Jan 1, 2024
      endDate: 1709251199, // Feb 29, 2024
    };

    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
        initialDateRange={initialRange}
      />
    );

    // Should show selection based on initial range
    expect(screen.getByText(/Selected:/)).toBeInTheDocument();
  });

  it('should use quick select "Last 3 Mo" button', async () => {
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    await user.click(screen.getByText('Last 3 Mo'));

    // Should update selection
    expect(screen.getByText(/Selected:/)).toBeInTheDocument();
  });

  it('should use quick select "This Year" button', async () => {
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    await user.click(screen.getByText('This Year'));

    // Should update selection
    expect(screen.getByText(/Selected:/)).toBeInTheDocument();
  });

  it('should disable Apply button when no selection', () => {
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    const applyButton = screen.getByText('Apply');
    expect(applyButton).toBeDisabled();
  });

  it('should swap dates if end is before start', async () => {
    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    // Navigate to previous year where all months are available
    const prevButton = screen.getByRole('button', { name: /previous year/i });
    await user.click(prevButton);

    // Click March first, then January (backwards)
    await user.click(screen.getByText('Mar'));
    await user.click(screen.getByText('Jan'));

    // Click Apply and verify the result is properly ordered
    await user.click(screen.getByText('Apply'));

    expect(mockOnApply).toHaveBeenCalled();
    const calledWith = mockOnApply.mock.calls[0][0];
    expect(calledWith.startDate).toBeLessThan(calledWith.endDate);
  });

  it('should disable future months', () => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    render(
      <DateRangePicker
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    );

    // Check if December is disabled when we're not in December
    if (currentMonth < 11) {
      const monthButtons = screen.getAllByRole('button');
      const decButton = monthButtons.find(btn => btn.textContent === 'Dec');
      expect(decButton).toBeDisabled();
    }
  });
});
