import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import ArtistLink from '../../../src/renderer/components/ArtistLink';

describe('ArtistLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (localStorage.getItem as jest.Mock).mockReturnValue('');
    window.location.hash = '';
  });

  afterEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it('should render the artist name', () => {
    // Arrange & Act
    render(<ArtistLink artist='Radiohead' />);

    // Assert
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
  });

  it('should have correct role and tabIndex for accessibility', () => {
    // Arrange & Act
    render(<ArtistLink artist='Radiohead' />);

    // Assert
    const link = screen.getByRole('link', {
      name: /view artist details for radiohead/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('tabindex', '0');
  });

  it('should store artist name in localStorage on click', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<ArtistLink artist='Radiohead' />);

    // Act
    await user.click(screen.getByText('Radiohead'));

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedArtist',
      'Radiohead'
    );
  });

  it('should embed current page as ?from= param in the URL on click', async () => {
    // Arrange
    const user = userEvent.setup();
    window.location.hash = '#stats';
    render(<ArtistLink artist='Radiohead' />);

    // Act
    await user.click(screen.getByText('Radiohead'));

    // Assert: ?from=stats is present in the hash
    expect(window.location.hash).toContain('from=stats');
    // Old localStorage.previousPage should NOT be written
    expect(localStorage.setItem).not.toHaveBeenCalledWith(
      'previousPage',
      expect.anything()
    );
  });

  it('should navigate to artist detail page on click', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<ArtistLink artist='Radiohead' />);

    // Act
    await user.click(screen.getByText('Radiohead'));

    // Assert: hash starts with #artist
    expect(window.location.hash).toMatch(/^#artist/);
  });

  it('should navigate on Enter key press', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<ArtistLink artist='Radiohead' />);
    const link = screen.getByText('Radiohead');

    // Act
    link.focus();
    await user.keyboard('{Enter}');

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedArtist',
      'Radiohead'
    );
    expect(window.location.hash).toMatch(/^#artist/);
  });

  it('should navigate on Space key press', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<ArtistLink artist='Radiohead' />);
    const link = screen.getByText('Radiohead');

    // Act
    link.focus();
    await user.keyboard(' ');

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedArtist',
      'Radiohead'
    );
    expect(window.location.hash).toMatch(/^#artist/);
  });

  it('should apply custom className', () => {
    // Arrange & Act
    render(<ArtistLink artist='Radiohead' className='custom-class' />);

    // Assert
    const link = screen.getByText('Radiohead');
    expect(link).toHaveClass('artist-link');
    expect(link).toHaveClass('custom-class');
  });

  it('should handle artist names with special characters', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<ArtistLink artist='AC/DC' />);

    // Act
    await user.click(screen.getByText('AC/DC'));

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedArtist',
      'AC/DC'
    );
  });
});
