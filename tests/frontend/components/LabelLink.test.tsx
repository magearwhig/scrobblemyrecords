import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import LabelLink from '../../../src/renderer/components/LabelLink';

describe('LabelLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.location.hash = '';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('renders the label name as an accessible link', () => {
    render(<LabelLink label='Sub Pop' />);

    const link = screen.getByRole('link', {
      name: /view label details for sub pop/i,
    });
    expect(link).toHaveTextContent('Sub Pop');
    expect(link).toHaveAttribute('tabindex', '0');
  });

  it('stores the label and opens the label page with a back link', async () => {
    const user = userEvent.setup();
    window.location.hash = '#release-details';
    render(<LabelLink label='Sub Pop' />);

    await user.click(screen.getByText('Sub Pop'));

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedLabel',
      'Sub Pop'
    );
    expect(window.location.hash).toBe('#label?from=release-details');
  });

  it('opens with the keyboard', async () => {
    const user = userEvent.setup();
    render(<LabelLink label='Merge' />);

    screen.getByText('Merge').focus();
    await user.keyboard('{Enter}');

    expect(localStorage.setItem).toHaveBeenCalledWith('selectedLabel', 'Merge');
    expect(window.location.hash).toMatch(/^#label/);
  });

  it('shows plain text for a placeholder label', () => {
    render(<LabelLink label='Not On Label' />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Not On Label')).toBeInTheDocument();
  });

  it("shows the name without Discogs' number but opens the exact label", async () => {
    const user = userEvent.setup();
    render(<LabelLink label='Dirty Looks (4)' />);

    const link = screen.getByRole('link', {
      name: 'View label details for Dirty Looks',
    });
    expect(link).toHaveTextContent(/^Dirty Looks$/);
    await user.click(link);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedLabel',
      'Dirty Looks (4)'
    );
  });
});
