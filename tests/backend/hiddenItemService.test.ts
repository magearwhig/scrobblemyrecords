import { HiddenItemService } from '../../src/backend/services/hiddenItemService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { HiddenAlbumsStore, HiddenArtistsStore } from '../../src/shared/types';

jest.mock('../../src/backend/utils/fileStorage');
jest.mock('../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('HiddenItemService', () => {
  let service: HiddenItemService;
  let mockFileStorage: jest.Mocked<FileStorage>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
      writeJSON: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FileStorage>;

    service = new HiddenItemService(mockFileStorage);
  });

  describe('loadHiddenItems', () => {
    it('should load hidden albums from versioned store format', async () => {
      const store: HiddenAlbumsStore = {
        schemaVersion: 1,
        items: [{ artist: 'Radiohead', album: 'OK Computer', hiddenAt: 1000 }],
      };
      mockFileStorage.readJSON
        .mockResolvedValueOnce(store)
        .mockResolvedValueOnce(null);

      await service.loadHiddenItems();

      const albums = await service.getAllHiddenAlbums();
      expect(albums).toHaveLength(1);
      expect(albums[0].artist).toBe('Radiohead');
    });

    it('should load hidden albums from legacy array format', async () => {
      const legacyArray = [
        { artist: 'Radiohead', album: 'OK Computer', hiddenAt: 1000 },
      ];
      mockFileStorage.readJSON
        .mockResolvedValueOnce(legacyArray)
        .mockResolvedValueOnce(null);

      await service.loadHiddenItems();

      const albums = await service.getAllHiddenAlbums();
      expect(albums).toHaveLength(1);
    });

    it('should load hidden artists from versioned store format', async () => {
      const artistStore: HiddenArtistsStore = {
        schemaVersion: 1,
        items: [{ artist: 'Nickelback', hiddenAt: 2000 }],
      };
      mockFileStorage.readJSON
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(artistStore);

      await service.loadHiddenItems();

      const artists = await service.getAllHiddenArtists();
      expect(artists).toHaveLength(1);
      expect(artists[0].artist).toBe('Nickelback');
    });

    it('should load hidden artists from legacy array format', async () => {
      const legacyArray = [{ artist: 'Nickelback', hiddenAt: 2000 }];
      mockFileStorage.readJSON
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(legacyArray);

      await service.loadHiddenItems();

      const artists = await service.getAllHiddenArtists();
      expect(artists).toHaveLength(1);
    });

    it('should handle missing files gracefully', async () => {
      mockFileStorage.readJSON
        .mockRejectedValueOnce(new Error('File not found'))
        .mockRejectedValueOnce(new Error('File not found'));

      await service.loadHiddenItems();

      const albums = await service.getAllHiddenAlbums();
      const artists = await service.getAllHiddenArtists();
      expect(albums).toHaveLength(0);
      expect(artists).toHaveLength(0);
    });

    it('should only load once (caching)', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      await service.loadHiddenItems();
      await service.loadHiddenItems();

      // readJSON called twice on first load (albums + artists), not again
      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(2);
    });

    it('should handle store with empty items array', async () => {
      const emptyStore: HiddenAlbumsStore = {
        schemaVersion: 1,
        items: [],
      };
      mockFileStorage.readJSON
        .mockResolvedValueOnce(emptyStore)
        .mockResolvedValueOnce(null);

      await service.loadHiddenItems();

      const albums = await service.getAllHiddenAlbums();
      expect(albums).toHaveLength(0);
    });
  });

  describe('hideAlbum', () => {
    it('should hide an album and persist to disk', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      await service.hideAlbum('Radiohead', 'OK Computer');

      expect(mockFileStorage.writeJSON).toHaveBeenCalledTimes(2);
      const albumsArg = mockFileStorage.writeJSON.mock.calls[0];
      expect(albumsArg[0]).toBe('discovery/hidden-albums.json');
      const savedStore = albumsArg[1] as HiddenAlbumsStore;
      expect(savedStore.schemaVersion).toBe(1);
      expect(savedStore.items).toHaveLength(1);
      expect(savedStore.items[0].artist).toBe('Radiohead');
      expect(savedStore.items[0].album).toBe('OK Computer');
      expect(savedStore.items[0].hiddenAt).toBeGreaterThan(0);
    });

    it('should overwrite duplicate album (case-insensitive)', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      await service.hideAlbum('Radiohead', 'OK Computer');
      await service.hideAlbum('RADIOHEAD', 'ok computer');

      const albums = await service.getAllHiddenAlbums();
      expect(albums).toHaveLength(1);
    });
  });

  describe('hideArtist', () => {
    it('should hide an artist and persist to disk', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      await service.hideArtist('Nickelback');

      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
      const artistsArg = mockFileStorage.writeJSON.mock.calls[1];
      expect(artistsArg[0]).toBe('discovery/hidden-artists.json');
      const savedStore = artistsArg[1] as HiddenArtistsStore;
      expect(savedStore.items).toHaveLength(1);
      expect(savedStore.items[0].artist).toBe('Nickelback');
    });

    it('should overwrite duplicate artist (case-insensitive)', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      await service.hideArtist('Nickelback');
      await service.hideArtist('NICKELBACK');

      const artists = await service.getAllHiddenArtists();
      expect(artists).toHaveLength(1);
    });
  });

  describe('unhideAlbum', () => {
    it('should remove a hidden album and return true', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideAlbum('Radiohead', 'OK Computer');

      const result = await service.unhideAlbum('Radiohead', 'OK Computer');

      expect(result).toBe(true);
      const albums = await service.getAllHiddenAlbums();
      expect(albums).toHaveLength(0);
    });

    it('should return false if album was not hidden', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      const result = await service.unhideAlbum('Radiohead', 'OK Computer');

      expect(result).toBe(false);
    });

    it('should match case-insensitively', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideAlbum('Radiohead', 'OK Computer');

      const result = await service.unhideAlbum('radiohead', 'ok computer');

      expect(result).toBe(true);
    });
  });

  describe('unhideArtist', () => {
    it('should remove a hidden artist and return true', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideArtist('Nickelback');

      const result = await service.unhideArtist('Nickelback');

      expect(result).toBe(true);
      const artists = await service.getAllHiddenArtists();
      expect(artists).toHaveLength(0);
    });

    it('should return false if artist was not hidden', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      const result = await service.unhideArtist('Radiohead');

      expect(result).toBe(false);
    });

    it('should match case-insensitively', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideArtist('Nickelback');

      const result = await service.unhideArtist('NICKELBACK');

      expect(result).toBe(true);
    });
  });

  describe('isAlbumHidden', () => {
    it('should return true for a hidden album', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideAlbum('Radiohead', 'OK Computer');

      const result = await service.isAlbumHidden('Radiohead', 'OK Computer');

      expect(result).toBe(true);
    });

    it('should return false for a non-hidden album', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      const result = await service.isAlbumHidden('Radiohead', 'OK Computer');

      expect(result).toBe(false);
    });

    it('should match case-insensitively and trim whitespace', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideAlbum('Radiohead', 'OK Computer');

      const result = await service.isAlbumHidden(
        '  RADIOHEAD  ',
        '  ok computer  '
      );

      expect(result).toBe(true);
    });
  });

  describe('isArtistHidden', () => {
    it('should return true for a hidden artist', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideArtist('Nickelback');

      const result = await service.isArtistHidden('Nickelback');

      expect(result).toBe(true);
    });

    it('should return false for a non-hidden artist', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      const result = await service.isArtistHidden('Radiohead');

      expect(result).toBe(false);
    });
  });

  describe('getAllHiddenAlbums', () => {
    it('should return all hidden albums', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideAlbum('Radiohead', 'OK Computer');
      await service.hideAlbum('Boards of Canada', 'Music Has the Right');

      const albums = await service.getAllHiddenAlbums();

      expect(albums).toHaveLength(2);
    });

    it('should return empty array when no albums are hidden', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      const albums = await service.getAllHiddenAlbums();

      expect(albums).toHaveLength(0);
    });
  });

  describe('getAllHiddenArtists', () => {
    it('should return all hidden artists', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideArtist('Artist A');
      await service.hideArtist('Artist B');

      const artists = await service.getAllHiddenArtists();

      expect(artists).toHaveLength(2);
    });
  });

  describe('clearHiddenAlbums', () => {
    it('should clear all hidden albums and persist', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideAlbum('Radiohead', 'OK Computer');
      await service.hideAlbum('Boards of Canada', 'Music Has the Right');

      await service.clearHiddenAlbums();

      const albums = await service.getAllHiddenAlbums();
      expect(albums).toHaveLength(0);
      // Should have written empty items array
      const lastAlbumWrite = mockFileStorage.writeJSON.mock.calls.filter(
        call => call[0] === 'discovery/hidden-albums.json'
      );
      const lastWrite = lastAlbumWrite[lastAlbumWrite.length - 1];
      expect((lastWrite[1] as HiddenAlbumsStore).items).toHaveLength(0);
    });
  });

  describe('clearHiddenArtists', () => {
    it('should clear all hidden artists and persist', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideArtist('Artist A');
      await service.hideArtist('Artist B');

      await service.clearHiddenArtists();

      const artists = await service.getAllHiddenArtists();
      expect(artists).toHaveLength(0);
    });
  });

  describe('getHiddenCounts', () => {
    it('should return counts of hidden albums and artists', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      await service.hideAlbum('Radiohead', 'OK Computer');
      await service.hideAlbum('Boards of Canada', 'Music Has the Right');
      await service.hideArtist('Nickelback');

      const counts = await service.getHiddenCounts();

      expect(counts.albums).toBe(2);
      expect(counts.artists).toBe(1);
    });

    it('should return zero counts when nothing is hidden', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      const counts = await service.getHiddenCounts();

      expect(counts.albums).toBe(0);
      expect(counts.artists).toBe(0);
    });
  });
});
