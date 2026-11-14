import {
  AlbumLabelCandidate,
  AlbumLabelService,
  LabelFinder,
} from '../../../src/backend/services/albumLabelService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

const DAY_MS = 24 * 60 * 60 * 1000;

function memoryStorage() {
  const files = new Map<string, unknown>();
  const storage = {
    readJSON: jest.fn(async (path: string) =>
      files.has(path) ? JSON.parse(JSON.stringify(files.get(path))) : null
    ),
    writeJSON: jest.fn(async (path: string, data: unknown) => {
      files.set(path, JSON.parse(JSON.stringify(data)));
    }),
    writeJSONWithBackup: jest.fn(async (path: string, data: unknown) => {
      files.set(path, JSON.parse(JSON.stringify(data)));
    }),
  } as unknown as FileStorage;
  return { storage, files };
}

const candidate = (
  artist: string,
  album: string,
  extra: Partial<AlbumLabelCandidate> = {}
): AlbumLabelCandidate => ({
  artist,
  album,
  playCount: 5,
  lastPlayed: 1000,
  ...extra,
});

describe('AlbumLabelService', () => {
  let now: number;
  let musicbrainz: jest.MockedFunction<LabelFinder>;
  let discogs: jest.MockedFunction<LabelFinder>;
  let files: Map<string, unknown>;
  let service: AlbumLabelService;

  beforeEach(() => {
    now = Date.UTC(2026, 10, 13);
    musicbrainz = jest.fn<ReturnType<LabelFinder>, Parameters<LabelFinder>>(
      async () => null
    );
    discogs = jest.fn<ReturnType<LabelFinder>, Parameters<LabelFinder>>(
      async () => null
    );
    const memory = memoryStorage();
    files = memory.files;
    service = new AlbumLabelService(
      memory.storage,
      { musicbrainz, discogs },
      { now: () => now }
    );
  });

  it('looks up MusicBrainz first and keeps what it found', async () => {
    musicbrainz.mockResolvedValue({
      labels: ['Merge Records'],
      status: 'found',
      matchedArtist: 'Spoon',
      matchedTitle: 'Gimme Fiction',
      year: 2005,
    });

    await service.scan([candidate('spoon', 'gimme fiction')], 10);

    expect(musicbrainz).toHaveBeenCalledWith({
      artist: 'spoon',
      album: 'gimme fiction',
      mbid: undefined,
    });
    expect(discogs).not.toHaveBeenCalled();
    expect(await service.get('Spoon', 'Gimme Fiction')).toEqual({
      labels: ['Merge Records'],
      source: 'musicbrainz',
      status: 'found',
      matchedArtist: 'Spoon',
      matchedTitle: 'Gimme Fiction',
      year: 2005,
    });
  });

  it('falls back to Discogs when MusicBrainz finds nothing', async () => {
    discogs.mockResolvedValue({ labels: ['Matador'], status: 'found' });

    await service.scan([candidate('pavement', 'wowee zowee')], 10);

    expect(discogs).toHaveBeenCalled();
    expect((await service.get('pavement', 'wowee zowee'))?.source).toBe(
      'discogs'
    );
  });

  it('passes the album MBID to MusicBrainz', async () => {
    await service.scan(
      [candidate('a', 'b', { mbid: 'aaaaaaaa-1111-2222-3333-444444444444' })],
      10
    );

    expect(musicbrainz).toHaveBeenCalledWith(
      expect.objectContaining({ mbid: 'aaaaaaaa-1111-2222-3333-444444444444' })
    );
  });

  it('checks the most recently played albums first, up to the batch size', async () => {
    await service.scan(
      [
        candidate('old', 'one', { lastPlayed: 1 }),
        candidate('new', 'two', { lastPlayed: 3 }),
        candidate('mid', 'three', { lastPlayed: 2 }),
      ],
      2
    );

    expect(musicbrainz.mock.calls.map(c => c[0].artist)).toEqual([
      'new',
      'mid',
    ]);
  });

  it("doesn't look up again until the result is old", async () => {
    await service.scan([candidate('a', 'b')], 10);
    await service.scan([candidate('a', 'b')], 10);
    expect(musicbrainz).toHaveBeenCalledTimes(1);

    // Not found: retried after 90 days
    now += 91 * DAY_MS;
    await service.scan([candidate('a', 'b')], 10);
    expect(musicbrainz).toHaveBeenCalledTimes(2);
  });

  it('records not-found albums, and a failed lookup is retried next time', async () => {
    musicbrainz.mockRejectedValueOnce(new Error('timeout'));

    await service.scan([candidate('a', 'b')], 10);
    expect(await service.get('a', 'b')).toBeNull();

    await service.scan([candidate('a', 'b')], 10);
    expect(await service.get('a', 'b')).toMatchObject({ status: 'none' });
  });

  it('lets the owner set, confirm and reject labels, which always win', async () => {
    musicbrainz.mockResolvedValue({ labels: ['Wrong'], status: 'unsure' });
    await service.scan([candidate('a', 'b')], 10);
    expect(await service.get('a', 'b')).toMatchObject({ status: 'unsure' });

    await service.confirm('a', 'b');
    expect(await service.get('a', 'b')).toMatchObject({
      labels: ['Wrong'],
      source: 'override',
      status: 'override',
    });

    await service.setOverride('A', 'B', ['Merge']);
    expect(await service.get('a', 'b')).toMatchObject({ labels: ['Merge'] });

    await service.reject('a', 'b');
    expect(await service.get('a', 'b')).toMatchObject({
      labels: [],
      status: 'override',
    });

    // An override is never looked up again
    now += 400 * DAY_MS;
    await service.scan([candidate('a', 'b')], 10);
    expect(musicbrainz).toHaveBeenCalledTimes(1);

    await service.clearOverride('a', 'b');
    expect(await service.get('a', 'b')).toMatchObject({ status: 'unsure' });
  });

  it('keeps overrides in a backed-up file apart from the lookup cache', async () => {
    await service.setOverride('a', 'b', ['Merge']);

    expect(files.get('mappings/album-label-overrides.json')).toEqual({
      schemaVersion: 1,
      overrides: [{ key: 'a|b', labels: ['Merge'], setAt: now }],
    });
  });

  it('reads overrides saved by a backup restore', async () => {
    files.set('mappings/album-label-overrides.json', {
      schemaVersion: 1,
      overrides: [{ key: 'a|b', labels: ['Sub Pop'], setAt: 1 }],
    });

    expect(await service.get('A', 'B')).toMatchObject({
      labels: ['Sub Pop'],
      source: 'override',
    });
  });

  it('can key albums by a custom album key, e.g. one that groups spellings', async () => {
    const memory = memoryStorage();
    const keyed = new AlbumLabelService(
      memory.storage,
      { musicbrainz, discogs },
      {
        now: () => now,
        keyFor: async (artist, album) =>
          `${artist.toLowerCase().replace(/^the /, '')}|${album.toLowerCase()}`,
      }
    );
    musicbrainz.mockResolvedValue({ labels: ['Sub Pop'], status: 'found' });

    await keyed.scan(
      [candidate('afghan whigs', 'up in it', { key: 'afghan whigs|up in it' })],
      10
    );

    expect(await keyed.get('The Afghan Whigs', 'Up In It')).toMatchObject({
      labels: ['Sub Pop'],
    });
    await keyed.setOverride('The Afghan Whigs', 'Up In It', ['Glitterhouse']);
    expect((await keyed.getAll()).get('afghan whigs|up in it')?.labels).toEqual(
      ['Glitterhouse']
    );
  });

  it('keeps both of two overrides saved at the same time', async () => {
    await Promise.all([
      service.setOverride('a', 'b', ['One']),
      service.setOverride('c', 'd', ['Two']),
    ]);

    const saved = files.get('mappings/album-label-overrides.json') as {
      overrides: Array<{ key: string }>;
    };
    expect(saved.overrides.map(o => o.key).sort()).toEqual(['a|b', 'c|d']);
  });

  it('reports progress', async () => {
    musicbrainz
      .mockResolvedValueOnce({ labels: ['X'], status: 'found' })
      .mockResolvedValueOnce({ labels: ['Y'], status: 'unsure' });
    const candidates = [
      candidate('a', '1', { lastPlayed: 3 }),
      candidate('b', '2', { lastPlayed: 2 }),
      candidate('c', '3', { lastPlayed: 1 }),
    ];

    await service.scan(candidates, 2);

    expect(await service.getStatus(candidates)).toMatchObject({
      total: 3,
      checked: 2,
      found: 1,
      unsure: 1,
      notFound: 0,
      pending: 1,
    });
  });
});
