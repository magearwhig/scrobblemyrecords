/**
 * Smart Crates benchmark on a synthetic 10k-album table built in memory (no
 * disk). Bounds are about 3× the plan's section 7.3 targets scaled linearly
 * from 1.2k to 10k albums, so they catch order-of-magnitude regressions
 * without flaking. Measured times are logged.
 */
import { performance } from 'perf_hooks';

import { evaluateCrate } from '../../../src/backend/services/crateEvaluator';
import {
  evaluateCandidate,
  filterCandidates,
  mineCandidates,
  selectBatch,
  SUGGESTION_TOTAL_CAP,
  templateCandidates,
} from '../../../src/backend/services/crateSuggestionService';
import {
  CrateAlbumTable,
  CrateEvalContext,
  CrateReleaseFacts,
  CrateTableAlbum,
} from '../../../src/backend/services/crateTableTypes';
import { CrateRule } from '../../../src/shared/types';

const ALBUMS = 10_000;
const SCALE = ALBUMS / 1_200;
/** Plan 7.3: evaluate one crate warm < 20 ms at 1.2k */
const EVALUATE_BOUND_MS = 20 * SCALE * 3;
/** Plan 7.3: GET /crates/suggestions warm < 300 ms at 1.2k */
const SUGGEST_BOUND_MS = 300 * SCALE * 3;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 18, 12, 0, 0);

/** Deterministic pseudo-random numbers (LCG) */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function syntheticContext(): CrateEvalContext {
  const random = rng(42);
  const pick = <T>(values: T[]) => values[Math.floor(random() * values.length)];
  const styles = Array.from({ length: 60 }, (_, i) => `Style ${i}`);
  const genres = ['Rock', 'Jazz', 'Electronic', 'Folk', 'Pop', 'Hip Hop'];
  const facts = new Map<number, CrateReleaseFacts>();
  const albums: CrateTableAlbum[] = [];

  for (let i = 0; i < ALBUMS; i++) {
    const copies = random() < 0.1 ? 2 : 1;
    const artist = `Artist ${Math.floor(random() * 1500)}`;
    const title = `Album ${i}`;
    const addedMs = NOW.getTime() - Math.floor(random() * 3000) * DAY;
    const playCount = random() < 0.3 ? 0 : Math.floor(random() * 80);
    const plays = Array.from({ length: playCount }, () =>
      Math.floor((NOW.getTime() - random() * 3000 * DAY) / 1000)
    ).sort((a, b) => a - b);
    const copyList = Array.from({ length: copies }, (_, c) => {
      const releaseId = i * 10 + c + 1;
      facts.set(releaseId, {
        genres: [pick(genres)],
        styles: [pick(styles), pick(styles)],
        runtime:
          random() < 0.7
            ? {
                knownSeconds: Math.floor(1500 + random() * 3000),
                trackCount: 10,
                tracksWithDuration: 10,
                complete: true,
              }
            : undefined,
      });
      return {
        releaseId,
        artist,
        title,
        year: random() < 0.9 ? 1960 + Math.floor(random() * 66) : undefined,
        format: [random() < 0.7 ? 'Vinyl' : 'CD'],
        dateAdded: new Date(addedMs + c * DAY).toISOString(),
        dateAddedMs: addedMs + c * DAY,
        copyCount: 1,
        inDiscardPile: random() < 0.02,
        resolvedArtist: artist,
        coverUrl: `https://img.test/${releaseId}.jpg`,
      };
    });
    albums.push({
      albumKey: `${artist}|${title}`.toLowerCase(),
      artist,
      album: title,
      coverUrl: copyList[0].coverUrl,
      copies: copyList,
      firstAddedMs: copyList[0].dateAddedMs,
      latestAddedMs: copyList[copyList.length - 1].dateAddedMs,
      listening: {
        scrobbleCount: plays.length,
        lastPlayed: plays.length ? plays[plays.length - 1] : null,
        playTimestamps: plays,
        matchType: plays.length ? 'exact' : 'none',
        matchedKeys: [],
      },
    });
  }

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

  const table: CrateAlbumTable = {
    albums,
    rankedAlbumCount: ranked.length,
    totalAlbums: albums.length,
    totalReleases: facts.size,
    hasHistory: true,
    historyFrom: Math.floor(new Date(2015, 0, 1).getTime() / 1000),
    newestScrobbleAt: NOW.getTime(),
    lastSyncCompletedAt: NOW.getTime(),
    collection: { complete: true, pagesRead: 100, pagesExpected: 100 },
    fingerprint: 'bench',
    builtAt: NOW.getTime(),
  };
  return { table, facts, resolveArtist: name => name, now: NOW };
}

/** Best of a few runs, so a GC pause doesn't decide the result */
function time(run: () => void, repeats = 3): number {
  let best = Infinity;
  for (let i = 0; i < repeats; i++) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

describe('Smart Crates benchmark (10k albums)', () => {
  const ctx = syntheticContext();

  it('evaluates a 6-rule crate within the scaled budget', () => {
    const rules: CrateRule[] = [
      { id: 'fmt', field: 'format', op: 'anyOf', values: ['Vinyl'] },
      { id: 'genre', field: 'genre', op: 'anyOf', values: ['Jazz', 'Rock'] },
      {
        id: 'runtime',
        field: 'runtime',
        op: 'atMost',
        minutes: 45,
        ifUnknown: 'include',
      },
      {
        id: 'quiet',
        field: 'scrobblesInPeriod',
        period: { kind: 'lastDays', days: 365 },
        op: 'none',
      },
      { id: 'top', field: 'scrobbleCount', op: 'topPercent', percent: 50 },
      { id: 'discard', field: 'discardPile', op: 'exclude' },
    ];
    let count = 0;
    const ms = time(() => {
      count = evaluateCrate(
        { id: 'bench', rules, overrides: [], sort: 'runtimeAsc' },
        ctx
      ).albums.length;
    });
    console.log(
      `evaluateCrate (6 rules, ${ALBUMS} albums): ${ms.toFixed(1)} ms, ${count} members (bound ${EVALUATE_BOUND_MS.toFixed(0)} ms)`
    );
    expect(count).toBeGreaterThan(0);
    expect(ms).toBeLessThan(EVALUATE_BOUND_MS);
  });

  it('mines, filters and selects suggestions within the scaled budget', () => {
    let mined = 0;
    let eligible = 0;
    let batch = 0;
    const ms = time(() => {
      const candidates = mineCandidates(ctx.table, ctx.facts, ctx.now);
      mined = candidates.length;
      const evaluated = candidates
        .concat(templateCandidates())
        .map(c => evaluateCandidate(c, ctx));
      const kept = filterCandidates(evaluated, [], []);
      eligible = kept.length;
      batch = selectBatch(kept, [], {
        batchSize: 3,
        exclude: [],
        allowExcludedFallback: true,
      }).length;
    });
    console.log(
      `suggestions (${mined} mined + templates, ${eligible} eligible, batch ${batch}): ${ms.toFixed(1)} ms (bound ${SUGGEST_BOUND_MS.toFixed(0)} ms)`
    );
    expect(mined).toBeGreaterThan(0);
    expect(mined).toBeLessThanOrEqual(SUGGESTION_TOTAL_CAP);
    expect(ms).toBeLessThan(SUGGEST_BOUND_MS);
  });
});
