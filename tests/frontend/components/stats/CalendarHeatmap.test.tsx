import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import { CalendarHeatmap } from '../../../../src/renderer/components/stats/CalendarHeatmap';
import { CalendarHeatmapData } from '../../../../src/shared/types';

describe('CalendarHeatmap', () => {
  const mockOnYearChange = jest.fn();
  const currentYear = new Date().getFullYear();
  let user: ReturnType<typeof userEvent.setup>;

  const mockData: CalendarHeatmapData[] = [
    { date: `${currentYear}-01-01`, count: 5 },
    { date: `${currentYear}-01-15`, count: 15 },
    { date: `${currentYear}-02-20`, count: 25 },
    { date: `${currentYear}-03-10`, count: 10 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
  });

  it('should render the heatmap title', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    expect(screen.getByText(/listening activity/i)).toBeInTheDocument();
  });

  it('should display the year in the dropdown', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue(String(currentYear));
  });

  it('should render year selection dropdown', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    // Should have options for current year and previous 2 years
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(3);
  });

  it('should call onYearChange when a different year is selected', async () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, String(currentYear - 1));

    expect(mockOnYearChange).toHaveBeenCalledWith(currentYear - 1);
  });

  it('should render month labels', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    // Should show some month labels
    expect(screen.getByText('Jan')).toBeInTheDocument();
  });

  it('should render legend', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    // The legend has "Less" and "More" labels
    const lessLabels = screen.getAllByText(/less/i);
    const moreLabels = screen.getAllByText(/more/i);
    expect(lessLabels.length).toBeGreaterThan(0);
    expect(moreLabels.length).toBeGreaterThan(0);
  });

  it('should handle empty data', () => {
    render(
      <CalendarHeatmap
        data={[]}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue(String(currentYear));
  });

  it('should not render year select when onYearChange is not provided', () => {
    render(<CalendarHeatmap data={mockData} year={currentYear} />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('should render day labels', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
  });

  it('should have correct year options available', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    // Available years should be currentYear - 2, currentYear - 1, currentYear
    expect(
      screen.getByRole('option', { name: String(currentYear) })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: String(currentYear - 1) })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: String(currentYear - 2) })
    ).toBeInTheDocument();
  });

  describe('click-to-expand interaction', () => {
    const mockOnDayClick = jest.fn();

    it('should fire onDayClick when a cell with count > 0 is clicked', async () => {
      // Arrange
      render(
        <CalendarHeatmap
          data={mockData}
          year={currentYear}
          onYearChange={mockOnYearChange}
          onDayClick={mockOnDayClick}
        />
      );

      // Act - find a clickable button cell and click it
      const buttons = screen.getAllByRole('button');
      // Filter to heatmap cell buttons (not the year select)
      const cellButtons = buttons.filter(b =>
        b.getAttribute('aria-label')?.includes('scrobble')
      );
      expect(cellButtons.length).toBeGreaterThan(0);
      await user.click(cellButtons[0]);

      // Assert
      expect(mockOnDayClick).toHaveBeenCalledTimes(1);
      expect(mockOnDayClick).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      );
    });

    it('should toggle selection when clicking the same cell twice', async () => {
      // Arrange
      render(
        <CalendarHeatmap
          data={mockData}
          year={currentYear}
          onYearChange={mockOnYearChange}
          onDayClick={mockOnDayClick}
          selectedDate={`${currentYear}-01-01`}
        />
      );

      // Act - click the already-selected cell
      const buttons = screen.getAllByRole('button');
      const selectedButton = buttons.find(b =>
        b.getAttribute('aria-label')?.includes(`${currentYear}-01-01`)
      );
      expect(selectedButton).toBeDefined();
      await user.click(selectedButton!);

      // Assert - should call with empty string to deselect
      expect(mockOnDayClick).toHaveBeenCalledWith('');
    });

    it('should support keyboard activation with Enter key', async () => {
      // Arrange
      render(
        <CalendarHeatmap
          data={mockData}
          year={currentYear}
          onYearChange={mockOnYearChange}
          onDayClick={mockOnDayClick}
        />
      );

      // Act - find a clickable cell, focus it, press Enter
      const buttons = screen.getAllByRole('button');
      const cellButtons = buttons.filter(b =>
        b.getAttribute('aria-label')?.includes('scrobble')
      );
      cellButtons[0].focus();
      await user.keyboard('{Enter}');

      // Assert
      expect(mockOnDayClick).toHaveBeenCalled();
    });

    it('should support keyboard activation with Space key', async () => {
      // Arrange
      render(
        <CalendarHeatmap
          data={mockData}
          year={currentYear}
          onYearChange={mockOnYearChange}
          onDayClick={mockOnDayClick}
        />
      );

      // Act
      const buttons = screen.getAllByRole('button');
      const cellButtons = buttons.filter(b =>
        b.getAttribute('aria-label')?.includes('scrobble')
      );
      cellButtons[0].focus();
      await user.keyboard('{ }');

      // Assert
      expect(mockOnDayClick).toHaveBeenCalled();
    });

    it('should mark selected cell with aria-expanded', () => {
      // Arrange & Act
      render(
        <CalendarHeatmap
          data={mockData}
          year={currentYear}
          onYearChange={mockOnYearChange}
          onDayClick={mockOnDayClick}
          selectedDate={`${currentYear}-01-15`}
        />
      );

      // Assert - find the selected button
      const buttons = screen.getAllByRole('button');
      const selectedButton = buttons.find(b =>
        b.getAttribute('aria-label')?.includes(`${currentYear}-01-15`)
      );
      expect(selectedButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('should not render clickable cells when onDayClick is not provided', () => {
      // Arrange & Act
      render(
        <CalendarHeatmap
          data={mockData}
          year={currentYear}
          onYearChange={mockOnYearChange}
        />
      );

      // Assert - no heatmap cell buttons should exist
      const buttons = screen.queryAllByRole('button');
      const cellButtons = buttons.filter(b =>
        b.getAttribute('aria-label')?.includes('scrobble')
      );
      expect(cellButtons.length).toBe(0);
    });
  });

  describe('month labels west of UTC', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
      process.env.TZ = 'America/Chicago';
    });
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it('labels each month once, in order, at the week holding its 1st', () => {
      const { container } = render(<CalendarHeatmap data={[]} year={2026} />);

      const labels = Array.from(
        container.querySelectorAll<HTMLElement>('.calendar-heatmap-month-label')
      );
      expect(labels.map(l => l.textContent)).toEqual([
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ]);
      // 2026-01-01 is a Thursday, so Feb 1 (a Sunday) starts week 6 (index 5)
      // and Mar 1 (a Sunday) starts week 10 (index 9)
      expect(labels[0].style.gridColumn).toMatch(/^1( \/ auto)?$/);
      expect(labels[1].style.gridColumn).toMatch(/^6( \/ auto)?$/);
      expect(labels[2].style.gridColumn).toMatch(/^10( \/ auto)?$/);
    });
  });

  it("opens with this week at the right edge, not December's empty weeks", () => {
    const clientWidth = jest
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(300);
    const rect = jest
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) {
        const isThisWeek = this.hasAttribute('data-current-week');
        return {
          left: isThisWeek ? 600 : 0,
          right: isThisWeek ? 612 : 300,
        } as ReturnType<Element['getBoundingClientRect']>;
      });
    const { container } = render(
      <CalendarHeatmap data={[]} year={currentYear} />
    );

    expect(container.querySelectorAll('[data-current-week]')).toHaveLength(1);
    expect(
      container.querySelector('.calendar-heatmap-grid-container')!.scrollLeft
    ).toBe(312);
    clientWidth.mockRestore();
    rect.mockRestore();
  });
});
