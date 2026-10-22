import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import SettingsFilingSection from '../../../../src/renderer/components/settings/SettingsFilingSection';
import ApiService from '../../../../src/renderer/services/api';
import { ArtistFilingRow } from '../../../../src/shared/types';

const mockApi = {
  getFilingStatus: jest.fn(),
  startFilingRefresh: jest.fn(),
  cancelFilingRefresh: jest.fn(),
  getFilingArtists: jest.fn(),
  setFilingOverride: jest.fn(),
};

jest.mock('../../../../src/renderer/services/api', () => ({
  __esModule: true,
  default: jest.fn(),
  getApiService: () => mockApi,
}));
jest.mock('../../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({ state: { serverUrl: 'http://localhost:3001' } }),
}));

const row = (o: Partial<ArtistFilingRow>): ArtistFilingRow => ({
  artist: 'Artist',
  key: (o.artist ?? 'artist').toLowerCase(),
  fileUnder: o.artist ?? 'Artist',
  section: 'A',
  source: 'default',
  filedAs: null,
  lookup: 'not-found',
  type: null,
  override: null,
  count: 1,
  ...o,
});

const ROWS: ArtistFilingRow[] = [
  row({
    artist: 'Beck',
    section: 'B',
    lookup: 'found',
    source: 'musicbrainz',
    type: 'Person',
  }),
  row({
    artist: 'Alice Cooper',
    fileUnder: 'Cooper, Alice',
    section: 'C',
    source: 'override',
    override: 'Cooper, Alice',
    count: 3,
  }),
  row({ artist: 'Modest Mouse', section: 'M' }),
  row({
    artist: 'Elliott Smith',
    fileUnder: 'Smith, Elliott',
    section: 'S',
    source: 'musicbrainz',
    lookup: 'found',
    type: 'Person',
    count: 2,
  }),
];

const renderSection = () =>
  render(<SettingsFilingSection api={mockApi as unknown as ApiService} />);

describe('SettingsFilingSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getFilingArtists.mockResolvedValue(ROWS);
    mockApi.getFilingStatus.mockRejectedValue(new Error('not needed'));
    mockApi.setFilingOverride.mockResolvedValue(null);
  });

  const items = () => screen.getAllByRole('listitem');

  it('lists artists with where they file and why', async () => {
    renderSection();
    expect(await screen.findByText('Elliott Smith')).toBeInTheDocument();
    const smith = items().find(li => within(li).queryByText('Elliott Smith'))!;
    expect(smith).toHaveTextContent(
      'Files under Smith, Elliott · MusicBrainz, person · 2 records'
    );
    const cooper = items().find(li => within(li).queryByText('Alice Cooper'))!;
    expect(cooper).toHaveTextContent('Your override');
    // Override count badge
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('filters and searches', async () => {
    renderSection();
    await screen.findByText('Modest Mouse', { selector: '.filing-row-artist' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Filed by name' })
    );
    expect(items().map(li => li.textContent)).toEqual([
      expect.stringContaining('Modest Mouse'),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await userEvent.type(screen.getByLabelText('Search artists'), 'smith');
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent('Elliott Smith');

    await userEvent.clear(screen.getByLabelText('Search artists'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Your overrides' })
    );
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent('Alice Cooper');
  });

  it('saves a new "file under" and reloads the list', async () => {
    renderSection();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Change where Modest Mouse is filed',
      })
    );
    const input = screen.getByLabelText('File under');
    expect(input).toHaveValue('Modest Mouse');
    await userEvent.clear(input);
    await userEvent.type(input, 'Mouse, Modest');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApi.setFilingOverride).toHaveBeenCalledWith(
        'Modest Mouse',
        'Mouse, Modest'
      )
    );
    await waitFor(() =>
      expect(mockApi.getFilingArtists).toHaveBeenCalledTimes(2)
    );
    expect(screen.queryByLabelText('File under')).not.toBeInTheDocument();
  });

  it('resets an override', async () => {
    renderSection();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Remove the override for Alice Cooper',
      })
    );
    expect(mockApi.setFilingOverride).toHaveBeenCalledWith('Alice Cooper', '');
  });

  it('keeps the editor open with an error when saving fails', async () => {
    mockApi.setFilingOverride.mockRejectedValue(new Error('disk'));
    renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change where Beck is filed' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t save. Try again.'
    );
    expect(screen.getByLabelText('File under')).toBeInTheDocument();
  });

  it('says so when the list cannot load', async () => {
    mockApi.getFilingArtists.mockRejectedValue(new Error('down'));
    renderSection();
    expect(
      await screen.findByText("Couldn't load the artist list.")
    ).toBeInTheDocument();
  });
});
