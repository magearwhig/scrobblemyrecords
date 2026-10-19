import {
  Crate,
  CrateAlbumResult,
  CrateCoverage,
  CrateEvaluation,
  CrateRule,
  CrateSummary,
} from '../../../../src/shared/types';

export const RULES: CrateRule[] = [
  { id: 'fmt', field: 'format', op: 'anyOf', values: ['Vinyl'] },
  { id: 'genre', field: 'genre', op: 'anyOf', values: ['Jazz'] },
  {
    id: 'runtime',
    field: 'runtime',
    op: 'atMost',
    minutes: 40,
    ifUnknown: 'exclude',
  },
];

export function makeAlbum(
  overrides: Partial<CrateAlbumResult> = {}
): CrateAlbumResult {
  return {
    albumKey: 'miles davis::kind of blue',
    artist: 'Miles Davis',
    album: 'Kind of Blue',
    coverUrl: 'https://example.com/kob.jpg',
    copies: [
      {
        releaseId: 101,
        title: 'Kind of Blue',
        artist: 'Miles Davis',
        year: 2015,
        format: ['Vinyl'],
        dateAdded: '2024-03-01T10:00:00-08:00',
        copyCount: 1,
      },
    ],
    witnessReleaseId: 101,
    membership: 'rules',
    listening: {
      scrobbleCount: 42,
      lastPlayed: 1_700_000_000,
      matchType: 'exact',
      matchedKeys: [],
    },
    runtimeSeconds: 2292,
    results: [
      {
        ruleId: 'fmt',
        outcome: 'match',
        evidence: { releaseId: 101 },
      },
      {
        ruleId: 'genre',
        outcome: 'match',
        evidence: { releaseId: 101, value: ['Jazz'] },
      },
      {
        ruleId: 'runtime',
        outcome: 'match',
        evidence: {
          releaseId: 101,
          knownSeconds: 2292,
          tracksWithDuration: 5,
          trackCount: 5,
        },
      },
    ],
    ...overrides,
  };
}

export function makeCoverage(
  overrides: Partial<CrateCoverage> = {}
): CrateCoverage {
  return {
    totalAlbums: 1150,
    totalReleases: 1200,
    historyFrom: 1_107_000_000,
    newestScrobbleAt: Date.now() - 3_600_000,
    lastSyncCompletedAt: Date.now() - 3_600_000,
    hasHistory: true,
    collection: { complete: true, pagesRead: 12, pagesExpected: 12 },
    runtimeKnownAlbums: 812,
    genreKnownAlbums: 1020,
    ratedAlbums: 0,
    ...overrides,
  };
}

export function makeEvaluation(
  overrides: Partial<CrateEvaluation> = {}
): CrateEvaluation {
  return {
    crateId: null,
    evaluatedAt: Date.now(),
    albums: [makeAlbum()],
    excluded: [],
    unknownOnly: [],
    unknownOnlyAlbums: 0,
    staleOverrides: [],
    coverage: makeCoverage(),
    ...overrides,
  };
}

export function makeCrate(overrides: Partial<Crate> = {}): Crate {
  return {
    id: 'crate-1',
    name: 'Jazz in 40 minutes',
    description: 'Short jazz records',
    rules: RULES,
    overrides: [],
    sort: 'runtimeAsc',
    pinnedToWhatToPlay: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

export function makeSummary(
  overrides: Partial<CrateSummary> = {}
): CrateSummary {
  return {
    id: 'crate-1',
    name: 'Jazz in 40 minutes',
    description: 'Short jazz records',
    pinnedToWhatToPlay: false,
    count: 9,
    unknownCount: 0,
    staleOverrideCount: 0,
    sampleCovers: ['https://example.com/a.jpg'],
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}
