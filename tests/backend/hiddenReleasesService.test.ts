import { HiddenReleasesService } from '../../src/backend/services/hiddenReleasesService';
import { FileStorage } from '../../src/backend/utils/fileStorage';

// Mock FileStorage
jest.mock('../../src/backend/utils/fileStorage');

describe('HiddenReleasesService', () => {
  let service: HiddenReleasesService;
  let mockFileStorage: jest.Mocked<FileStorage>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
      writeJSON: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FileStorage>;

    service = new HiddenReleasesService(mockFileStorage);
  });

  describe('Hidden Releases', () => {
    it('should hide a release', async () => {
      await service.hideRelease('mbid123', 'Test Album', 'Test Artist');

      const hidden = await service.getAllHiddenReleases();
      expect(hidden).toHaveLength(1);
      expect(hidden[0].mbid).toBe('mbid123');
      expect(hidden[0].title).toBe('Test Album');
      expect(hidden[0].artistName).toBe('Test Artist');
    });

    it('should check if a release is hidden', async () => {
      await service.hideRelease('mbid123', 'Test Album', 'Test Artist');

      expect(await service.isReleaseHidden('mbid123')).toBe(true);
      expect(await service.isReleaseHidden('other')).toBe(false);
    });

    it('should unhide a release', async () => {
      await service.hideRelease('mbid123', 'Test Album', 'Test Artist');

      const removed = await service.unhideRelease('mbid123');
      expect(removed).toBe(true);

      expect(await service.isReleaseHidden('mbid123')).toBe(false);
    });

    it('should return false when unhiding non-existent release', async () => {
      const removed = await service.unhideRelease('nonexistent');
      expect(removed).toBe(false);
    });

    it('should clear all hidden releases', async () => {
      await service.hideRelease('mbid1', 'Album 1', 'Artist 1');
      await service.hideRelease('mbid2', 'Album 2', 'Artist 2');

      await service.clearHiddenReleases();

      const hidden = await service.getAllHiddenReleases();
      expect(hidden).toHaveLength(0);
    });
  });

  describe('Excluded Artists', () => {
    it('should exclude an artist', async () => {
      await service.excludeArtist('Test Artist', 'mbid-artist');

      const excluded = await service.getAllExcludedArtists();
      expect(excluded).toHaveLength(1);
      expect(excluded[0].artistName).toBe('Test Artist');
      expect(excluded[0].artistMbid).toBe('mbid-artist');
    });

    it('should normalize artist names for lookup', async () => {
      await service.excludeArtist('The Beatles');

      // Should find it with different case/prefix
      expect(await service.isArtistExcluded('The Beatles')).toBe(true);
      expect(await service.isArtistExcluded('the beatles')).toBe(true);
      expect(await service.isArtistExcluded('BEATLES')).toBe(true);
    });

    it('should include an excluded artist back', async () => {
      await service.excludeArtist('Test Artist');

      const removed = await service.includeArtist('Test Artist');
      expect(removed).toBe(true);

      expect(await service.isArtistExcluded('Test Artist')).toBe(false);
    });

    it('should return false when including non-excluded artist', async () => {
      const removed = await service.includeArtist('nonexistent');
      expect(removed).toBe(false);
    });

    it('should clear all excluded artists', async () => {
      await service.excludeArtist('Artist 1');
      await service.excludeArtist('Artist 2');

      await service.clearExcludedArtists();

      const excluded = await service.getAllExcludedArtists();
      expect(excluded).toHaveLength(0);
    });
  });

  describe('getCounts', () => {
    it('should return counts of hidden releases and excluded artists', async () => {
      await service.hideRelease('mbid1', 'Album 1', 'Artist 1');
      await service.hideRelease('mbid2', 'Album 2', 'Artist 2');
      await service.excludeArtist('Excluded Artist');

      const counts = await service.getCounts();
      expect(counts.releases).toBe(2);
      expect(counts.artists).toBe(1);
    });
  });

  describe('Data Persistence', () => {
    it('should load data from storage on first access', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce({
        schemaVersion: 1,
        items: [
          {
            mbid: 'stored',
            title: 'Stored Album',
            artistName: 'Stored Artist',
            hiddenAt: Date.now(),
          },
        ],
      });

      const hidden = await service.getAllHiddenReleases();
      expect(hidden).toHaveLength(1);
      expect(hidden[0].mbid).toBe('stored');
    });

    it('should save data to storage after changes', async () => {
      await service.hideRelease('mbid123', 'Test Album', 'Test Artist');

      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });
  });
});
