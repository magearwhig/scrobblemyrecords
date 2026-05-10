import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import AlbumLink from '../../../src/renderer/components/AlbumLink';

describe('AlbumLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (localStorage.getItem as jest.Mock).mockReturnValue('');
    window.location.hash = '';
  });

  afterEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it('should render the album name', () => {
    // Arrange & Act
    render(<AlbumLink artist='Radiohead' album='OK Computer' />);

    // Assert
    expect(screen.getByText('OK Computer')).toBeInTheDocument();
  });

  it('should have correct role and tabIndex for accessibility', () => {
    // Arrange & Act
    render(<AlbumLink artist='Radiohead' album='OK Computer' />);

    // Assert
    const link = screen.getByRole('link', {
      name: /view album details for ok computer/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('tabindex', '0');
  });

  it('should store JSON {artist, album} in localStorage on click', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<AlbumLink artist='Radiohead' album='OK Computer' />);

    // Act
    await user.click(screen.getByText('OK Computer'));

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedAlbum',
      JSON.stringify({ artist: 'Radiohead', album: 'OK Computer' })
    );
  });

  it('should embed current page as ?from= param in the URL on click', async () => {
    // Arrange
    const user = userEvent.setup();
    window.location.hash = '#stats';
    render(<AlbumLink artist='Radiohead' album='OK Computer' />);

    // Act
    await user.click(screen.getByText('OK Computer'));

    // Assert
    expect(window.location.hash).toContain('from=stats');
    expect(localStorage.setItem).not.toHaveBeenCalledWith(
      'previousPage',
      expect.anything()
    );
  });

  it('should navigate to album detail page on click', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<AlbumLink artist='Radiohead' album='OK Computer' />);

    // Act
    await user.click(screen.getByText('OK Computer'));

    // Assert: hash starts with #album
    expect(window.location.hash).toMatch(/^#album/);
  });

  it('should navigate on Enter key press', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<AlbumLink artist='Radiohead' album='OK Computer' />);
    const link = screen.getByText('OK Computer');

    // Act
    link.focus();
    await user.keyboard('{Enter}');

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedAlbum',
      JSON.stringify({ artist: 'Radiohead', album: 'OK Computer' })
    );
    expect(window.location.hash).toMatch(/^#album/);
  });

  it('should navigate on Space key press', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<AlbumLink artist='Radiohead' album='OK Computer' />);
    const link = screen.getByText('OK Computer');

    // Act
    link.focus();
    await user.keyboard(' ');

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedAlbum',
      JSON.stringify({ artist: 'Radiohead', album: 'OK Computer' })
    );
    expect(window.location.hash).toMatch(/^#album/);
  });

  it('should apply custom className', () => {
    // Arrange & Act
    render(
      <AlbumLink
        artist='Radiohead'
        album='OK Computer'
        className='custom-class'
      />
    );

    // Assert
    const link = screen.getByText('OK Computer');
    expect(link).toHaveClass('album-link');
    expect(link).toHaveClass('custom-class');
  });

  it('should handle album names with special characters', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<AlbumLink artist='Sigur Rós' album='( )' />);

    // Act
    await user.click(screen.getByText('( )'));

    // Assert
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedAlbum',
      JSON.stringify({ artist: 'Sigur Rós', album: '( )' })
    );
  });

  it('should stop event propagation on click', async () => {
    // Arrange
    const user = userEvent.setup();
    const parentClick = jest.fn();
    render(
      <div onClick={parentClick}>
        <AlbumLink artist='Radiohead' album='OK Computer' />
      </div>
    );

    // Act
    await user.click(screen.getByText('OK Computer'));

    // Assert
    expect(parentClick).not.toHaveBeenCalled();
  });
});
