/**
 * Shared test fixtures for embedding/recommendation tests.
 *
 * All random values are seeded deterministically so tests are reproducible.
 */

import { vectorToBase64 } from '../../src/backend/utils/vectorSerialization';
import {
  ArtistSimilarityEntry,
  DiscogsRelease,
  EmbeddingStatus,
  ListeningSessionEntry,
  RecordEmbeddingEntry,
  RecommendationResult,
  RecommendationSettings,
  RecommendationWeights,
} from '../../src/shared/types';

// ---------------------------------------------------------------------------
// Deterministic vector generation
// ---------------------------------------------------------------------------

/**
 * Creates a deterministic pseudo-random embedding of the given dimension.
 * Uses a simple linear congruential generator seeded by the dimension count.
 */
export function createMockEmbedding(dims = 768): number[] {
  const vec: number[] = [];
  let seed = dims * 1234567;
  for (let i = 0; i < dims; i++) {
    // LCG: not cryptographically random but stable across runs
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    vec.push(seed / 0x80000000 - 1); // range [-1, 1)
  }
  return vec;
}

// Stable 768-dimensional mock embedding
export const mockEmbedding768: number[] = createMockEmbedding(768);

// Base64-encoded version of mockEmbedding768
export const mockEmbeddingBase64: string = vectorToBase64(mockEmbedding768);

// ---------------------------------------------------------------------------
// Fixture factory functions
// ---------------------------------------------------------------------------

export function createMockRelease(
  overrides: Partial<DiscogsRelease> = {}
): DiscogsRelease {
  return {
    id: 12345,
    title: 'OK Computer',
    artist: 'Radiohead',
    year: 1997,
    format: ['Vinyl', 'LP'],
    label: ['Parlophone'],
    catalog_number: 'NODATA 02',
    cover_image: 'https://img.discogs.com/ok-computer.jpg',
    resource_url: 'https://api.discogs.com/releases/12345',
    tracklist: [
      { position: 'A1', title: 'Airbag', duration: '4:44' },
      { position: 'A2', title: 'Paranoid Android', duration: '6:27' },
      {
        position: 'A3',
        title: 'Subterranean Homesick Alien',
        duration: '4:27',
      },
    ],
    ...overrides,
  };
}

export function createMockRecordEmbeddingEntry(
  overrides: Partial<RecordEmbeddingEntry> = {}
): RecordEmbeddingEntry {
  return {
    discogsReleaseId: 12345,
    textProfile: [
      'Artist: Radiohead',
      'Album: OK Computer',
      'Year: 1997',
      'Genres: Vinyl, LP',
      'Tags: alternative rock, art rock, post-rock',
      'Artist Tags: experimental, electronic, british',
      'Tracks: Airbag, Paranoid Android, Subterranean Homesick Alien',
    ].join('\n'),
    embedding: mockEmbeddingBase64,
    embeddingModel: 'nomic-embed-text',
    lastEnrichedAt: 1700000000000,
    ...overrides,
  };
}

export function createMockRecommendationWeights(
  overrides: Partial<RecommendationWeights> = {}
): RecommendationWeights {
  return {
    cosineSimilarity: 0.5,
    artistSimilarity: 0.2,
    recencyDecay: 0.2,
    diversityBonus: 0.1,
    ...overrides,
  };
}

export function createMockRecommendationSettings(
  overrides: Partial<RecommendationSettings> = {}
): RecommendationSettings {
  return {
    schemaVersion: 1,
    defaultCount: 10,
    defaultWindowHours: 168,
    weights: createMockRecommendationWeights(),
    recencyDecayHalfLifeDays: 90,
    excludeRecentlyPlayed: true,
    excludeRecentlyRecommended: true,
    recentlyRecommendedWindowDays: 7,
    embedding: {
      model: 'nomic-embed-text',
      ollamaUrl: 'http://localhost:11434',
      batchSize: 5,
      concurrency: 2,
      cacheMaxAgeDays: 30,
    },
    ...overrides,
  };
}

export function createMockEmbeddingStatus(
  overrides: Partial<EmbeddingStatus> = {}
): EmbeddingStatus {
  return {
    totalRecords: 150,
    embeddedRecords: 150,
    lastRebuildAt: 1700000000000,
    averageEmbeddingAge: 3.5,
    staleRecords: 0,
    isRebuilding: false,
    ...overrides,
  };
}

export function createMockListeningSessionEntry(
  overrides: Partial<ListeningSessionEntry> = {}
): ListeningSessionEntry {
  return {
    sessionTextProfile: [
      'Recent Artists: Radiohead, Portishead, Massive Attack',
      'Recent Tags: trip-hop, alternative rock, electronic, post-rock',
      'Top Recent Tracks: Everything In Its Right Place, Glory Box, Teardrop',
    ].join('\n'),
    sessionEmbedding: mockEmbeddingBase64,
    createdAt: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    scrobbleWindowHours: 168,
    ...overrides,
  };
}

export function createMockArtistSimilarityEntries(
  artistName = 'Radiohead',
  overrides: Partial<ArtistSimilarityEntry>[] = []
): ArtistSimilarityEntry[] {
  const defaults: ArtistSimilarityEntry[] = [
    {
      artistName,
      similarArtistName: 'Portishead',
      matchScore: 0.85,
      lastFetchedAt: 1700000000000,
    },
    {
      artistName,
      similarArtistName: 'Massive Attack',
      matchScore: 0.78,
      lastFetchedAt: 1700000000000,
    },
    {
      artistName,
      similarArtistName: 'Thom Yorke',
      matchScore: 0.92,
      lastFetchedAt: 1700000000000,
    },
  ];

  return defaults.map((entry, i) => ({
    ...entry,
    ...(overrides[i] ?? {}),
  }));
}

export function createMockRecommendationResult(
  overrides: Partial<RecommendationResult> = {}
): RecommendationResult {
  return {
    release: createMockRelease(),
    score: 0.75,
    explanation:
      "Matches your current listening mood. You haven't played this in a long time.",
    breakdown: {
      cosine: 0.8,
      artistSimilarity: 0.6,
      recency: 0.9,
      diversity: 1.0,
    },
    ...overrides,
  };
}

// Pre-built shared instances (do not mutate these in tests — use the factory functions)
export const mockRecordEmbeddingEntry: RecordEmbeddingEntry =
  createMockRecordEmbeddingEntry();
export const mockDiscogsRelease: DiscogsRelease = createMockRelease();
export const mockRecommendationResult: RecommendationResult =
  createMockRecommendationResult();
export const mockRecommendationSettings: RecommendationSettings =
  createMockRecommendationSettings();
export const mockEmbeddingStatus: EmbeddingStatus = createMockEmbeddingStatus();
export const mockListeningSessionEntry: ListeningSessionEntry =
  createMockListeningSessionEntry();
export const mockArtistSimilarityEntries: ArtistSimilarityEntry[] =
  createMockArtistSimilarityEntries();
