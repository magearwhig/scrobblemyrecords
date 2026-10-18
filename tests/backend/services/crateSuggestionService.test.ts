import { CrateAlbumTableBuilder } from '../../../src/backend/services/crateAlbumTable';
import { validateCrateRules } from '../../../src/backend/services/crateEvaluator';
import { CrateService } from '../../../src/backend/services/crateService';
import {
  CRATE_SUGGESTIONS_FILE,
  CrateSuggestionService,
  EvaluatedCandidate,
  ExistingCrateMembers,
  SUGGESTION_MIN_SIZE,
  eligibleCandidates,
  evaluateCandidate,
  filterCandidates,
  localDay,
  mineCandidates,
  scoreCandidate,
  selectBatch,
  sizeFit,
  templateCandidates,
  toSuggestion,
} from '../../../src/backend/services/crateSuggestionService';
import {
  CrateAlbumTable,
  CrateEvalContext,
  CrateReleaseFacts,
  CrateTableAlbum,
  CrateTableCopy,
} from '../../../src/backend/services/crateTableTypes';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  CrateSort,
  CrateSuggestionRecipe,
  CrateSuggestionRecord,
  CrateSuggestionStore,
} from '../../../src/shared/types';

/** Deep copy (JSON round-trip; fixtures are plain data) */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const DAY = 24 * 60 * 60 * 1000;
const START = new Date(2026, 9, 18, 12, 0, 0); // Oct 18 2026, local noon
const CRATE_SORTS: CrateSort[] = [
  'artist',
  'lastPlayedAsc',
  'scrobblesDesc',
  'scrobblesAsc',
  'dateAddedDesc',
  'runtimeAsc',
];
const BANNED =
  /\b(played|heard|listened|spun|first listen|arrived|bought|purchased|unplayed|vinyl play)\b/i;

// ============================================
// Fixtures
// ============================================

interface Spec {
  id?: number;
  artist?: string;
  title?: string;
  year?: number;
  styles?: string[];
  genres?: string[];
  /** minutes */
  runtime?: number;
  partial?: boolean;
  /** days ago */
  plays?: number[];
  /** days ago */
  added?: number;
  discard?: boolean;
}

interface Built {
  table: CrateAlbumTable;
  facts: Map<number, CrateReleaseFacts>;
}

function build(
  specs: Spec[],
  opts: { hasHistory?: boolean; complete?: boolean; fingerprint?: string } = {}
): Built {
  const facts = new Map<number, CrateReleaseFacts>();
  const albums: CrateTableAlbum[] = specs.map((spec, index) => {
    const id = spec.id ?? index + 1;
    const addedMs = START.getTime() - (spec.added ?? 400) * DAY;
    const artist = spec.artist ?? `Solo ${id}`;
    const title = spec.title ?? `Album ${id}`;
    const copy: CrateTableCopy = {
      releaseId: id,
      artist,
      title,
      year: spec.year,
      format: ['Vinyl'],
      dateAdded: new Date(addedMs).toISOString(),
      dateAddedMs: addedMs,
      copyCount: 1,
      inDiscardPile: spec.discard === true,
      resolvedArtist: artist,
      coverUrl: `https://img.test/${id}.jpg`,
    };
    if (spec.styles || spec.genres || spec.runtime !== undefined) {
      facts.set(id, {
        styles: spec.styles,
        genres: spec.genres,
        runtime:
          spec.runtime !== undefined
            ? {
                knownSeconds: spec.runtime * 60,
                trackCount: 8,
                tracksWithDuration: spec.partial ? 6 : 8,
                complete: !spec.partial,
              }
            : undefined,
      });
    }
    const plays = (spec.plays ?? [])
      .map(d => Math.floor((START.getTime() - d * DAY) / 1000))
      .sort((a, b) => a - b);
    return {
      albumKey: `${artist}|${title}|${id}`.toLowerCase(),
      artist,
      album: title,
      coverUrl: copy.coverUrl,
      copies: [copy],
      firstAddedMs: addedMs,
      latestAddedMs: addedMs,
      listening: {
        scrobbleCount: plays.length,
        lastPlayed: plays.length ? plays[plays.length - 1] : null,
        playTimestamps: plays,
        matchType: plays.length ? 'exact' : 'none',
        matchedKeys: [],
      },
    };
  });
  const ranked = albums
    .filter(a => a.listening.scrobbleCount > 0)
    .sort((a, b) => b.listening.scrobbleCount - a.listening.scrobbleCount);
  ranked.forEach((a, i) => {
    const prev = ranked[i - 1];
    a.scrobbleRank =
      prev && prev.listening.scrobbleCount === a.listening.scrobbleCount
        ? prev.scrobbleRank
        : i + 1;
  });
  const complete = opts.complete ?? true;
  return {
    facts,
    table: {
      albums,
      rankedAlbumCount: ranked.length,
      totalAlbums: albums.length,
      totalReleases: albums.length,
      hasHistory: opts.hasHistory ?? true,
      historyFrom: Math.floor(new Date(2005, 1, 1).getTime() / 1000),
      newestScrobbleAt: START.getTime(),
      lastSyncCompletedAt: START.getTime(),
      collection: {
        complete,
        pagesRead: 1,
        pagesExpected: complete ? 1 : 3,
      },
      fingerprint: opts.fingerprint ?? 'fp-1',
      builtAt: START.getTime(),
    },
  };
}

function ctxOf(built: Built, now = START): CrateEvalContext {
  return {
    table: built.table,
    facts: built.facts,
    resolveArtist: name => name,
    now,
  };
}

const times = <T>(n: number, make: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => make(i));

/** `count` artists with `size` albums each, no year/facts/plays */
function artistShelves(count: number, size = 10, firstId = 1): Spec[] {
  return times(count, a =>
    times(size, i => ({
      id: firstId + a * 100 + i,
      artist: `Artist ${String.fromCharCode(65 + (a % 26))}${a >= 26 ? a : ''}`,
    }))
  ).flat();
}

const keyOfArtist = (letter: string) => `artist:artist ${letter.toLowerCase()}`;

/** Every candidate mined and evaluated */
function pool(built: Built, now = START): EvaluatedCandidate[] {
  const ctx = ctxOf(built, now);
  return mineCandidates(built.table, built.facts, now).map(c =>
    evaluateCandidate(c, ctx)
  );
}

/** A hand-made evaluated candidate for the pure filter/selection tests */
function ev(
  key: string,
  members: string[] | number,
  relevance = 0.5,
  extra: Partial<EvaluatedCandidate> = {}
): EvaluatedCandidate {
  const keys =
    typeof members === 'number' ? times(members, i => `${key}#${i}`) : members;
  return {
    candidateKey: key,
    recipe: (key.split(':')[0] as CrateSuggestionRecipe) ?? 'artist',
    copy: { recipe: 'artist', artist: key },
    rules: [],
    sort: 'artist',
    pool: keys.length,
    count: keys.length,
    memberKeys: new Set(keys),
    sampleCovers: [],
    quietCount: 0,
    hasHistory: true,
    relevance,
    ...extra,
  };
}

const record = (
  candidateKey: string,
  extra: Partial<CrateSuggestionRecord> = {}
): CrateSuggestionRecord => ({
  candidateKey,
  status: 'active',
  daysShown: 1,
  updatedAt: 1,
  ...extra,
});

// ============================================
// Service harness: a real CrateService over a fake table builder
// ============================================

function harness(initial: Built) {
  let current = initial;
  let clock = new Date(START);
  const files = new Map<string, unknown>();
  const fileStorage = {
    readJSON: jest.fn(async (path: string) =>
      files.has(path) ? clone(files.get(path)) : null
    ),
    writeJSONWithBackup: jest.fn(async (path: string, data: unknown) => {
      files.set(path, clone(data));
    }),
  };
  const builder = {
    getTable: jest.fn(async () => current.table),
    getFacts: jest.fn(async (ids: number[]) => {
      const result = new Map<number, CrateReleaseFacts>();
      for (const id of ids) {
        const f = current.facts.get(id);
        if (f) result.set(id, f);
      }
      return result;
    }),
    getResolveArtist: jest.fn(() => (name: string) => name),
    invalidate: jest.fn(),
  };
  const crates = new CrateService(
    fileStorage as unknown as FileStorage,
    builder as unknown as CrateAlbumTableBuilder,
    { getUserSettings: async () => ({ discogs: { username: 'tester' } }) },
    () => clock
  );
  const make = () =>
    new CrateSuggestionService(
      fileStorage as unknown as FileStorage,
      crates,
      () => clock
    );
  const service = make();
  crates.setSuggestionHook(service);
  return {
    service,
    crates,
    files,
    fileStorage,
    builder,
    make,
    setData: (built: Built) => {
      current = built;
    },
    advanceDays: (days: number) => {
      clock = new Date(clock.getTime() + days * DAY);
    },
    advanceHours: (hours: number) => {
      clock = new Date(clock.getTime() + hours * 60 * 60 * 1000);
    },
    today: () => localDay(clock),
    store: () => files.get(CRATE_SUGGESTIONS_FILE) as CrateSuggestionStore,
    writes: () =>
      fileStorage.writeJSONWithBackup.mock.calls.filter(
        ([path]) => path === CRATE_SUGGESTIONS_FILE
      ).length,
  };
}

const keysOf = (response: { suggestions: { candidateKey: string }[] }) =>
  response.suggestions.map(s => s.candidateKey);

// ============================================
// Mining
// ============================================

/** A collection on which every recipe mines at least one candidate */
function richCollection(): Spec[] {
  return [
    // 10 Post-Punk albums from the 1980s, 4 scrobbled recently
    ...times(10, i => ({
      id: 100 + i,
      artist: `PP ${i}`,
      styles: ['Post-Punk'],
      genres: ['Rock'],
      year: 1980 + i,
      plays: i < 4 ? [10, 20, 30, 40, 50, 60] : [],
    })),
    // The Wedding Present: 6 albums from the 1990s, 2 quiet
    ...times(6, i => ({
      id: 200 + i,
      artist: 'The Wedding Present',
      year: 1990 + i,
      plays: i < 4 ? [5, 6, 7, 8, 9] : [800],
    })),
    // Top albums gone quiet: many scrobbles, none for 2+ years
    ...times(6, i => ({
      id: 300 + i,
      artist: `Top ${i}`,
      plays: times(30, j => 800 + j),
    })),
    // Added to Discogs recently, no scrobbles since
    ...times(6, i => ({ id: 400 + i, artist: `New ${i}`, added: 30 + i })),
    // Short jazz records
    ...times(7, i => ({
      id: 500 + i,
      artist: `Jazz ${i}`,
      genres: ['Jazz'],
      runtime: 30 + i,
    })),
    // Filler so the top 20% is a real subset
    ...times(20, i => ({ id: 600 + i, artist: `Filler ${i}`, plays: [400] })),
  ];
}

describe('mineCandidates', () => {
  it('mines every recipe from a fixture collection', () => {
    const built = build(richCollection());
    const keys = mineCandidates(built.table, built.facts, START).map(
      c => c.candidateKey
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        'style-quiet:post-punk',
        'artist:the wedding present',
        'decade-quiet:1980',
        'decade-quiet:1990',
        'top-quiet:365',
        'top-quiet:730',
        'added-quiet:90',
        'added-quiet:180',
        'short:jazz:40',
      ])
    );
  });

  it('maps exactly: every candidate is a valid crate with the same members once saved', async () => {
    const built = build(richCollection());
    const h = harness(built);
    const ctx = await h.crates.getContext([{ rules: [], sort: 'runtimeAsc' }]);
    const candidates = mineCandidates(ctx.table, ctx.facts, ctx.now)
      .concat(templateCandidates())
      .map(c => evaluateCandidate(c, ctx));
    const recipes = new Set(candidates.map(c => c.recipe));
    expect(recipes).toEqual(
      new Set([
        'style-quiet',
        'artist',
        'decade-quiet',
        'top-quiet',
        'added-quiet',
        'short',
        'template',
      ])
    );

    for (const candidate of candidates) {
      expect(validateCrateRules(candidate.rules)).toEqual([]);
      expect(CRATE_SORTS).toContain(candidate.sort);
      const suggestion = toSuggestion(candidate);
      const crate = await h.crates.createCrate({
        name: suggestion.name,
        description: suggestion.description,
        rules: suggestion.rules,
        sort: suggestion.sort,
      });
      const { evaluation } = await h.crates.evaluate(crate.id);
      expect(evaluation.albums.length).toBe(suggestion.count);
      expect(new Set(evaluation.albums.map(a => a.albumKey))).toEqual(
        candidate.memberKeys
      );
    }
  });

  it('skips listening recipes without a history index but keeps artist and short', () => {
    const built = build(richCollection(), { hasHistory: false });
    const recipes = new Set(
      mineCandidates(built.table, built.facts, START).map(c => c.recipe)
    );
    expect(recipes).toEqual(new Set(['artist', 'short']));
  });

  it('applies the artist and style prefilter thresholds', () => {
    const four = build(times(4, () => ({ artist: 'Four' })));
    expect(mineCandidates(four.table, four.facts, START)).toEqual([]);

    const five = build(times(5, () => ({ artist: 'Five' })));
    expect(
      mineCandidates(five.table, five.facts, START).map(c => c.candidateKey)
    ).toEqual(['artist:five']);

    const seven = build(times(7, () => ({ styles: ['Dub'] })));
    expect(
      mineCandidates(seven.table, seven.facts, START).filter(
        c => c.recipe === 'style-quiet'
      )
    ).toEqual([]);
    const eight = build(times(8, () => ({ styles: ['Dub'] })));
    expect(
      mineCandidates(eight.table, eight.facts, START).map(c => c.candidateKey)
    ).toContain('style-quiet:dub');
  });

  it('never yields a candidate whose prefilter count is below the size minimum', () => {
    const built = build(richCollection());
    for (const candidate of mineCandidates(built.table, built.facts, START)) {
      expect(candidate.pool).toBeGreaterThanOrEqual(SUGGESTION_MIN_SIZE);
    }
  });

  it('does not count discard-pile copies in prefilters', () => {
    const built = build([
      ...times(4, () => ({ artist: 'Half' })),
      { artist: 'Half', discard: true },
    ]);
    expect(mineCandidates(built.table, built.facts, START)).toEqual([]);
  });

  it('caps each recipe at 8 candidates, largest first', () => {
    const specs = times(10, a =>
      times(5 + a, () => ({ artist: `Cap ${a}` }))
    ).flat();
    const built = build(specs, { hasHistory: false });
    const keys = mineCandidates(built.table, built.facts, START).map(
      c => c.candidateKey
    );
    expect(keys).toHaveLength(8);
    expect(keys[0]).toBe('artist:cap 9');
    expect(keys).not.toContain('artist:cap 0');
    expect(keys).not.toContain('artist:cap 1');
  });

  it('only counts known runtimes of at most 40 minutes for short records', () => {
    const built = build([
      ...times(4, () => ({ genres: ['Jazz'], runtime: 35 })),
      { genres: ['Jazz'], runtime: 35, partial: true },
      { genres: ['Jazz'], runtime: 50 },
    ]);
    expect(
      mineCandidates(built.table, built.facts, START).filter(
        c => c.recipe === 'short'
      )
    ).toEqual([]);
  });

  it('keeps slashes out of candidate keys', () => {
    const built = build(times(5, () => ({ artist: 'AC/DC' })));
    const [candidate] = mineCandidates(built.table, built.facts, START);
    expect(candidate.candidateKey).toBe('artist:ac dc');
    expect(candidate.candidateKey).toMatch(/^[a-z-]+:[^/]{1,120}$/);
  });

  it('renders reviewed copy only', () => {
    const built = build(richCollection());
    for (const candidate of pool(built).concat(
      templateCandidates().map(c => evaluateCandidate(c, ctxOf(built)))
    )) {
      const s = toSuggestion(candidate);
      for (const text of [s.name, s.description, s.reason]) {
        expect(text).not.toMatch(BANNED);
      }
      if (candidate.recipe !== 'short' && candidate.recipe !== 'template') {
        expect(s.reason).toMatch(/scrobble/);
      }
    }
  });

  it('says only what is owned for an artist shelf without history', () => {
    const built = build(
      times(6, () => ({ artist: 'Plain' })),
      {
        hasHistory: false,
      }
    );
    const [candidate] = pool(built);
    expect(toSuggestion(candidate).reason).toBe('You own 6 albums by Plain.');
  });
});

// ============================================
// Scoring
// ============================================

describe('scoring', () => {
  it('sizeFit follows the plan curve', () => {
    expect(sizeFit(5)).toBe(0.5);
    expect(sizeFit(10)).toBe(1);
    expect(sizeFit(30)).toBe(1);
    expect(sizeFit(45)).toBe(0.75);
    expect(sizeFit(60)).toBe(0.5);
  });

  const round = (n: number) => Number(n.toFixed(2));

  it('matches the worked examples of section 10.3 to two decimals', () => {
    expect(
      round(
        scoreCandidate({
          recipe: 'style-quiet',
          count: 15,
          pool: 23,
          quietCount: 15,
          hasHistory: true,
        })
      )
    ).toBe(0.83);
    expect(
      round(
        scoreCandidate({
          recipe: 'artist',
          count: 12,
          pool: 12,
          quietCount: 4,
          hasHistory: true,
        })
      )
    ).toBe(0.67);
    expect(
      round(
        scoreCandidate({
          recipe: 'added-quiet',
          count: 5,
          pool: 6,
          quietCount: 5,
          hasHistory: true,
        })
      )
    ).toBe(0.67);
    expect(round(sizeFit(52))).toBe(0.63);
    expect(
      round(
        scoreCandidate({
          recipe: 'decade-quiet',
          count: 52,
          pool: 140,
          quietCount: 52,
          hasHistory: true,
        })
      )
    ).toBe(0.5);
  });

  it('gives templates a fixed signal of 0.5', () => {
    expect(
      scoreCandidate({
        recipe: 'template',
        count: 20,
        pool: 0,
        quietCount: 0,
        hasHistory: true,
      })
    ).toBe(0.75);
  });

  it('style-quiet signal is below 1 when part of the style was scrobbled', () => {
    const built = build(richCollection());
    const style = pool(built).find(
      c => c.candidateKey === 'style-quiet:post-punk'
    )!;
    expect(style.count).toBe(6);
    expect(style.pool).toBe(10);
    // 0.5 × sizeFit(6) + 0.5 × 6/10
    expect(style.relevance).toBeCloseTo(0.5 * 0.6 + 0.5 * 0.6, 5);
    expect(toSuggestion(style).reason).toBe(
      'You own 10 Post-Punk albums. 6 have no scrobbles recorded in the last 12 months.'
    );
  });

  it('artist signal counts members with no scrobbles in 365 days', () => {
    const built = build(richCollection());
    const artist = pool(built).find(
      c => c.candidateKey === 'artist:the wedding present'
    )!;
    expect(artist.count).toBe(6);
    expect(artist.quietCount).toBe(2);
    expect(toSuggestion(artist).reason).toBe(
      'You own 6 albums by The Wedding Present. 2 have no scrobbles recorded in the last 12 months.'
    );
  });
});

// ============================================
// Filters
// ============================================

describe('filterCandidates', () => {
  const crate = (
    memberKeys: string[],
    extra: Partial<ExistingCrateMembers['crate']> = {}
  ): ExistingCrateMembers => ({
    crate: { id: 'c1', ...extra },
    memberKeys: new Set(memberKeys),
  });

  it('enforces size bounds', () => {
    const kept = filterCandidates(
      [
        ev('artist:a', 4),
        ev('artist:b', 5),
        ev('artist:c', 60),
        ev('artist:d', 61),
      ],
      [],
      []
    ).map(c => c.candidateKey);
    expect(kept.sort()).toEqual(['artist:b', 'artist:c']);
  });

  it('drops dismissed and added tombstones but not active records', () => {
    const kept = filterCandidates(
      [ev('artist:a', 10), ev('artist:b', 10), ev('artist:c', 10)],
      [],
      [
        record('artist:a', { status: 'dismissed' }),
        record('artist:b', { status: 'added' }),
        record('artist:c'),
      ]
    ).map(c => c.candidateKey);
    expect(kept).toEqual(['artist:c']);
  });

  it('drops a candidate already used by a crate or whose template is a crate', () => {
    const kept = filterCandidates(
      [
        ev('artist:a', 10),
        ev('template:dusty-shelf', 10, 0.5, { templateId: 'dusty-shelf' }),
        ev('artist:c', 10),
      ],
      [
        crate([], { sourceSuggestionKey: 'artist:a' }),
        crate([], { templateId: 'dusty-shelf' }),
      ],
      []
    ).map(c => c.candidateKey);
    expect(kept).toEqual(['artist:c']);
  });

  it('drops a candidate overlapping an existing crate by 0.7 or more', () => {
    const members = times(10, i => `m${i}`);
    // 7 shared of 10 + 10 - 7 = 13 → 0.54; 9 shared of 11 → 0.82
    const kept = filterCandidates(
      [
        ev('artist:low', [...members.slice(0, 7), 'x1', 'x2', 'x3']),
        ev('artist:high', members.slice(0, 9)),
      ],
      [crate(members)],
      []
    ).map(c => c.candidateKey);
    expect(kept).toEqual(['artist:low']);
  });

  it('collapses near-duplicates to the higher relevance, then the lower key', () => {
    const members = times(10, i => `m${i}`);
    expect(
      filterCandidates(
        [
          ev('added-quiet:90', members, 0.6),
          ev('added-quiet:180', members, 0.7),
        ],
        [],
        []
      ).map(c => c.candidateKey)
    ).toEqual(['added-quiet:180']);
    expect(
      filterCandidates(
        [
          ev('added-quiet:90', members, 0.7),
          ev('added-quiet:180', members, 0.7),
        ],
        [],
        []
      ).map(c => c.candidateKey)
    ).toEqual(['added-quiet:180']);
  });

  it('does not let a tombstoned candidate suppress its near-duplicate', () => {
    const members = times(10, i => `m${i}`);
    expect(
      filterCandidates(
        [
          ev('added-quiet:90', members, 0.6),
          ev('added-quiet:180', members, 0.7),
        ],
        [],
        [record('added-quiet:180', { status: 'dismissed' })]
      ).map(c => c.candidateKey)
    ).toEqual(['added-quiet:90']);
  });
});

describe('fallback templates', () => {
  /** Distinct artists, no plays: only the dusty-shelf template fits */
  const dusty = (n: number) => build(times(n, () => ({})));
  const evaluated = (built: Built) => ({
    mined: pool(built),
    templates: templateCandidates().map(c =>
      evaluateCandidate(c, ctxOf(built))
    ),
  });

  it('join only when fewer than 3 mined candidates survive', () => {
    const many = build(artistShelves(3), { hasHistory: true });
    const { mined, templates } = evaluated(many);
    const keys = eligibleCandidates(mined, templates, [], []).map(
      c => c.candidateKey
    );
    expect(keys.every(k => !k.startsWith('template:'))).toBe(true);

    const few = dusty(6);
    const f = evaluated(few);
    expect(f.mined).toEqual([]);
    expect(
      eligibleCandidates(f.mined, f.templates, [], []).map(c => c.candidateKey)
    ).toEqual(['template:dusty-shelf']);
  });

  it('pass through the same filters', () => {
    const { mined, templates } = evaluated(dusty(6));
    const members = templates.find(
      t => t.templateId === 'dusty-shelf'
    )!.memberKeys;
    expect(
      eligibleCandidates(
        mined,
        templates,
        [
          {
            crate: { id: 'c', templateId: 'dusty-shelf' },
            memberKeys: new Set(),
          },
        ],
        []
      )
    ).toEqual([]);
    expect(
      eligibleCandidates(
        mined,
        templates,
        [],
        [record('template:dusty-shelf', { status: 'dismissed' })]
      )
    ).toEqual([]);
    expect(
      eligibleCandidates(
        mined,
        templates,
        [{ crate: { id: 'c' }, memberKeys: members }],
        []
      )
    ).toEqual([]);
    const small = evaluated(dusty(4));
    expect(eligibleCandidates(small.mined, small.templates, [], [])).toEqual(
      []
    );
  });

  it('respond with noCandidates when nothing is eligible', async () => {
    const h = harness(dusty(4));
    await expect(h.service.getSuggestions()).resolves.toEqual({
      suggestions: [],
      exhausted: false,
      reason: 'noCandidates',
    });
  });

  it('are served when they are all there is', async () => {
    const h = harness(dusty(6));
    const response = await h.service.getSuggestions();
    expect(keysOf(response)).toEqual(['template:dusty-shelf']);
    expect(response.suggestions[0]).toMatchObject({
      recipe: 'template',
      name: 'Dusty shelf',
      count: 6,
      reason: '6 of your albums match this starter crate.',
    });
  });
});

// ============================================
// Selection and rotation
// ============================================

describe('selectBatch', () => {
  it('fills tier by tier: never shown first, then least recently shown', () => {
    const eligible = [
      ev('artist:a', 10, 0.9),
      ev('artist:b', 10, 0.8),
      ev('artist:c', 10, 0.1),
      ev('artist:d', 10, 0.2),
    ];
    const records = [
      record('artist:a', { lastShownDay: '2026-10-10' }),
      record('artist:b', { lastShownDay: '2026-10-01' }),
    ];
    expect(
      selectBatch(eligible, records, {
        batchSize: 3,
        exclude: [],
        allowExcludedFallback: false,
      }).map(c => c.candidateKey)
    ).toEqual(['artist:d', 'artist:c', 'artist:b']);
  });

  it('prefers a new recipe and low overlap inside a tier, never across tiers', () => {
    const shared = times(10, i => `s${i}`);
    const eligible = [
      ev('artist:a', shared, 0.9),
      ev('artist:b', 10, 0.8),
      ev('style-quiet:c', shared, 0.7),
      ev('short:d:40', 10, 0.6),
      ev('decade-quiet:1990', 10, 0.95),
    ];
    const records = [
      record('decade-quiet:1990', { lastShownDay: '2026-10-01' }),
    ];
    expect(
      selectBatch(eligible, records, {
        batchSize: 3,
        exclude: [],
        allowExcludedFallback: false,
      }).map(c => c.candidateKey)
    ).toEqual(['artist:a', 'short:d:40', 'artist:b']);
  });

  it('shrinks instead of refilling from the excluded set, except the daily fallback', () => {
    const eligible = [ev('artist:a', 10), ev('artist:b', 10)];
    expect(
      selectBatch(eligible, [], {
        batchSize: 3,
        exclude: ['artist:a'],
        allowExcludedFallback: true,
      }).map(c => c.candidateKey)
    ).toEqual(['artist:b']);
    expect(
      selectBatch(eligible, [], {
        batchSize: 3,
        exclude: ['artist:a', 'artist:b'],
        allowExcludedFallback: false,
      })
    ).toEqual([]);
    expect(
      selectBatch(eligible, [], {
        batchSize: 3,
        exclude: ['artist:a', 'artist:b'],
        allowExcludedFallback: true,
      }).map(c => c.candidateKey)
    ).toEqual(['artist:a', 'artist:b']);
  });

  /** Daily batches with no user action, the way the service builds them */
  function simulate(n: number, days: number): string[][] {
    const eligible = times(n, i =>
      ev(`artist:${String(i).padStart(2, '0')}`, 10)
    );
    const records = new Map<string, CrateSuggestionRecord>();
    let previous: string[] = [];
    const batches: string[][] = [];
    for (let d = 0; d < days; d++) {
      const day = localDay(new Date(START.getTime() + d * DAY));
      const keys = selectBatch(eligible, [...records.values()], {
        batchSize: 3,
        exclude: previous,
        allowExcludedFallback: true,
      }).map(c => c.candidateKey);
      for (const key of keys)
        records.set(key, record(key, { lastShownDay: day }));
      previous = keys;
      batches.push(keys);
    }
    return batches;
  }

  it('rotates 21 candidates with no repeat within 7 days', () => {
    const batches = simulate(21, 8);
    const firstWeek = batches.slice(0, 7).flat();
    expect(new Set(firstWeek).size).toBe(21);
    expect(batches[7]).toEqual(batches[0]);
  });

  it('alternates two sets with 6, shrinks 3/1/3 with 4, repeats with 2', () => {
    const six = simulate(6, 7);
    expect(six[0]).toEqual(six[2]);
    expect(six[1]).toEqual(six[3]);
    expect(new Set([...six[0], ...six[1]]).size).toBe(6);
    expect(simulate(4, 5).map(b => b.length)).toEqual([3, 1, 3, 1, 3]);
    const two = simulate(2, 3);
    expect(two).toEqual([two[0], two[0], two[0]]);
    expect(two[0]).toHaveLength(2);
  });
});

describe('CrateSuggestionService rotation over 7 simulated days', () => {
  async function run(artists: number, days = 7) {
    const h = harness(build(artistShelves(artists), { hasHistory: false }));
    const batches: string[][] = [];
    for (let d = 0; d < days; d++) {
      batches.push(keysOf(await h.service.getSuggestions()));
      h.advanceDays(1);
    }
    return { h, batches };
  }

  it('6 candidates: consecutive days share nothing; two sets alternate', async () => {
    const { h, batches } = await run(6);
    for (let d = 1; d < batches.length; d++) {
      expect(batches[d].filter(k => batches[d - 1].includes(k))).toEqual([]);
    }
    expect(batches[0]).toHaveLength(3);
    expect(new Set([...batches[0], ...batches[1]]).size).toBe(6);
    for (let d = 2; d < batches.length; d++) {
      expect(batches[d]).toEqual(batches[d - 2]);
    }
    const records = h.store().records;
    expect(records).toHaveLength(6);
    // Days 1, 3, 5, 7 for the first set
    expect(records.find(r => r.candidateKey === batches[0][0])!.daysShown).toBe(
      4
    );
  });

  it('4 candidates: batches of 3, 1, 3', async () => {
    const { batches } = await run(4, 3);
    expect(batches.map(b => b.length)).toEqual([3, 1, 3]);
  });

  it('2 candidates: the same 2 every day', async () => {
    const { batches } = await run(2, 3);
    expect(batches[0]).toEqual([keyOfArtist('A'), keyOfArtist('B')]);
    expect(batches).toEqual([batches[0], batches[0], batches[0]]);
  });
});

// ============================================
// Same day, reroll, revalidation
// ============================================

describe('CrateSuggestionService same day', () => {
  it('serves the same batch to repeated reads, a new instance and limit=1, recording one impression', async () => {
    const h = harness(build(artistShelves(6), { hasHistory: false }));
    const first = await h.service.getSuggestions();
    expect(first.suggestions).toHaveLength(3);
    expect(first.exhausted).toBe(false);
    expect(h.writes()).toBe(1);
    const recordsAfterFirst = clone(h.store().records);

    expect(await h.service.getSuggestions()).toEqual(first);
    const restarted = h.make();
    expect(await restarted.getSuggestions()).toEqual(first);
    const one = await restarted.getSuggestions(1);
    expect(one.suggestions).toEqual([first.suggestions[0]]);

    expect(h.writes()).toBe(1);
    expect(h.store().records).toEqual(recordsAfterFirst);
    for (const r of h.store().records) {
      expect(r).toMatchObject({ daysShown: 1, lastShownDay: h.today() });
    }
  });

  it('limit=1 on a fresh day builds the full batch and returns its first card', async () => {
    const h = harness(build(artistShelves(6), { hasHistory: false }));
    const one = await h.service.getSuggestions(1);
    expect(one.suggestions).toHaveLength(1);
    expect(h.store().batch!.keys).toHaveLength(3);
    const three = await h.service.getSuggestions();
    expect(three.suggestions[0]).toEqual(one.suggestions[0]);
  });

  it('builds the batch once when two first requests of a day arrive together', async () => {
    const h = harness(build(artistShelves(6), { hasHistory: false }));
    const [a, b] = await Promise.all([
      h.service.getSuggestions(),
      h.service.getSuggestions(),
    ]);
    expect(a).toEqual(b);
    expect(h.writes()).toBe(1);
  });

  it('returns collectionLoading and writes nothing while the snapshot is incomplete', async () => {
    const h = harness(
      build(artistShelves(6), { hasHistory: false, complete: false })
    );
    await expect(h.service.getSuggestions()).resolves.toEqual({
      suggestions: [],
      exhausted: false,
      reason: 'collectionLoading',
    });
    await expect(h.service.reroll()).resolves.toMatchObject({
      reason: 'collectionLoading',
    });
    expect(h.writes()).toBe(0);
    expect(h.builder.getFacts).not.toHaveBeenCalled();
  });
});

describe('CrateSuggestionService reroll', () => {
  it('shares nothing with anything shown today, shrinks, then reports exhausted', async () => {
    const h = harness(build(artistShelves(7), { hasHistory: false }));
    const day = keysOf(await h.service.getSuggestions());
    const second = keysOf(await h.service.reroll());
    expect(second).toHaveLength(3);
    expect(second.filter(k => day.includes(k))).toEqual([]);
    const third = keysOf(await h.service.reroll());
    expect(third).toHaveLength(1);
    expect(third.filter(k => [...day, ...second].includes(k))).toEqual([]);

    const writesBefore = h.writes();
    await expect(h.service.reroll()).resolves.toEqual({
      suggestions: [],
      exhausted: true,
    });
    expect(h.writes()).toBe(writesBefore);

    // A reload shows the last rerolled batch
    expect(keysOf(await h.make().getSuggestions())).toEqual(third);
    expect(h.store().batch!.shownToday).toHaveLength(7);
  });

  it('does not use up a backfill the client never saw', async () => {
    const h = harness(build(artistShelves(4), { hasHistory: false }));
    const [first] = (await h.service.getSuggestions()).suggestions;
    await h.crates.createCrate({
      name: first.name,
      rules: first.rules,
      sort: first.sort,
      sourceSuggestionKey: first.candidateKey,
    });
    const rerolled = await h.service.reroll();
    expect(keysOf(rerolled)).toEqual([keyOfArtist('D')]);
    expect(rerolled.exhausted).toBe(false);
  });

  it('serves the new day’s batch when a reroll is the first request of a day', async () => {
    const h = harness(build(artistShelves(1), { hasHistory: false }));
    const rerolled = await h.service.reroll();
    expect(keysOf(rerolled)).toEqual([keyOfArtist('A')]);
    expect(rerolled.exhausted).toBe(false);
    expect(h.store().batch!.shownToday).toEqual([keyOfArtist('A')]);
  });

  it('next day starts from the rerolled batch as the previous batch', async () => {
    const h = harness(build(artistShelves(9), { hasHistory: false }));
    await h.service.getSuggestions();
    const rerolled = keysOf(await h.service.reroll());
    h.advanceDays(1);
    const next = keysOf(await h.service.getSuggestions());
    expect(h.store().batch!.previousKeys).toEqual(rerolled);
    expect(next.filter(k => rerolled.includes(k))).toEqual([]);
  });
});

describe('CrateSuggestionService revalidation', () => {
  it('dismiss tombstones the key and backfills from candidates not shown today', async () => {
    const h = harness(build(artistShelves(6), { hasHistory: false }));
    const day = keysOf(await h.service.getSuggestions());
    const response = await h.service.dismiss(day[1]);
    const keys = keysOf(response);
    expect(keys).toHaveLength(3);
    expect(keys.slice(0, 2)).toEqual([day[0], day[2]]);
    expect(day).not.toContain(keys[2]);
    expect(
      h.store().records.find(r => r.candidateKey === day[1])
    ).toMatchObject({ status: 'dismissed', dismissedAt: START.getTime() });
    expect(h.store().batch!.shownToday).toContain(keys[2]);
  });

  it('drops an added suggestion on the next read and backfills', async () => {
    const h = harness(build(artistShelves(6), { hasHistory: false }));
    const [first] = (await h.service.getSuggestions()).suggestions;
    const crate = await h.crates.createCrate({
      name: first.name,
      rules: first.rules,
      sort: first.sort,
      sourceSuggestionKey: first.candidateKey,
    });
    expect(
      h.store().records.find(r => r.candidateKey === first.candidateKey)
    ).toMatchObject({ status: 'added', addedCrateId: crate.id });
    const keys = keysOf(await h.service.getSuggestions());
    expect(keys).toHaveLength(3);
    expect(keys).not.toContain(first.candidateKey);
  });

  it('drops a suggestion that a hand-made crate overlaps by 0.7 or more', async () => {
    const h = harness(build(artistShelves(6), { hasHistory: false }));
    const [first] = (await h.service.getSuggestions()).suggestions;
    await h.crates.createCrate({ name: 'Mine', rules: first.rules });
    const keys = keysOf(await h.service.getSuggestions());
    expect(keys).toHaveLength(3);
    expect(keys).not.toContain(first.candidateKey);
  });

  it('re-evaluates time-relative rules on every read of the day', async () => {
    const h = harness(
      build([
        // Added 180 days minus 5 hours ago: inside the window until 17:00
        ...times(5, i => ({ id: 1 + i, added: 180 - 5 / 24 })),
        ...times(6, i => ({ id: 100 + i })),
      ])
    );
    const before = await h.service.getSuggestions();
    expect(
      before.suggestions.find(s => s.candidateKey === 'added-quiet:180')?.count
    ).toBe(5);
    h.advanceHours(6); // 18:00, same local day
    const after = await h.service.getSuggestions();
    expect(keysOf(after)).not.toContain('added-quiet:180');
  });

  it('drops a candidate that shrank below 5 and keeps counts live', async () => {
    const specs = artistShelves(6);
    const h = harness(build(specs, { hasHistory: false }));
    const day = await h.service.getSuggestions();
    const [a, b] = day.suggestions;
    expect(b.count).toBe(10);

    const letterOf = (key: string) => key.slice(-1).toUpperCase();
    const shrunk = specs.filter(s => {
      const letter = s.artist!.slice(-1);
      const index = (s.id! - 1) % 100;
      if (letter === letterOf(a.candidateKey)) return index < 4;
      if (letter === letterOf(b.candidateKey)) return index < 8;
      return true;
    });
    h.setData(build(shrunk, { hasHistory: false, fingerprint: 'fp-2' }));
    const after = await h.service.getSuggestions();
    const keys = keysOf(after);
    expect(keys).not.toContain(a.candidateKey);
    expect(keys).toHaveLength(3);
    expect(
      after.suggestions.find(s => s.candidateKey === b.candidateKey)!.count
    ).toBe(8);
  });
});

// ============================================
// Lifecycle
// ============================================

describe('CrateSuggestionService lifecycle', () => {
  it('keeps dismissed and added suggestions out for 1,000 days and after the crate is deleted, until reset', async () => {
    const h = harness(build(artistShelves(5), { hasHistory: false }));
    const dismissed = keyOfArtist('A');
    const added = keyOfArtist('B');
    await h.service.dismiss(dismissed);
    const suggestion = (await h.service.getSuggestions()).suggestions.find(
      s => s.candidateKey !== dismissed
    )!;
    expect(suggestion.candidateKey).toBe(added);
    const crate = await h.crates.createCrate({
      name: suggestion.name,
      rules: suggestion.rules,
      sort: suggestion.sort,
      sourceSuggestionKey: added,
    });
    await h.crates.deleteCrate(crate.id);

    for (let d = 0; d < 1000; d++) {
      h.advanceDays(1);
      const keys = keysOf(await h.service.getSuggestions());
      expect(keys).not.toContain(dismissed);
      expect(keys).not.toContain(added);
    }
    const statuses = Object.fromEntries(
      h.store().records.map(r => [r.candidateKey, r.status])
    );
    expect(statuses[dismissed]).toBe('dismissed');
    expect(statuses[added]).toBe('added');

    const reset = keysOf(await h.service.resetHistory());
    expect(reset).toEqual([dismissed, added, keyOfArtist('C')]);
    expect(h.store().records.every(r => r.status === 'active')).toBe(true);
  });

  it('prunes active records unseen for over 365 days but never tombstones', async () => {
    const h = harness(build(artistShelves(3), { hasHistory: false }));
    h.files.set(CRATE_SUGGESTIONS_FILE, {
      schemaVersion: 1,
      records: [
        record('artist:gone', { lastShownDay: '2025-10-17' }),
        record('artist:recent', { lastShownDay: '2025-10-18' }),
        record('artist:old', {
          status: 'dismissed',
          lastShownDay: '2023-01-01',
          dismissedAt: 1,
        }),
      ],
    } satisfies CrateSuggestionStore);
    await h.service.getSuggestions();
    const keys = h.store().records.map(r => r.candidateKey);
    expect(keys).not.toContain('artist:gone');
    expect(keys).toEqual(
      expect.arrayContaining(['artist:recent', 'artist:old'])
    );
  });

  it('a pruned candidate counts as never shown again', async () => {
    const h = harness(build(artistShelves(4), { hasHistory: false }));
    h.files.set(CRATE_SUGGESTIONS_FILE, {
      schemaVersion: 1,
      records: [
        record(keyOfArtist('A'), { lastShownDay: '2025-01-01' }),
        record(keyOfArtist('B'), { lastShownDay: '2026-10-01' }),
        record(keyOfArtist('C'), { lastShownDay: '2026-10-02' }),
        record(keyOfArtist('D'), { lastShownDay: '2026-10-03' }),
      ],
    } satisfies CrateSuggestionStore);
    const keys = keysOf(await h.service.getSuggestions());
    expect(keys[0]).toBe(keyOfArtist('A'));
  });

  it('reload drops the cached store', async () => {
    const h = harness(build(artistShelves(6), { hasHistory: false }));
    await h.service.getSuggestions();
    h.files.set(CRATE_SUGGESTIONS_FILE, {
      schemaVersion: 1,
      records: [record(keyOfArtist('A'), { status: 'dismissed' })],
    } satisfies CrateSuggestionStore);
    await h.service.reload();
    const keys = keysOf(await h.service.getSuggestions());
    expect(keys).not.toContain(keyOfArtist('A'));
    expect(keys).toHaveLength(3);
  });
});
