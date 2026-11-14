import axios from 'axios';

import { MusicBrainzService } from '../../src/backend/services/musicbrainzService';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MusicBrainzService.findAlbumLabels', () => {
  let service: MusicBrainzService;
  let mb: { get: jest.Mock };

  const release = (
    id: string,
    title: string,
    artist: string,
    date: string,
    labels: string[],
    group = 'rg-1',
    score = 100
  ) => ({
    id,
    title,
    score,
    status: 'Official',
    date,
    'artist-credit': [{ name: artist, artist: { id: 'a', name: artist } }],
    'release-group': { id: group, title },
    'label-info': labels.map(name => ({ label: { name } })),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mb = { get: jest.fn() };
    mockedAxios.create.mockReturnValue(mb as never);
    mockedAxios.isAxiosError.mockReturnValue(false);
    service = new MusicBrainzService();
    // No waiting between requests in tests
    (
      service as unknown as { enforceRateLimit: () => Promise<void> }
    ).enforceRateLimit = async () => undefined;
  });

  it('checks the whole release group, not just the search hits', async () => {
    mb.get
      .mockResolvedValueOnce({
        data: {
          releases: [
            release('r2', 'Gimme Fiction', 'Spoon', '2015', ['Matador']),
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          releases: [
            release('r2', 'Gimme Fiction', 'Spoon', '2015', ['Matador']),
            release('r1', 'Gimme Fiction', 'Spoon', '2005', ['Merge']),
          ],
        },
      });

    const result = await service.findAlbumLabels({
      artist: 'spoon',
      album: 'gimme fiction',
    });

    expect(mb.get).toHaveBeenNthCalledWith(
      2,
      '/release',
      expect.objectContaining({
        params: expect.objectContaining({ 'release-group': 'rg-1' }),
      })
    );
    expect(result).toMatchObject({ labels: ['Merge'], year: 2005 });
  });

  it("doesn't match titles that only differ in another script", async () => {
    mb.get.mockResolvedValue({
      data: { releases: [release('r1', '大人', 'X', '2000', ['L'], 'rg', 50)] },
    });

    expect(
      await service.findAlbumLabels({ artist: 'x', album: '教育' })
    ).toBeNull();
  });

  it("takes the label of the album's earliest official release", async () => {
    mb.get.mockResolvedValue({
      data: {
        releases: [
          release('r2', 'Gimme Fiction', 'Spoon', '2015-03-01', [
            'Matador Records',
          ]),
          release('r1', 'Gimme Fiction', 'Spoon', '2005-05-10', [
            'Merge Records',
            '[no label]',
          ]),
        ],
      },
    });

    const result = await service.findAlbumLabels({
      artist: 'spoon',
      album: 'gimme fiction (deluxe edition)',
    });

    expect(result).toEqual({
      labels: ['Merge Records'],
      status: 'found',
      matchedArtist: 'Spoon',
      matchedTitle: 'Gimme Fiction',
      year: 2005,
    });
    expect(mb.get).toHaveBeenCalledWith(
      '/release',
      expect.objectContaining({
        params: expect.objectContaining({
          query: expect.stringContaining('artist:"spoon"'),
        }),
      })
    );
  });

  it('only uses releases from the matched album, not other albums', async () => {
    mb.get.mockResolvedValue({
      data: {
        releases: [
          release('r1', 'Gimme Fiction', 'Spoon', '2005', ['Merge'], 'rg-1'),
          release(
            'r9',
            'Gimme Fiction',
            'Spoon',
            '1999',
            ['Other'],
            'rg-9',
            60
          ),
        ],
      },
    });

    const result = await service.findAlbumLabels({
      artist: 'spoon',
      album: 'gimme fiction',
    });

    expect(result?.labels).toEqual(['Merge']);
  });

  it('prefers a fully dated release over a year-only one from the same year', async () => {
    mb.get.mockResolvedValue({
      data: {
        releases: [
          release('club', 'Sublime', 'Sublime', '1996', [
            'BMG Direct Marketing',
          ]),
          release('orig', 'Sublime', 'Sublime', '1996-07-30', [
            'Gasoline Alley',
          ]),
        ],
      },
    });

    const result = await service.findAlbumLabels({
      artist: 'sublime',
      album: 'sublime',
    });

    expect(result?.labels).toEqual(['Gasoline Alley']);
  });

  it('marks a close but not exact match as unsure', async () => {
    mb.get.mockResolvedValue({
      data: {
        releases: [
          release(
            'r1',
            'Gimme Fiction Live',
            'Spoon',
            '2006',
            ['Merge'],
            'rg',
            97
          ),
        ],
      },
    });

    const result = await service.findAlbumLabels({
      artist: 'spoon',
      album: 'gimme fiction',
    });

    expect(result).toMatchObject({ status: 'unsure', labels: ['Merge'] });
  });

  it('returns null when nothing matches well', async () => {
    mb.get.mockResolvedValue({
      data: {
        releases: [
          release(
            'r1',
            'Something Else',
            'Other Band',
            '2006',
            ['X'],
            'rg',
            50
          ),
        ],
      },
    });

    expect(
      await service.findAlbumLabels({ artist: 'spoon', album: 'gimme fiction' })
    ).toBeNull();
  });

  it('uses the release MBID from Last.fm when there is one', async () => {
    mb.get
      .mockResolvedValueOnce({
        data: {
          id: 'mbid-1',
          title: 'Gimme Fiction',
          'release-group': { id: 'rg-1' },
          'artist-credit': [{ name: 'Spoon', artist: { name: 'Spoon' } }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          releases: [
            release('r2', 'Gimme Fiction', 'Spoon', '2015', ['Matador']),
            release('r1', 'Gimme Fiction', 'Spoon', '2005-05', ['Merge']),
            {
              ...release('r0', 'Gimme Fiction', 'Spoon', '2004', ['Promo Co']),
              status: 'Promotion',
            },
          ],
        },
      });

    const result = await service.findAlbumLabels({
      artist: 'spoon',
      album: 'gimme fiction',
      mbid: 'mbid-1',
    });

    expect(mb.get).toHaveBeenNthCalledWith(
      1,
      '/release/mbid-1',
      expect.objectContaining({
        params: { inc: 'release-groups artist-credits' },
      })
    );
    expect(mb.get).toHaveBeenNthCalledWith(
      2,
      '/release',
      expect.objectContaining({
        params: expect.objectContaining({ 'release-group': 'rg-1' }),
      })
    );
    expect(result).toMatchObject({
      labels: ['Merge'],
      status: 'found',
      year: 2005,
    });
  });
});
