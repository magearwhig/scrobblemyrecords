import { artistMappingService } from '../../../src/backend/services/artistMappingService';
import { ArtistSimilarityEnricherService } from '../../../src/backend/services/artistSimilarityEnricherService';
import { MappingService } from '../../../src/backend/services/mappingService';
import {
  ProfileBuilderService,
  RecentScrobble,
} from '../../../src/backend/services/profileBuilderService';
import { TagEnricherService } from '../../../src/backend/services/tagEnricherService';
import { createMockRelease } from '../../fixtures/embeddingFixtures';

// Mock all service dependencies
jest.mock('../../../src/backend/services/tagEnricherService');
jest.mock('../../../src/backend/services/artistSimilarityEnricherService');
jest.mock('../../../src/backend/services/mappingService');

// Mock the singleton artistMappingService
jest.mock('../../../src/backend/services/artistMappingService', () => ({
  artistMappingService: {
    getLastfmName: jest.fn((name: string) => name),
  },
}));

const MockedTagEnricherService = TagEnricherService as jest.MockedClass<
  typeof TagEnricherService
>;
const MockedArtistSimilarityEnricherService =
  ArtistSimilarityEnricherService as jest.MockedClass<
    typeof ArtistSimilarityEnricherService
  >;
const MockedMappingService = MappingService as jest.MockedClass<
  typeof MappingService
>;

describe('ProfileBuilderService', () => {
  let service: ProfileBuilderService;
  let mockTagEnricher: jest.Mocked<TagEnricherService>;
  let mockArtistSimilarityEnricher: jest.Mocked<ArtistSimilarityEnricherService>;
  let mockMappingService: jest.Mocked<MappingService>;
  let mockedArtistMapping: jest.Mocked<typeof artistMappingService>;

  beforeEach(() => {
    mockTagEnricher = new MockedTagEnricherService(
      {} as never,
      {} as never
    ) as jest.Mocked<TagEnricherService>;
    mockArtistSimilarityEnricher = new MockedArtistSimilarityEnricherService(
      {} as never,
      {} as never
    ) as jest.Mocked<ArtistSimilarityEnricherService>;
    mockMappingService = new MockedMappingService(
      {} as never
    ) as jest.Mocked<MappingService>;
    mockedArtistMapping = jest.mocked(artistMappingService);

    // Default mocks
    mockTagEnricher.enrichRecord = jest.fn().mockResolvedValue({
      artistTags: ['experimental', 'british'],
      albumTags: ['alternative rock', 'art rock'],
      trackTags: ['psychedelic'],
    });
    mockTagEnricher.getArtistTags = jest
      .fn()
      .mockResolvedValue(['trip-hop', 'electronic']);
    mockArtistSimilarityEnricher.findSimilarInCollection = jest
      .fn()
      .mockResolvedValue(['Portishead', 'Massive Attack']);
    mockMappingService.getAlbumMappingForCollection = jest
      .fn()
      .mockResolvedValue(null);
    mockedArtistMapping.getLastfmName.mockImplementation(
      (name: string) => name
    );

    service = new ProfileBuilderService(
      mockTagEnricher,
      mockArtistSimilarityEnricher,
      mockMappingService
    );
  });

  describe('buildRecordProfile', () => {
    it('should produce a string with Artist and Album lines', async () => {
      // Arrange
      const release = createMockRelease();
      const collectionArtists = ['Radiohead', 'Portishead'];

      // Act
      const profile = await service.buildRecordProfile(
        release,
        collectionArtists
      );

      // Assert
      expect(typeof profile).toBe('string');
      expect(profile).toContain('Artist: Radiohead');
      expect(profile).toContain('Album: OK Computer');
    });

    it('should include Year when available', async () => {
      // Arrange
      const release = createMockRelease({ year: 1997 });

      // Act
      const profile = await service.buildRecordProfile(release, []);

      // Assert
      expect(profile).toContain('Year: 1997');
    });

    it('should omit Year when undefined', async () => {
      // Arrange
      const release = createMockRelease({ year: undefined });

      // Act
      const profile = await service.buildRecordProfile(release, []);

      // Assert
      expect(profile).not.toContain('Year:');
    });

    it('should include Tags from album and track tags', async () => {
      // Arrange
      const release = createMockRelease();
      mockTagEnricher.enrichRecord.mockResolvedValue({
        artistTags: ['experimental'],
        albumTags: ['alternative rock'],
        trackTags: ['psychedelic'],
      });

      // Act
      const profile = await service.buildRecordProfile(release, []);

      // Assert
      expect(profile).toContain('Tags:');
      expect(profile).toContain('alternative rock');
    });

    it('should include Artist Tags', async () => {
      // Arrange
      const release = createMockRelease();
      mockTagEnricher.enrichRecord.mockResolvedValue({
        artistTags: ['experimental', 'british'],
        albumTags: [],
        trackTags: [],
      });

      // Act
      const profile = await service.buildRecordProfile(release, []);

      // Assert
      expect(profile).toContain('Artist Tags: experimental, british');
    });

    it('should include Similar Artists In Collection', async () => {
      // Arrange
      const release = createMockRelease();
      mockArtistSimilarityEnricher.findSimilarInCollection.mockResolvedValue([
        'Portishead',
        'Massive Attack',
      ]);

      // Act
      const profile = await service.buildRecordProfile(release, [
        'Portishead',
        'Massive Attack',
      ]);

      // Assert
      expect(profile).toContain('Similar Artists In Collection:');
      expect(profile).toContain('Portishead');
    });

    it('should include track titles from tracklist', async () => {
      // Arrange
      const release = createMockRelease({
        tracklist: [
          { position: 'A1', title: 'Airbag' },
          { position: 'A2', title: 'Paranoid Android' },
        ],
      });

      // Act
      const profile = await service.buildRecordProfile(release, []);

      // Assert
      expect(profile).toContain('Tracks: Airbag, Paranoid Android');
    });

    it('should use the album mapping when one exists', async () => {
      // Arrange
      const release = createMockRelease({
        artist: 'Artist (3)',
        title: 'My Album',
      });
      mockMappingService.getAlbumMappingForCollection.mockResolvedValue({
        collectionId: 1,
        collectionArtist: 'Artist (3)',
        collectionAlbum: 'My Album',
        historyArtist: 'Real Artist Name',
        historyAlbum: 'My Album (Expanded Edition)',
        createdAt: Date.now(),
      } as never);

      // Act
      const profile = await service.buildRecordProfile(release, []);

      // Assert
      expect(profile).toContain('Album: My Album (Expanded Edition)');
    });

    it('should use artistMappingService to resolve the artist name', async () => {
      // Arrange
      const release = createMockRelease({ artist: 'Tobacco (3)' });
      mockedArtistMapping.getLastfmName.mockReturnValue('Tobacco');

      // Act
      const profile = await service.buildRecordProfile(release, []);

      // Assert
      expect(profile).toContain('Artist: Tobacco');
      expect(profile).not.toContain('Tobacco (3)');
    });

    it('should degrade gracefully when tag enrichment throws', async () => {
      // Arrange
      const release = createMockRelease();
      mockTagEnricher.enrichRecord.mockRejectedValue(
        new Error('Last.fm offline')
      );

      // Act — should not throw
      const profile = await service.buildRecordProfile(release, []);

      // Assert — still returns a profile without tags
      expect(profile).toContain('Artist:');
      expect(profile).toContain('Album:');
    });

    it('should degrade gracefully when artist similarity throws', async () => {
      // Arrange
      const release = createMockRelease();
      mockArtistSimilarityEnricher.findSimilarInCollection.mockRejectedValue(
        new Error('Similarity service down')
      );

      // Act — should not throw
      const profile = await service.buildRecordProfile(release, ['Portishead']);

      // Assert — profile still generated without similarity section
      expect(profile).toContain('Artist:');
    });

    it('should deduplicate tags that appear in both albumTags and trackTags', async () => {
      // Arrange
      const release = createMockRelease();
      mockTagEnricher.enrichRecord.mockResolvedValue({
        artistTags: [],
        albumTags: ['alternative rock', 'art rock'],
        trackTags: ['alternative rock', 'psychedelic'], // 'alternative rock' is duplicate
      });

      // Act
      const profile = await service.buildRecordProfile(release, []);

      // Assert — 'alternative rock' should appear exactly once in Tags
      const tagsLine =
        profile.split('\n').find(l => l.startsWith('Tags:')) ?? '';
      const tagValues = tagsLine.replace('Tags: ', '').split(', ');
      const altRockCount = tagValues.filter(
        t => t === 'alternative rock'
      ).length;
      expect(altRockCount).toBe(1);
    });
  });

  describe('buildSessionProfile', () => {
    it('should return an empty string for empty scrobbles', async () => {
      // Act
      const profile = await service.buildSessionProfile([]);

      // Assert
      expect(profile).toBe('');
    });

    it('should include recent artists in the profile', async () => {
      // Arrange
      const scrobbles: RecentScrobble[] = [
        { artist: 'Radiohead', track: 'Creep' },
        { artist: 'Portishead', track: 'Glory Box' },
      ];

      // Act
      const profile = await service.buildSessionProfile(scrobbles);

      // Assert
      expect(profile).toContain('Recent Artists:');
      expect(profile).toContain('Radiohead');
      expect(profile).toContain('Portishead');
    });

    it('should aggregate tags across all recent artists', async () => {
      // Arrange
      const scrobbles: RecentScrobble[] = [
        { artist: 'Radiohead', track: 'Creep' },
        { artist: 'Portishead', track: 'Glory Box' },
      ];
      mockTagEnricher.getArtistTags.mockResolvedValue([
        'trip-hop',
        'electronic',
      ]);

      // Act
      const profile = await service.buildSessionProfile(scrobbles);

      // Assert
      expect(profile).toContain('Recent Tags:');
    });

    it('should rank artists by scrobble frequency', async () => {
      // Arrange — Radiohead appears 3 times, Portishead once
      const scrobbles: RecentScrobble[] = [
        { artist: 'Radiohead', track: 'Creep' },
        { artist: 'Radiohead', track: 'Karma Police' },
        { artist: 'Radiohead', track: 'Paranoid Android' },
        { artist: 'Portishead', track: 'Glory Box' },
      ];

      // Act
      const profile = await service.buildSessionProfile(scrobbles);

      // Assert — Radiohead should appear first
      const artistsLine =
        profile.split('\n').find(l => l.startsWith('Recent Artists:')) ?? '';
      const firstArtist = artistsLine
        .replace('Recent Artists: ', '')
        .split(', ')[0];
      expect(firstArtist).toBe('Radiohead');
    });

    it('should include top recent tracks', async () => {
      // Arrange
      const scrobbles: RecentScrobble[] = [
        { artist: 'Radiohead', track: 'Paranoid Android' },
        { artist: 'Portishead', track: 'Glory Box' },
      ];

      // Act
      const profile = await service.buildSessionProfile(scrobbles);

      // Assert
      expect(profile).toContain('Top Recent Tracks:');
    });

    it('should not throw when tag fetching fails for a session artist', async () => {
      // Arrange
      const scrobbles: RecentScrobble[] = [
        { artist: 'Radiohead', track: 'Creep' },
      ];
      mockTagEnricher.getArtistTags.mockRejectedValue(new Error('API error'));

      // Act — should not throw
      const profile = await service.buildSessionProfile(scrobbles);

      // Assert
      expect(profile).toContain('Recent Artists:');
    });
  });
});
