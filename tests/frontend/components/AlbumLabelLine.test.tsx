import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import AlbumLabelLine from '../../../src/renderer/components/AlbumLabelLine';
import { AlbumLabelInfo } from '../../../src/shared/types';

const api = {
  getAlbumLabel: jest.fn(),
  setAlbumLabel: jest.fn(),
  clearAlbumLabel: jest.fn(),
  confirmAlbumLabel: jest.fn(),
  rejectAlbumLabel: jest.fn(),
};
jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({ state: { serverUrl: 'http://localhost:3001' } }),
}));
jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => api,
}));

const renderLine = () =>
  render(<AlbumLabelLine artist='Spoon' album='Gimme Fiction' />);

describe('AlbumLabelLine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(api).forEach(fn => fn.mockResolvedValue(undefined));
  });

  const showing = (info: AlbumLabelInfo | null) =>
    api.getAlbumLabel.mockResolvedValue(info);

  it('shows a found label as a link with its source', async () => {
    showing({
      labels: ['Merge Records'],
      source: 'musicbrainz',
      status: 'found',
    });

    renderLine();

    expect(
      await screen.findByRole('link', {
        name: 'View label details for Merge Records',
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/from MusicBrainz/)).toBeInTheDocument();
    expect(api.getAlbumLabel).toHaveBeenCalledWith('Spoon', 'Gimme Fiction');
  });

  it('asks about an unsure match, and saves the answer', async () => {
    const user = userEvent.setup();
    showing({
      labels: ['Merge'],
      source: 'musicbrainz',
      status: 'unsure',
      matchedArtist: 'Spoon',
      matchedTitle: 'Gimme Fiction Live',
    });

    renderLine();

    expect(
      await screen.findByText(/possible match: "Gimme Fiction Live" by Spoon/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Yes, that's right" }));
    expect(api.confirmAlbumLabel).toHaveBeenCalledWith(
      'Spoon',
      'Gimme Fiction'
    );
    await waitFor(() => expect(api.getAlbumLabel).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: 'No' }));
    expect(api.rejectAlbumLabel).toHaveBeenCalledWith('Spoon', 'Gimme Fiction');
  });

  it('says when nothing was found or looked up yet', async () => {
    showing({ labels: [], source: 'musicbrainz', status: 'none' });
    const { unmount } = renderLine();
    expect(await screen.findByText(/no label found/i)).toBeInTheDocument();
    unmount();

    showing(null);
    renderLine();
    expect(await screen.findByText(/not looked up yet/i)).toBeInTheDocument();
  });

  it('lets you set the labels yourself', async () => {
    const user = userEvent.setup();
    showing({ labels: [], source: 'musicbrainz', status: 'none' });
    renderLine();

    await user.click(await screen.findByRole('button', { name: 'Set label' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Labels, separated by commas' }),
      'Merge, Matador '
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.setAlbumLabel).toHaveBeenCalledWith('Spoon', 'Gimme Fiction', [
      'Merge',
      'Matador',
    ]);
  });

  it('shows your own label and can go back to the looked-up one', async () => {
    const user = userEvent.setup();
    showing({ labels: ['Merge'], source: 'override', status: 'override' });
    renderLine();

    expect(await screen.findByText(/set by you/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Use looked-up label' })
    );

    expect(api.clearAlbumLabel).toHaveBeenCalledWith('Spoon', 'Gimme Fiction');
  });

  it('shows an album you chose to count on no label', async () => {
    showing({ labels: [], source: 'override', status: 'override' });
    renderLine();

    expect(
      await screen.findByText(/not counted on any label/i)
    ).toBeInTheDocument();
  });
});
