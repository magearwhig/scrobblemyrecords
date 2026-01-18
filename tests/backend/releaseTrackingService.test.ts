import { DiscogsService } from '../../src/backend/services/discogsService';
import { MusicBrainzService } from '../../src/backend/services/musicbrainzService';
import { ReleaseTrackingService } from '../../src/backend/services/releaseTrackingService';
import { WishlistService } from '../../src/backend/services/wishlistService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import {
  ArtistMbidMappingsStore,
  ReleaseTrackingSettings,
  ReleaseSyncStatusStore,
  PendingDisambiguationsStore,
  TrackedReleasesStore,
  CollectionArtistsCacheStore,
} from '../../src/shared/types';

// Mock dependencies
jest.mock('../../src/backend/services/discogsService');
jest.mock('../../src/backend/services/musicbrainzService');
jest.mock('../../src/backend/services/wishlistService');
jest.mock('../../src/backend/utils/fileStorage');

describe('ReleaseTrackingService', () => {
  let service: ReleaseTrackingService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockDiscogsService: jest.Mocked<DiscogsService>;
  let mockMusicBrainzService: jest.Mocked<MusicBrainzService>;
  let mockWishlistService: jest.Mocked<WishlistService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
      writeJSON: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FileStorage>;

    mockDiscogsService = {
      getUserCollection: jest.fn().mockResolvedValue([]),
      searchReleases: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DiscogsService>;

    mockMusicBrainzService = {
      searchArtist: jest.fn().mockResolvedValue([]),
      getArtistReleases: jest.fn().mockResolvedValue([]),
      getRecentAndUpcomingReleases: jest.fn().mockResolvedValue([]),
      getCoverArtUrl: jest.fn().mockResolvedValue(null),
      batchGetCoverArtUrls: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<MusicBrainzService>;

    mockWishlistService = {
      addToWishlist: jest.fn().mockResolvedValue(true),
      searchForRelease: jest.fn().mockResolvedValue([]),
      addToDiscogsWantlist: jest.fn().mockResolvedValue(true),
      getMasterVersions: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<WishlistService>;

    service = new ReleaseTrackingService(
      mockFileStorage,
      mockDiscogsService,
      mockMusicBrainzService,
      mockWishlistService
    );
  });

  describe('normalizeArtistName', () => {
    it('should normalize to lowercase', () => {
      expect(service.normalizeArtistName('RADIOHEAD')).toBe('radiohead');
    });

    it('should trim whitespace', () => {
      expect(service.normalizeArtistName('  Radiohead  ')).toBe('radiohead');
    });

    it('should collapse multiple spaces', () => {
      expect(service.normalizeArtistName('The   Rolling    Stones')).toBe(
        'rolling stones'
      );
    });

    it('should remove leading "The"', () => {
      expect(service.normalizeArtistName('The Beatles')).toBe('beatles');
    });

    it('should remove special characters', () => {
      expect(service.normalizeArtistName('AC/DC')).toBe('acdc');
      expect(service.normalizeArtistName("Guns N' Roses")).toBe('guns n roses');
    });

    it('should handle combined normalization', () => {
      expect(service.normalizeArtistName('  The    AC/DC  ')).toBe('acdc');
    });
  });

  describe('getSettings', () => {
    it('should return defaults when no settings file exists', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const settings = await service.getSettings();

      // Assert
      expect(settings).toEqual({
        schemaVersion: 1,
        autoCheckOnStartup: false,
        checkFrequencyDays: 7,
        notifyOnNewRelease: true,
        includeEps: true,
        includeSingles: false,
        includeCompilations: false,
      });
    });

    it('should return stored settings', async () => {
      // Arrange
      const storedSettings: ReleaseTrackingSettings = {
        schemaVersion: 1,
        autoCheckOnStartup: true,
        checkFrequencyDays: 14,
        notifyOnNewRelease: false,
        includeEps: false,
        includeSingles: true,
        includeCompilations: true,
      };
      mockFileStorage.readJSON.mockResolvedValue(storedSettings);

      // Act
      const settings = await service.getSettings();

      // Assert
      expect(settings).toEqual(storedSettings);
    });

    it('should return defaults if schemaVersion is wrong', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 2,
        autoCheckOnStartup: true,
      });

      // Act
      const settings = await service.getSettings();

      // Assert
      expect(settings.autoCheckOnStartup).toBe(false);
    });
  });

  describe('saveSettings', () => {
    it('should merge and save settings', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const result = await service.saveSettings({
        autoCheckOnStartup: true,
        includeSingles: true,
      });

      // Assert
      expect(result).toMatchObject({
        schemaVersion: 1,
        autoCheckOnStartup: true,
        includeSingles: true,
        includeEps: true, // Default preserved
      });
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'releases/settings.json',
        expect.objectContaining({
          schemaVersion: 1,
          autoCheckOnStartup: true,
        })
      );
    });
  });

  describe('getSyncStatus', () => {
    it('should return default status when no file exists', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const status = await service.getSyncStatus();

      // Assert
      expect(status).toEqual({
        status: 'idle',
        lastSync: null,
        artistsProcessed: 0,
        totalArtists: 0,
        releasesFound: 0,
        pendingDisambiguations: 0,
        progress: 0,
      });
    });

    it('should return stored status', async () => {
      // Arrange
      const storedStatus: ReleaseSyncStatusStore = {
        schemaVersion: 1,
        status: {
          status: 'completed',
          lastSync: 1704067200000,
          artistsProcessed: 50,
          totalArtists: 50,
          releasesFound: 10,
          pendingDisambiguations: 2,
          progress: 100,
        },
      };
      mockFileStorage.readJSON.mockResolvedValue(storedStatus);

      // Act
      const status = await service.getSyncStatus();

      // Assert
      expect(status.status).toBe('completed');
      expect(status.releasesFound).toBe(10);
      expect(status.progress).toBe(100);
    });
  });

  describe('getArtistMappings', () => {
    it('should return empty array when no mappings exist', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const mappings = await service.getArtistMappings();

      // Assert
      expect(mappings).toEqual([]);
    });

    it('should return stored mappings', async () => {
      // Arrange
      const storedMappings: ArtistMbidMappingsStore = {
        schemaVersion: 1,
        mappings: [
          {
            discogsArtistName: 'Radiohead',
            normalizedName: 'radiohead',
            mbid: 'mbid-1',
            confirmedAt: Date.now(),
            confirmedBy: 'user',
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(storedMappings);

      // Act
      const mappings = await service.getArtistMappings();

      // Assert
      expect(mappings).toHaveLength(1);
      expect(mappings[0].discogsArtistName).toBe('Radiohead');
    });
  });

  describe('findArtistMapping', () => {
    it('should find mapping by normalized name', async () => {
      // Arrange
      const storedMappings: ArtistMbidMappingsStore = {
        schemaVersion: 1,
        mappings: [
          {
            discogsArtistName: 'The Beatles',
            normalizedName: 'beatles',
            mbid: 'mbid-beatles',
            confirmedAt: Date.now(),
            confirmedBy: 'auto',
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(storedMappings);

      // Act
      const mapping = await service.findArtistMapping('THE BEATLES');

      // Assert
      expect(mapping?.mbid).toBe('mbid-beatles');
    });

    it('should return null if not found', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        mappings: [],
      });

      // Act
      const mapping = await service.findArtistMapping('Unknown Artist');

      // Assert
      expect(mapping).toBeNull();
    });
  });

  describe('setArtistMapping', () => {
    it('should create new mapping', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        mappings: [],
      });

      // Act
      const mapping = await service.setArtistMapping(
        'Radiohead',
        'mbid-radiohead',
        'user'
      );

      // Assert
      expect(mapping).toMatchObject({
        discogsArtistName: 'Radiohead',
        normalizedName: 'radiohead',
        mbid: 'mbid-radiohead',
        confirmedBy: 'user',
      });
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });

    it('should update existing mapping', async () => {
      // Arrange
      const existingMappings: ArtistMbidMappingsStore = {
        schemaVersion: 1,
        mappings: [
          {
            discogsArtistName: 'Radiohead',
            normalizedName: 'radiohead',
            mbid: 'old-mbid',
            confirmedAt: Date.now() - 10000,
            confirmedBy: 'auto',
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(existingMappings);

      // Act
      const mapping = await service.setArtistMapping(
        'Radiohead',
        'new-mbid',
        'user'
      );

      // Assert
      expect(mapping.mbid).toBe('new-mbid');
      expect(mapping.confirmedBy).toBe('user');
    });

    it('should allow null mbid (none of these)', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        mappings: [],
      });

      // Act
      const mapping = await service.setArtistMapping('Unknown', null, 'user');

      // Assert
      expect(mapping.mbid).toBeNull();
    });
  });

  describe('removeArtistMapping', () => {
    it('should remove existing mapping', async () => {
      // Arrange
      const existingMappings: ArtistMbidMappingsStore = {
        schemaVersion: 1,
        mappings: [
          {
            discogsArtistName: 'Radiohead',
            normalizedName: 'radiohead',
            mbid: 'mbid-1',
            confirmedAt: Date.now(),
            confirmedBy: 'user',
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(existingMappings);

      // Act
      const result = await service.removeArtistMapping('Radiohead');

      // Assert
      expect(result).toBe(true);
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'releases/artist-mbid-map.json',
        expect.objectContaining({
          mappings: [],
        })
      );
    });

    it('should return false if mapping does not exist', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        mappings: [],
      });

      // Act
      const result = await service.removeArtistMapping('Unknown');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getPendingDisambiguations', () => {
    it('should return empty array when no file exists', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const pending = await service.getPendingDisambiguations();

      // Assert
      expect(pending).toEqual([]);
    });

    it('should only return pending disambiguations', async () => {
      // Arrange
      const store: PendingDisambiguationsStore = {
        schemaVersion: 1,
        pending: [
          {
            id: '1',
            artistName: 'Artist1',
            normalizedName: 'artist1',
            status: 'pending',
            candidates: [],
            createdAt: Date.now(),
          },
          {
            id: '2',
            artistName: 'Artist2',
            normalizedName: 'artist2',
            status: 'resolved',
            candidates: [],
            createdAt: Date.now(),
            resolvedAt: Date.now(),
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      // Act
      const pending = await service.getPendingDisambiguations();

      // Assert
      expect(pending).toHaveLength(1);
      expect(pending[0].artistName).toBe('Artist1');
    });
  });

  describe('createDisambiguation', () => {
    it('should create new disambiguation', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      const candidates = [
        {
          mbid: 'mbid-1',
          name: 'Artist',
          score: 100,
        },
        {
          mbid: 'mbid-2',
          name: 'Artist (band)',
          score: 80,
        },
      ];

      // Act
      const disambiguation = await service.createDisambiguation(
        'Artist',
        candidates
      );

      // Assert
      expect(disambiguation).toMatchObject({
        artistName: 'Artist',
        normalizedName: 'artist',
        status: 'pending',
        candidates,
      });
      expect(disambiguation.id).toBeDefined();
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });

    it('should update existing pending disambiguation', async () => {
      // Arrange
      const existingStore: PendingDisambiguationsStore = {
        schemaVersion: 1,
        pending: [
          {
            id: 'existing-id',
            artistName: 'Artist',
            normalizedName: 'artist',
            status: 'pending',
            candidates: [{ mbid: 'old', name: 'Old', score: 50 }],
            createdAt: Date.now() - 10000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(existingStore);

      const newCandidates = [{ mbid: 'new', name: 'New', score: 100 }];

      // Act
      const disambiguation = await service.createDisambiguation(
        'Artist',
        newCandidates
      );

      // Assert
      expect(disambiguation.id).toBe('existing-id');
      expect(disambiguation.candidates).toEqual(newCandidates);
    });
  });

  describe('resolveDisambiguation', () => {
    it('should resolve disambiguation and save mapping', async () => {
      // Arrange
      const disambiguationStore: PendingDisambiguationsStore = {
        schemaVersion: 1,
        pending: [
          {
            id: 'dis-1',
            artistName: 'Artist',
            normalizedName: 'artist',
            status: 'pending',
            candidates: [],
            createdAt: Date.now(),
          },
        ],
      };
      const mappingsStore: ArtistMbidMappingsStore = {
        schemaVersion: 1,
        mappings: [],
      };

      // First call reads disambiguation, second call reads mappings
      mockFileStorage.readJSON
        .mockResolvedValueOnce(disambiguationStore)
        .mockResolvedValueOnce(mappingsStore);

      // Act
      const result = await service.resolveDisambiguation(
        'dis-1',
        'mbid-selected'
      );

      // Assert
      expect(result?.status).toBe('resolved');
      expect(result?.selectedMbid).toBe('mbid-selected');
      expect(mockFileStorage.writeJSON).toHaveBeenCalledTimes(2); // One for disambiguation, one for mapping
    });

    it('should return null if disambiguation not found', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        pending: [],
      });

      // Act
      const result = await service.resolveDisambiguation(
        'non-existent',
        'mbid'
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should return null if no store exists', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const result = await service.resolveDisambiguation('dis-1', 'mbid');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('skipDisambiguation', () => {
    it('should skip disambiguation and persist null mapping', async () => {
      // Arrange
      const disambiguationStore: PendingDisambiguationsStore = {
        schemaVersion: 1,
        pending: [
          {
            id: 'dis-1',
            artistName: 'Artist',
            normalizedName: 'artist',
            status: 'pending',
            candidates: [],
            createdAt: Date.now(),
          },
        ],
      };
      const mappingsStore: ArtistMbidMappingsStore = {
        schemaVersion: 1,
        mappings: [],
      };
      // Chain mocks: first for disambiguation store, second for mappings store
      mockFileStorage.readJSON
        .mockResolvedValueOnce(disambiguationStore)
        .mockResolvedValueOnce(mappingsStore);

      // Act
      const result = await service.skipDisambiguation('dis-1');

      // Assert
      expect(result).toBe(true);
      // Should have written the disambiguation store with skipped status
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'releases/pending-disambiguations.json',
        expect.objectContaining({
          pending: expect.arrayContaining([
            expect.objectContaining({
              id: 'dis-1',
              status: 'skipped',
            }),
          ]),
        })
      );
      // Should have written a null mapping to prevent re-prompting
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'releases/artist-mbid-map.json',
        expect.objectContaining({
          mappings: expect.arrayContaining([
            expect.objectContaining({
              discogsArtistName: 'Artist',
              mbid: null,
              confirmedBy: 'user',
            }),
          ]),
        })
      );
    });

    it('should return false if disambiguation not found', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        pending: [],
      });

      // Act
      const result = await service.skipDisambiguation('non-existent');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('cleanupOldDisambiguations', () => {
    it('should remove old resolved disambiguations', async () => {
      // Arrange
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;

      const store: PendingDisambiguationsStore = {
        schemaVersion: 1,
        pending: [
          {
            id: '1',
            artistName: 'Old',
            normalizedName: 'old',
            status: 'resolved',
            candidates: [],
            createdAt: thirtyOneDaysAgo,
            resolvedAt: thirtyOneDaysAgo,
          },
          {
            id: '2',
            artistName: 'Recent',
            normalizedName: 'recent',
            status: 'resolved',
            candidates: [],
            createdAt: fiveDaysAgo,
            resolvedAt: fiveDaysAgo,
          },
          {
            id: '3',
            artistName: 'Pending',
            normalizedName: 'pending',
            status: 'pending',
            candidates: [],
            createdAt: thirtyOneDaysAgo,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      // Act
      const removed = await service.cleanupOldDisambiguations();

      // Assert
      expect(removed).toBe(1);
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'releases/pending-disambiguations.json',
        expect.objectContaining({
          pending: expect.arrayContaining([
            expect.objectContaining({ id: '2' }),
            expect.objectContaining({ id: '3' }),
          ]),
        })
      );
    });

    it('should return 0 if no store exists', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const removed = await service.cleanupOldDisambiguations();

      // Assert
      expect(removed).toBe(0);
    });
  });

  describe('getFilteredReleases', () => {
    it('should return all releases when no filters', async () => {
      // Arrange
      const store: TrackedReleasesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        releases: [
          {
            mbid: 'rg-1',
            title: 'Album 1',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-01-15',
            releaseType: 'album',
            vinylStatus: 'unknown',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
          {
            mbid: 'rg-2',
            title: 'EP 1',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-02-15',
            releaseType: 'ep',
            vinylStatus: 'available',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      // Act
      const releases = await service.getFilteredReleases({});

      // Assert
      expect(releases).toHaveLength(2);
    });

    it('should filter by release types', async () => {
      // Arrange
      const store: TrackedReleasesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        releases: [
          {
            mbid: 'rg-1',
            title: 'Album 1',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-01-15',
            releaseType: 'album',
            vinylStatus: 'unknown',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
          {
            mbid: 'rg-2',
            title: 'EP 1',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-02-15',
            releaseType: 'ep',
            vinylStatus: 'unknown',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      // Act
      const releases = await service.getFilteredReleases({ types: ['album'] });

      // Assert
      expect(releases).toHaveLength(1);
      expect(releases[0].releaseType).toBe('album');
    });

    it('should filter by vinyl availability', async () => {
      // Arrange
      const store: TrackedReleasesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        releases: [
          {
            mbid: 'rg-1',
            title: 'Album 1',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-01-15',
            releaseType: 'album',
            vinylStatus: 'available',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
          {
            mbid: 'rg-2',
            title: 'Album 2',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-02-15',
            releaseType: 'album',
            vinylStatus: 'cd-only',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      // Act
      const releases = await service.getFilteredReleases({ vinylOnly: true });

      // Assert
      expect(releases).toHaveLength(1);
      expect(releases[0].vinylStatus).toBe('available');
    });

    it('should filter by upcoming', async () => {
      // Arrange
      const store: TrackedReleasesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        releases: [
          {
            mbid: 'rg-1',
            title: 'Released Album',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-01-15',
            releaseType: 'album',
            vinylStatus: 'unknown',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
          {
            mbid: 'rg-2',
            title: 'Upcoming Album',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2025-06-15',
            releaseType: 'album',
            vinylStatus: 'unknown',
            firstSeen: Date.now(),
            isUpcoming: true,
            inWishlist: false,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      // Act
      const releases = await service.getFilteredReleases({
        upcomingOnly: true,
      });

      // Assert
      expect(releases).toHaveLength(1);
      expect(releases[0].isUpcoming).toBe(true);
    });

    it('should sort by release date descending', async () => {
      // Arrange
      const store: TrackedReleasesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        releases: [
          {
            mbid: 'rg-1',
            title: 'Older Album',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-01-15',
            releaseType: 'album',
            vinylStatus: 'unknown',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
          {
            mbid: 'rg-2',
            title: 'Newer Album',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-06-15',
            releaseType: 'album',
            vinylStatus: 'unknown',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      // Act
      const releases = await service.getFilteredReleases({
        sortBy: 'releaseDate',
        sortOrder: 'desc',
      });

      // Assert - newest first for desc
      expect(releases[0].title).toBe('Newer Album');
      expect(releases[1].title).toBe('Older Album');
    });

    it('should sort by release date ascending', async () => {
      // Arrange
      const store: TrackedReleasesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        releases: [
          {
            mbid: 'rg-1',
            title: 'Older Album',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-01-15',
            releaseType: 'album',
            vinylStatus: 'unknown',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
          {
            mbid: 'rg-2',
            title: 'Newer Album',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-06-15',
            releaseType: 'album',
            vinylStatus: 'unknown',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      // Act
      const releases = await service.getFilteredReleases({
        sortBy: 'releaseDate',
        sortOrder: 'asc',
      });

      // Assert - oldest first for asc
      expect(releases[0].title).toBe('Older Album');
      expect(releases[1].title).toBe('Newer Album');
    });

    it('should apply limit', async () => {
      // Arrange
      const store: TrackedReleasesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        releases: Array(10)
          .fill(null)
          .map((_, i) => ({
            mbid: `rg-${i}`,
            title: `Album ${i}`,
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-01-15',
            releaseType: 'album' as const,
            vinylStatus: 'unknown' as const,
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          })),
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      // Act
      const releases = await service.getFilteredReleases({ limit: 5 });

      // Assert
      expect(releases).toHaveLength(5);
    });
  });

  describe('searchArtist', () => {
    it('should delegate to MusicBrainzService', async () => {
      // Arrange
      const mockResults = [
        { mbid: 'mbid-1', name: 'Artist', score: 100 },
        { mbid: 'mbid-2', name: 'Artist (band)', score: 80 },
      ];
      mockMusicBrainzService.searchArtist.mockResolvedValue(mockResults);

      // Act
      const results = await service.searchArtist('Artist');

      // Assert
      expect(results).toEqual(mockResults);
      expect(mockMusicBrainzService.searchArtist).toHaveBeenCalledWith(
        'Artist'
      );
    });
  });

  describe('addToWishlist', () => {
    it('should return false if release not found', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        lastUpdated: Date.now(),
        releases: [],
      });

      // Act
      const result = await service.addToWishlist('non-existent');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false if Discogs search returns no results', async () => {
      // Arrange
      const store: TrackedReleasesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        releases: [
          {
            mbid: 'rg-1',
            title: 'Album',
            artistName: 'Artist',
            artistMbid: 'artist-mbid',
            releaseDate: '2024-01-15',
            releaseType: 'album',
            vinylStatus: 'unknown',
            firstSeen: Date.now(),
            isUpcoming: false,
            inWishlist: false,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);
      // Mock empty Discogs search results
      mockWishlistService.searchForRelease.mockResolvedValue([]);

      // Act
      const result = await service.addToWishlist('rg-1');

      // Assert
      expect(result).toBe(false);
      expect(mockWishlistService.searchForRelease).toHaveBeenCalledWith(
        'Artist',
        'Album'
      );
    });
  });

  describe('getDisambiguation', () => {
    it('should return disambiguation by ID', async () => {
      // Arrange
      const store: PendingDisambiguationsStore = {
        schemaVersion: 1,
        pending: [
          {
            id: 'dis-1',
            artistName: 'Artist',
            normalizedName: 'artist',
            status: 'pending',
            candidates: [],
            createdAt: Date.now(),
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      // Act
      const result = await service.getDisambiguation('dis-1');

      // Assert
      expect(result?.id).toBe('dis-1');
    });

    it('should return null if not found', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        pending: [],
      });

      // Act
      const result = await service.getDisambiguation('non-existent');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getCollectionArtists', () => {
    it('should return cached artists if cache is fresh', async () => {
      // Arrange
      const cache: CollectionArtistsCacheStore = {
        schemaVersion: 1,
        fetchedAt: Date.now() - 60 * 60 * 1000, // 1 hour ago (within 24h)
        artists: [
          { name: 'Artist 1', normalizedName: 'artist 1' },
          { name: 'Artist 2', normalizedName: 'artist 2' },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(cache);

      // Act
      const artists = await service.getCollectionArtists('testuser');

      // Assert
      expect(artists).toHaveLength(2);
      expect(mockDiscogsService.getUserCollection).not.toHaveBeenCalled();
    });

    it('should fetch fresh data if cache is stale', async () => {
      // Arrange - cache is 25 hours old
      const oldCache: CollectionArtistsCacheStore = {
        schemaVersion: 1,
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
        artists: [],
      };
      mockFileStorage.readJSON.mockResolvedValue(oldCache);

      mockDiscogsService.getUserCollection.mockResolvedValue({
        success: true,
        data: [
          {
            id: 1,
            date_added: new Date().toISOString(),
            rating: 0,
            release: {
              id: 1,
              title: 'Album',
              artist: 'Fresh Artist',
              year: 2024,
              format: ['Vinyl'],
              label: ['Label'],
              cover_image: '',
              resource_url: '',
            },
          },
        ],
      });

      // Act
      const artists = await service.getCollectionArtists('testuser');

      // Assert
      expect(mockDiscogsService.getUserCollection).toHaveBeenCalled();
      expect(artists).toHaveLength(1);
      expect(artists[0].name).toBe('Fresh Artist');
    });

    it('should force refresh when requested', async () => {
      // Arrange - even with fresh cache
      const freshCache: CollectionArtistsCacheStore = {
        schemaVersion: 1,
        fetchedAt: Date.now(),
        artists: [{ name: 'Old', normalizedName: 'old' }],
      };
      mockFileStorage.readJSON.mockResolvedValue(freshCache);

      mockDiscogsService.getUserCollection.mockResolvedValue({
        success: true,
        data: [
          {
            id: 1,
            date_added: new Date().toISOString(),
            rating: 0,
            release: {
              id: 1,
              title: 'Album',
              artist: 'New Artist',
              year: 2024,
              format: ['Vinyl'],
              label: ['Label'],
              cover_image: '',
              resource_url: '',
            },
          },
        ],
      });

      // Act
      const artists = await service.getCollectionArtists('testuser', true);

      // Assert
      expect(mockDiscogsService.getUserCollection).toHaveBeenCalled();
      expect(artists[0].name).toBe('New Artist');
    });
  });
});
