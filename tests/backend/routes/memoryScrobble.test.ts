import request from 'supertest';

import { createMemoryScrobbleRouter } from '../../../src/backend/routes/memoryScrobble';
import { DurationLookupService } from '../../../src/backend/services/durationLookupService';
import { SavedCollectionService } from '../../../src/backend/services/savedCollectionService';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import {
  SavedCollection,
  SavedCollectionTrack,
} from '../../../src/shared/types';
import { createTestApp } from '../../utils/testHelpers';

// Mock dependencies
jest.mock('../../../src/backend/services/savedCollectionService');
jest.mock('../../../src/backend/services/durationLookupService');
jest.mock('../../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../../src/backend/utils/fileStorage');
jest.mock('../../../src/backend/services/lastfmService');
jest.mock('../../../src/backend/services/discogsService');
jest.mock('../../../src/backend/services/artistMappingService', () => ({
  artistMappingService: {
    getLastfmName: jest.fn((name: string) => name),
  },
}));

const MockedSavedCollectionService = SavedCollectionService as jest.MockedClass<
  typeof SavedCollectionService
>;
const MockedDurationLookupService = DurationLookupService as jest.MockedClass<
  typeof DurationLookupService
>;
const MockedHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;

describe('Memory Scrobble Routes', () => {
  let mockSavedCollectionService: jest.Mocked<SavedCollectionService>;
  let mockDurationLookupService: jest.Mocked<DurationLookupService>;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;

  const mockCollection: SavedCollection = {
    id: 'col-1',
    name: 'Swimming Playlist',
    description: 'Tracks for pool sessions',
    tracks: [],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };

  const mockTrack: SavedCollectionTrack = {
    artist: 'Radiohead',
    track: 'Everything In Its Right Place',
    album: 'Kid A',
    duration: 252,
    position: 1,
    lastfmMatch: true,
  };

  const mockCollectionWithTracks: SavedCollection = {
    ...mockCollection,
    tracks: [mockTrack],
  };

  let app: ReturnType<typeof createTestApp>['app'];

  beforeEach(() => {
    jest.clearAllMocks();

    mockSavedCollectionService = new MockedSavedCollectionService(
      {} as any
    ) as jest.Mocked<SavedCollectionService>;
    mockDurationLookupService = new MockedDurationLookupService(
      {} as any,
      {} as any,
      {} as any
    ) as jest.Mocked<DurationLookupService>;
    mockHistoryStorage = new MockedHistoryStorage(
      {} as any
    ) as jest.Mocked<ScrobbleHistoryStorage>;

    const result = createTestApp({
      mountPath: '/api/v1/memory-scrobble',
      routerFactory: () =>
        createMemoryScrobbleRouter(
          mockSavedCollectionService,
          mockDurationLookupService,
          mockHistoryStorage
        ),
      mocks: {},
    });
    app = result.app;
  });

  describe('GET /collections', () => {
    it('should return all collections', async () => {
      mockSavedCollectionService.getCollections.mockResolvedValue([
        mockCollection,
      ]);

      const response = await request(app)
        .get('/api/v1/memory-scrobble/collections')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Swimming Playlist');
    });

    it('should return 500 on error', async () => {
      mockSavedCollectionService.getCollections.mockRejectedValue(
        new Error('Storage error')
      );

      const response = await request(app)
        .get('/api/v1/memory-scrobble/collections')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Storage error');
    });
  });

  describe('POST /collections', () => {
    it('should create a new collection', async () => {
      mockSavedCollectionService.createCollection.mockResolvedValue(
        mockCollection
      );

      const response = await request(app)
        .post('/api/v1/memory-scrobble/collections')
        .send({
          name: 'Swimming Playlist',
          description: 'Tracks for pool sessions',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Swimming Playlist');
      expect(mockSavedCollectionService.createCollection).toHaveBeenCalledWith(
        'Swimming Playlist',
        'Tracks for pool sessions'
      );
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/api/v1/memory-scrobble/collections')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Name is required');
    });

    it('should return 400 when name is not a string', async () => {
      const response = await request(app)
        .post('/api/v1/memory-scrobble/collections')
        .send({ name: 123 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /collections/:id', () => {
    it('should return a single collection', async () => {
      mockSavedCollectionService.getCollection.mockResolvedValue(
        mockCollectionWithTracks
      );

      const response = await request(app)
        .get('/api/v1/memory-scrobble/collections/col-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('col-1');
      expect(response.body.data.tracks).toHaveLength(1);
    });

    it('should return 404 when collection not found', async () => {
      mockSavedCollectionService.getCollection.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/memory-scrobble/collections/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Collection not found');
    });
  });

  describe('PUT /collections/:id', () => {
    it('should update collection metadata', async () => {
      const updated = { ...mockCollection, name: 'Updated Name' };
      mockSavedCollectionService.updateCollection.mockResolvedValue(updated);

      const response = await request(app)
        .put('/api/v1/memory-scrobble/collections/col-1')
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
    });

    it('should return 404 when collection not found', async () => {
      mockSavedCollectionService.updateCollection.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/v1/memory-scrobble/collections/nonexistent')
        .send({ name: 'New Name' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /collections/:id', () => {
    it('should delete a collection', async () => {
      mockSavedCollectionService.deleteCollection.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/v1/memory-scrobble/collections/col-1')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 when collection not found', async () => {
      mockSavedCollectionService.deleteCollection.mockResolvedValue(false);

      const response = await request(app)
        .delete('/api/v1/memory-scrobble/collections/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /collections/:id/import', () => {
    it('should import CSV content into a collection', async () => {
      mockSavedCollectionService.importCsv.mockResolvedValue({
        imported: 2,
        errors: [],
        unmatched: [],
      });

      const response = await request(app)
        .post('/api/v1/memory-scrobble/collections/col-1/import')
        .send({
          csvContent:
            'Radiohead,Everything In Its Right Place,Kid A\nBjork,Army of Me,Post',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.imported).toBe(2);
      expect(response.body.data.errors).toHaveLength(0);
    });

    it('should return 400 when csvContent is missing', async () => {
      const response = await request(app)
        .post('/api/v1/memory-scrobble/collections/col-1/import')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('csvContent is required');
    });

    it('should return import results with unmatched tracks', async () => {
      const unmatchedTrack: SavedCollectionTrack = {
        artist: 'Unknown Artist',
        track: 'Unknown Track',
        duration: 0,
        position: 1,
        lastfmMatch: false,
      };
      mockSavedCollectionService.importCsv.mockResolvedValue({
        imported: 1,
        errors: [],
        unmatched: [unmatchedTrack],
      });

      const response = await request(app)
        .post('/api/v1/memory-scrobble/collections/col-1/import')
        .send({ csvContent: 'Unknown Artist,Unknown Track' })
        .expect(200);

      expect(response.body.data.unmatched).toHaveLength(1);
    });
  });

  describe('POST /collections/:id/tracks', () => {
    it('should add a track to a collection', async () => {
      mockSavedCollectionService.addTrack.mockResolvedValue(mockTrack);

      const response = await request(app)
        .post('/api/v1/memory-scrobble/collections/col-1/tracks')
        .send({
          artist: 'Radiohead',
          track: 'Everything In Its Right Place',
          album: 'Kid A',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.artist).toBe('Radiohead');
    });

    it('should return 400 when artist or track is missing', async () => {
      const response = await request(app)
        .post('/api/v1/memory-scrobble/collections/col-1/tracks')
        .send({ artist: 'Radiohead' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Artist and track are required');
    });

    it('should return 404 when collection not found', async () => {
      mockSavedCollectionService.addTrack.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/memory-scrobble/collections/nonexistent/tracks')
        .send({ artist: 'Radiohead', track: 'Creep' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /collections/:id/tracks/:position', () => {
    it('should remove a track by position', async () => {
      mockSavedCollectionService.removeTrack.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/v1/memory-scrobble/collections/col-1/tracks/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockSavedCollectionService.removeTrack).toHaveBeenCalledWith(
        'col-1',
        1
      );
    });

    it('should return 400 for invalid position', async () => {
      const response = await request(app)
        .delete('/api/v1/memory-scrobble/collections/col-1/tracks/abc')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid position');
    });

    it('should return 404 when track not found', async () => {
      mockSavedCollectionService.removeTrack.mockResolvedValue(false);

      const response = await request(app)
        .delete('/api/v1/memory-scrobble/collections/col-1/tracks/99')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /search', () => {
    it('should return empty array for empty query', async () => {
      const response = await request(app)
        .get('/api/v1/memory-scrobble/search?q=')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should search history and collections', async () => {
      mockHistoryStorage.getTracksPaginated.mockResolvedValue({
        items: [
          {
            artist: 'Radiohead',
            album: 'Kid A',
            track: 'Everything In Its Right Place',
            playCount: 10,
            lastPlayed: 1700000000000,
          },
        ],
        total: 1,
        totalPages: 1,
        page: 1,
      });

      mockSavedCollectionService.getCollections.mockResolvedValue([
        mockCollectionWithTracks,
      ]);

      const response = await request(app)
        .get('/api/v1/memory-scrobble/search?q=radiohead')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0].artist).toBe('Radiohead');
    });

    it('should deduplicate results across sources', async () => {
      // Same track in both history and collection
      mockHistoryStorage.getTracksPaginated.mockResolvedValue({
        items: [
          {
            artist: 'Radiohead',
            album: 'Kid A',
            track: 'Everything In Its Right Place',
            playCount: 10,
            lastPlayed: 1700000000000,
          },
        ],
        total: 1,
        totalPages: 1,
        page: 1,
      });

      mockSavedCollectionService.getCollections.mockResolvedValue([
        mockCollectionWithTracks,
      ]);

      const response = await request(app)
        .get('/api/v1/memory-scrobble/search?q=everything')
        .expect(200);

      // Should only appear once (history takes priority)
      const matching = response.body.data.filter(
        (r: { track: string }) => r.track === 'Everything In Its Right Place'
      );
      expect(matching).toHaveLength(1);
      expect(matching[0].source).toBe('history');
    });

    it('should respect limit parameter', async () => {
      mockHistoryStorage.getTracksPaginated.mockResolvedValue({
        items: [],
        total: 0,
        totalPages: 0,
        page: 1,
      });

      mockSavedCollectionService.getCollections.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/memory-scrobble/search?q=test&limit=5')
        .expect(200);

      // historyLimit = ceil(5/2) = 3
      expect(mockHistoryStorage.getTracksPaginated).toHaveBeenCalledWith(
        1,
        3,
        'playCount',
        'desc',
        'test'
      );
    });
  });

  describe('GET /duration', () => {
    it('should look up track duration', async () => {
      mockDurationLookupService.lookupDuration.mockResolvedValue({
        artist: 'Radiohead',
        track: 'Everything In Its Right Place',
        duration: 252,
        source: 'lastfm',
      });

      const response = await request(app)
        .get(
          '/api/v1/memory-scrobble/duration?artist=Radiohead&track=Everything%20In%20Its%20Right%20Place'
        )
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.duration).toBe(252);
      expect(response.body.data.source).toBe('lastfm');
    });

    it('should return 400 when artist is missing', async () => {
      const response = await request(app)
        .get('/api/v1/memory-scrobble/duration?track=Creep')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 when track is missing', async () => {
      const response = await request(app)
        .get('/api/v1/memory-scrobble/duration?artist=Radiohead')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /prepare', () => {
    it('should prepare tracks with timestamps', async () => {
      const startTime = 1700000000;

      const response = await request(app)
        .post('/api/v1/memory-scrobble/prepare')
        .send({
          sessionStart: startTime,
          sessionEnd: startTime + 3600,
          tracks: [
            {
              artist: 'Radiohead',
              track: 'Everything In Its Right Place',
              album: 'Kid A',
              duration: 252,
            },
            {
              artist: 'Bjork',
              track: 'Army of Me',
              album: 'Post',
              duration: 224,
            },
          ],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tracks).toHaveLength(2);
      // First track starts at sessionStart
      expect(response.body.data.tracks[0].timestamp).toBe(startTime);
      // Second track starts after first duration + 1s gap
      expect(response.body.data.tracks[1].timestamp).toBe(startTime + 252 + 1);
      expect(response.body.data.overflows).toBe(false);
    });

    it('should resolve missing durations via lookup service', async () => {
      mockDurationLookupService.lookupDuration.mockResolvedValue({
        artist: 'Radiohead',
        track: 'Creep',
        duration: 236,
        source: 'lastfm',
      });

      const response = await request(app)
        .post('/api/v1/memory-scrobble/prepare')
        .send({
          sessionStart: 1700000000,
          tracks: [
            { artist: 'Radiohead', track: 'Creep', album: 'Pablo Honey' },
          ],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tracks[0].duration).toBe(236);
      expect(mockDurationLookupService.lookupDuration).toHaveBeenCalledWith(
        'Radiohead',
        'Creep',
        'Pablo Honey'
      );
    });

    it('should fallback to 180s when duration lookup fails', async () => {
      mockDurationLookupService.lookupDuration.mockRejectedValue(
        new Error('Lookup failed')
      );

      const response = await request(app)
        .post('/api/v1/memory-scrobble/prepare')
        .send({
          sessionStart: 1700000000,
          tracks: [{ artist: 'Unknown', track: 'Unknown Song' }],
        })
        .expect(200);

      expect(response.body.data.tracks[0].duration).toBe(180);
    });

    it('should set overflows to true when tracks exceed session window', async () => {
      const startTime = 1700000000;

      const response = await request(app)
        .post('/api/v1/memory-scrobble/prepare')
        .send({
          sessionStart: startTime,
          sessionEnd: startTime + 100, // Very short session
          tracks: [
            { artist: 'Radiohead', track: 'Paranoid Android', duration: 384 },
          ],
        })
        .expect(200);

      expect(response.body.data.overflows).toBe(true);
    });

    it('should apply artist mappings', async () => {
      // The mock returns the name as-is by default; override for this test
      const { artistMappingService } = jest.requireMock(
        '../../../src/backend/services/artistMappingService'
      );
      artistMappingService.getLastfmName.mockReturnValue('Mapped Artist');

      const response = await request(app)
        .post('/api/v1/memory-scrobble/prepare')
        .send({
          sessionStart: 1700000000,
          tracks: [
            { artist: 'Original Artist', track: 'Some Track', duration: 200 },
          ],
        })
        .expect(200);

      expect(response.body.data.tracks[0].artist).toBe('Mapped Artist');

      // Restore default mock
      artistMappingService.getLastfmName.mockImplementation(
        (name: string) => name
      );
    });

    it('should return 400 when sessionStart is missing', async () => {
      const response = await request(app)
        .post('/api/v1/memory-scrobble/prepare')
        .send({
          tracks: [{ artist: 'Radiohead', track: 'Creep', duration: 200 }],
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 when tracks array is empty', async () => {
      const response = await request(app)
        .post('/api/v1/memory-scrobble/prepare')
        .send({ sessionStart: 1700000000, tracks: [] })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle millisecond timestamps by converting to seconds', async () => {
      const startMs = 1700000000000; // milliseconds

      const response = await request(app)
        .post('/api/v1/memory-scrobble/prepare')
        .send({
          sessionStart: startMs,
          tracks: [{ artist: 'Radiohead', track: 'Creep', duration: 200 }],
        })
        .expect(200);

      // Should have been converted to seconds
      expect(response.body.data.tracks[0].timestamp).toBe(1700000000);
    });
  });
});
