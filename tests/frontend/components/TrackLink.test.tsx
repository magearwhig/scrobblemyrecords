import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import TrackLink from '../../../src/renderer/components/TrackLink';

describe('TrackLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (localStorage.getItem as jest.Mock).mockReturnValue('');
    window.location.hash = '';
  });

  afterEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it('should render the track name', () => {
    // Arrange & Act
    render(<TrackLink artist='Radiohead' track='Idioteque' />);

    // Assert
    expect(screen.getByText('Idioteque')).toBeInTheDocument();
  });

  it('should have correct role and tabIndex for accessibility', () => {
    // Arrange & Act
    render(<TrackLink artist='Radiohead' track='Idioteque' />);

    // Assert
    const link = screen.getByRole('link', {
      name: /view track details for idioteque/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('tabindex', '0');
  });

  it('should store track info in localStorage on click', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<TrackLink artist='Radiohead' track='Idioteque' album='Kid A' />);

    // Act
    await user.click(screen.getByText('Idioteque'));

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedTrack',
      JSON.stringify({
        artist: 'Radiohead',
        track: 'Idioteque',
        album: 'Kid A',
      })
    );
  });

  it('should store track info without album when not provided', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<TrackLink artist='Radiohead' track='Idioteque' />);

    // Act
    await user.click(screen.getByText('Idioteque'));

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedTrack',
      JSON.stringify({
        artist: 'Radiohead',
        track: 'Idioteque',
        album: undefined,
      })
    );
  });

  it('should embed current page as ?from= param in the URL on click', async () => {
    // Arrange
    const user = userEvent.setup();
    window.location.hash = '#stats';
    render(<TrackLink artist='Radiohead' track='Idioteque' />);

    // Act
    await user.click(screen.getByText('Idioteque'));

    // Assert: ?from=stats is present in the hash
    expect(window.location.hash).toContain('from=stats');
    // Old localStorage.previousPage should NOT be written
    expect(localStorage.setItem).not.toHaveBeenCalledWith(
      'previousPage',
      expect.anything()
    );
  });

  it('should navigate to track detail page on click', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<TrackLink artist='Radiohead' track='Idioteque' />);

    // Act
    await user.click(screen.getByText('Idioteque'));

    // Assert: hash starts with #track
    expect(window.location.hash).toMatch(/^#track/);
  });

  it('should navigate on Enter key press', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<TrackLink artist='Radiohead' track='Idioteque' />);
    const link = screen.getByText('Idioteque');

    // Act
    link.focus();
    await user.keyboard('{Enter}');

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedTrack',
      expect.stringContaining('Idioteque')
    );
    expect(window.location.hash).toMatch(/^#track/);
  });

  it('should navigate on Space key press', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<TrackLink artist='Radiohead' track='Idioteque' />);
    const link = screen.getByText('Idioteque');

    // Act
    link.focus();
    await user.keyboard(' ');

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedTrack',
      expect.stringContaining('Idioteque')
    );
    expect(window.location.hash).toMatch(/^#track/);
  });

  it('should apply custom className', () => {
    // Arrange & Act
    render(
      <TrackLink
        artist='Radiohead'
        track='Idioteque'
        className='custom-class'
      />
    );

    // Assert
    const link = screen.getByText('Idioteque');
    expect(link).toHaveClass('track-link');
    expect(link).toHaveClass('custom-class');
  });
});
