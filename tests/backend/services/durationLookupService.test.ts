import { DiscogsService } from '../../../src/backend/services/discogsService';
import { DurationLookupService } from '../../../src/backend/services/durationLookupService';
import { LastFmService } from '../../../src/backend/services/lastfmService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

jest.mock('../../../src/backend/utils/fileStorage');
jest.mock('../../../src/backend/services/lastfmService');
jest.mock('../../../src/backend/services/discogsService');

const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;
const MockedLastFmService = LastFmService as jest.MockedClass<
  typeof LastFmService
>;
const MockedDiscogsService = DiscogsService as jest.MockedClass<
  typeof DiscogsService
>;

describe('DurationLookupService', () => {
  let service: DurationLookupService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockLastfmService: jest.Mocked<LastFmService>;
  let mockDiscogsService: jest.Mocked<DiscogsService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockLastfmService = new MockedLastFmService(
      {} as any,
      {} as any
    ) as jest.Mocked<LastFmService>;
    mockDiscogsService = new MockedDiscogsService(
      {} as any,
      {} as any
    ) as jest.Mocked<DiscogsService>;

    // Default: no files, no API results
    mockFileStorage.listFiles.mockResolvedValue([]);

    service = new DurationLookupService(
      mockFileStorage,
      mockLastfmService,
      mockDiscogsService
    );
  });

  describe('lookupDuration', () => {
    it('should return duration from Discogs collection cache', async () => {
      mockFileStorage.listFiles.mockResolvedValue(['release-123.json']);
      mockFileStorage.readJSON.mockResolvedValue({
        artist: 'Radiohead',
        tracklist: [
          { title: 'Creep', duration: '3:56', position: '1' },
          { title: 'Anyone Can Play Guitar', duration: '3:38', position: '2' },
        ],
      });

      const result = await service.lookupDuration('Radiohead', 'Creep');

      expect(result.duration).toBe(236);
      expect(result.source).toBe('discogs_collection');
      // Should not call Last.fm since Discogs cache hit
      expect(mockLastfmService.getTrackInfo).not.toHaveBeenCalled();
    });

    it('should fall through to Last.fm when not in Discogs cache', async () => {
      mockFileStorage.listFiles.mockResolvedValue([]);
      mockLastfmService.getTrackInfo.mockResolvedValue({
        duration: 236000, // ms
        name: 'Creep',
        artist: { name: 'Radiohead' },
      } as any);

      const result = await service.lookupDuration('Radiohead', 'Creep');

      expect(result.duration).toBe(236);
      expect(result.source).toBe('lastfm');
    });

    it('should return not_found when all sources fail', async () => {
      mockFileStorage.listFiles.mockResolvedValue([]);
      mockLastfmService.getTrackInfo.mockResolvedValue(null);

      const result = await service.lookupDuration('Unknown', 'Unknown Track');

      expect(result.duration).toBeNull();
      expect(result.source).toBe('not_found');
    });

    it('should skip Last.fm result with zero duration', async () => {
      mockFileStorage.listFiles.mockResolvedValue([]);
      mockLastfmService.getTrackInfo.mockResolvedValue({
        duration: 0,
        name: 'Track',
        artist: { name: 'Artist' },
      } as any);

      const result = await service.lookupDuration('Artist', 'Track');

      expect(result.duration).toBeNull();
      expect(result.source).toBe('not_found');
    });

    it('should handle case-insensitive artist and track matching', async () => {
      mockFileStorage.listFiles.mockResolvedValue(['release-1.json']);
      mockFileStorage.readJSON.mockResolvedValue({
        artist: 'RADIOHEAD',
        tracklist: [{ title: 'CREEP', duration: '3:56', position: '1' }],
      });

      const result = await service.lookupDuration('radiohead', 'creep');

      expect(result.duration).toBe(236);
      expect(result.source).toBe('discogs_collection');
    });

    it('should handle errors in Discogs cache lookup gracefully', async () => {
      mockFileStorage.listFiles.mockRejectedValue(new Error('FS error'));
      mockLastfmService.getTrackInfo.mockResolvedValue(null);

      const result = await service.lookupDuration('Artist', 'Track');

      expect(result.duration).toBeNull();
      expect(result.source).toBe('not_found');
    });

    it('should handle Last.fm API errors gracefully', async () => {
      mockFileStorage.listFiles.mockResolvedValue([]);
      mockLastfmService.getTrackInfo.mockRejectedValue(new Error('API error'));

      const result = await service.lookupDuration('Artist', 'Track');

      expect(result.duration).toBeNull();
      expect(result.source).toBe('not_found');
    });

    it('should skip release files that do not match artist', async () => {
      mockFileStorage.listFiles.mockResolvedValue([
        'release-1.json',
        'release-2.json',
      ]);
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          artist: 'Other Artist',
          tracklist: [{ title: 'Creep', duration: '3:56', position: '1' }],
        })
        .mockResolvedValueOnce({
          artist: 'Radiohead',
          tracklist: [{ title: 'Creep', duration: '3:56', position: '1' }],
        });

      const result = await service.lookupDuration('Radiohead', 'Creep');

      expect(result.source).toBe('discogs_collection');
      expect(result.duration).toBe(236);
    });

    it('should only scan release-*.json files', async () => {
      mockFileStorage.listFiles.mockResolvedValue([
        'release-1.json',
        'saved-collections.json',
        'other-file.json',
      ]);
      mockFileStorage.readJSON.mockResolvedValue({
        artist: 'Radiohead',
        tracklist: [{ title: 'Creep', duration: '3:56', position: '1' }],
      });

      await service.lookupDuration('Radiohead', 'Creep');

      // Should only read the release file
      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(1);
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith(
        'collections/release-1.json'
      );
    });

    it('should handle releases with no tracklist', async () => {
      mockFileStorage.listFiles.mockResolvedValue(['release-1.json']);
      mockFileStorage.readJSON.mockResolvedValue({
        artist: 'Radiohead',
        tracklist: null,
      });
      mockLastfmService.getTrackInfo.mockResolvedValue(null);

      const result = await service.lookupDuration('Radiohead', 'Creep');

      expect(result.source).toBe('not_found');
    });
  });
});
