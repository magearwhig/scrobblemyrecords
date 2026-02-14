import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import ArtistLink from '../../../src/renderer/components/ArtistLink';

describe('ArtistLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (localStorage.getItem as jest.Mock).mockReturnValue('');
  });

  afterEach(() => {
    localStorage.clear();
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

  it('should store previousPage in localStorage on click', async () => {
    // Arrange
    const user = userEvent.setup();
    window.location.hash = '#stats';
    render(<ArtistLink artist='Radiohead' />);

    // Act
    await user.click(screen.getByText('Radiohead'));

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith('previousPage', 'stats');
  });

  it('should navigate to artist detail page on click', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<ArtistLink artist='Radiohead' />);

    // Act
    await user.click(screen.getByText('Radiohead'));

    // Assert
    expect(window.location.hash).toBe('#artist');
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
    expect(window.location.hash).toBe('#artist');
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
    expect(window.location.hash).toBe('#artist');
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
