/**
 * Record Lookup Service - "Check a Record": one search across the collection,
 * Discogs wants, monitored (local) wants and the discard pile, so a record in
 * your hand in a store gets one answer (site review 2026-10-23, feature #1).
 *
 * Cached data only, through ExportDataService (which already works out which
 * wants are owned) and the discard pile; no API calls and no writes.
 *
 * Rows are grouped by confirmed Discogs master, else release. Name-only and
 * search-guess links (local wants) never merge groups: they bring the linked
 * group into the results as its own card instead.
 */

import {
  DiscardPileItem,
  ExportCollectionCacheInfo,
  ExportCollectionRow,
  ExportWishlistRow,
  RecordCheckCopy,
  RecordCheckDiscard,
  RecordCheckGroup,
  RecordCheckMatch,
  RecordCheckResult,
  RecordCheckWant,
} from '../../shared/types';
import { albumGroupKey } from '../../shared/utils/albumMapping';
import { createLogger } from '../utils/logger';
import { toIsoSeconds } from '../utils/timestamps';

/** Result cards returned; the rest are reported through hasMore */
export const RECORD_CHECK_LIMIT = 25;

/** How long one read of the caches serves searches (one per keystroke) */
const SNAPSHOT_TTL_MS = 60 * 1000;

/** Queries longer than this are cut, so a pasted page can't stall a search */
const MAX_QUERY_LENGTH = 200;

/** Artist names that mean "compilation"; searched as synonyms of each other */
const VARIOUS_ARTISTS = new Set(['various', 'various artists', 'va']);
const VARIOUS_WORDS = ['various', 'artists', 'va'];

type Row =
  | { kind: 'owned'; row: ExportCollectionRow }
  | { kind: 'want'; row: ExportWishlistRow }
  | { kind: 'discard'; item: DiscardPileItem };

interface IndexedRow {
  entry: Row;
  groupKey: string;
  words: string[];
  /** Each artist variant and the title without spaces or punctuation */
  compacts: string[];
  titleCompact: string;
  artistTitleCompact: string;
  releaseId: number | null;
  /** Confirmed (release data) master id */
  masterId: number | null;
}

interface Snapshot {
  rows: IndexedRow[];
  byGroup: Map<string, IndexedRow[]>;
  byRowId: Map<string, IndexedRow>;
  /** Collection rowId → wants that link to it */
  wantsByOwnedRowId: Map<string, IndexedRow[]>;
  cache: ExportCollectionCacheInfo;
  generatedAt: string;
  builtAt: number;
  aliasFingerprint: string;
}

export interface RecordLookupSources {
  exportData: {
    getCollectionRows(): Promise<ExportCollectionRow[]>;
    getWishlistRows(): Promise<ExportWishlistRow[]>;
    getSnapshotMeta(): Promise<{
      collectionCache: ExportCollectionCacheInfo;
      generatedAt: string;
    }>;
  };
  discardPile: { getDiscardPile(): Promise<DiscardPileItem[]> };
}

interface AliasSource {
  getAliases(name: string): string[];
  getFingerprint(): string;
}

/**
 * Words for searching: case, accents and punctuation ignored. Apostrophes
 * join ("don't" → "dont"); other punctuation splits. A name made only of
 * symbols keeps its own spelling as one word.
 */
export function searchWords(s: string): string[] {
  const lower = s.toLowerCase().trim();
  const words = lower
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean);
  return words.length > 0 || !lower ? words : [lower];
}

const compactOf = (s: string) => searchWords(s).join('');

/** A Discogs release URL, "[r123]", "r123" or a bare number */
export function parseReleaseQuery(q: string): number | null {
  const url = q.match(/discogs\.com\/(?:[^/\s]+\/)?release\/(\d+)/i);
  const plain = q.trim().match(/^\[?r?(\d+)\]?$/i);
  const id = Number((url ?? plain)?.[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export class RecordLookupService {
  private logger = createLogger('RecordLookupService');
  private aliases: AliasSource | null = null;
  private snapshot: Promise<Snapshot> | null = null;

  constructor(
    private sources: RecordLookupSources,
    private now: () => number = () => Date.now()
  ) {}

  /** Search known artist aliases too (set once the resolver is built) */
  setArtistNameResolver(aliases: AliasSource): void {
    this.aliases = aliases;
    this.snapshot = null;
  }

  async check(rawQuery: string): Promise<RecordCheckResult> {
    const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
    const snap = await this.getSnapshot();
    const releaseId = parseReleaseQuery(query);

    // group key → how it was found and how well it matched
    const found = new Map<
      string,
      { matchedBy: RecordCheckMatch; score: number }
    >();
    const mark = (key: string, matchedBy: RecordCheckMatch, score: number) => {
      const prev = found.get(key);
      if (!prev || score > prev.score) found.set(key, { matchedBy, score });
    };

    let releaseRecognized: boolean | null = null;
    if (releaseId !== null) {
      const sameRelease = snap.rows.filter(r => r.releaseId === releaseId);
      releaseRecognized = sameRelease.length > 0;
      const masters = new Set(
        sameRelease.map(r => r.masterId).filter((m): m is number => m !== null)
      );
      for (const row of sameRelease) mark(row.groupKey, 'release-id', 1000);
      for (const row of snap.rows) {
        if (row.masterId !== null && masters.has(row.masterId)) {
          mark(row.groupKey, 'master-id', 900);
        }
      }
    }

    // Rows found directly (not through links), whose links are followed below
    const direct = new Set<IndexedRow>();
    for (const key of found.keys()) {
      snap.byGroup.get(key)?.forEach(row => direct.add(row));
    }

    // A bare number may also be a title ("1989"); URLs are only ids
    const isUrl = /discogs\.com/i.test(query);
    const queryWords = isUrl ? [] : searchWords(query);
    if (queryWords.length > 0) {
      const queryCompact = queryWords.join('');
      for (const row of snap.rows) {
        const score = textScore(row, queryWords, queryCompact);
        if (score > 0) {
          direct.add(row);
          mark(row.groupKey, 'text', score);
        }
      }
    }

    // Links in both directions: a want's owned copies and related wants, and
    // the wants that point at an owned copy. They join as their own cards.
    for (const row of direct) {
      for (const linkedId of linkedRowIds(row, snap)) {
        const linked = snap.byRowId.get(linkedId);
        if (linked && !found.has(linked.groupKey)) {
          mark(linked.groupKey, 'linked', 0);
        }
      }
    }

    const ranked = [...found.entries()].sort(
      ([ka, a], [kb, b]) =>
        b.score - a.score ||
        compareGroups(snap.byGroup.get(ka)!, snap.byGroup.get(kb)!)
    );

    return {
      query,
      releaseId,
      releaseRecognized,
      groups: ranked
        .slice(0, RECORD_CHECK_LIMIT)
        .map(([key, { matchedBy }]) =>
          buildGroup(key, snap.byGroup.get(key)!, matchedBy, releaseId)
        ),
      hasMore: ranked.length > RECORD_CHECK_LIMIT,
      collectionCache: snap.cache,
      generatedAt: snap.generatedAt,
    };
  }

  // ============================================
  // Snapshot
  // ============================================

  private getSnapshot(): Promise<Snapshot> {
    const fingerprint = this.aliases?.getFingerprint() ?? '';
    const current = this.snapshot;
    if (current) {
      return current.then(snap =>
        this.now() - snap.builtAt < SNAPSHOT_TTL_MS &&
        snap.aliasFingerprint === fingerprint
          ? snap
          : this.rebuild(current)
      );
    }
    return this.rebuild(null);
  }

  private rebuild(stale: Promise<Snapshot> | null): Promise<Snapshot> {
    // Callers that saw the same stale snapshot share one rebuild
    if (this.snapshot !== stale && this.snapshot) return this.snapshot;
    const next = this.build();
    this.snapshot = next;
    next.catch(error => {
      this.logger.warn('Record lookup data could not be read', error);
      if (this.snapshot === next) this.snapshot = null;
    });
    return next;
  }

  private async build(): Promise<Snapshot> {
    const { exportData, discardPile } = this.sources;
    const [owned, wants, meta, discards] = await Promise.all([
      exportData.getCollectionRows(),
      exportData.getWishlistRows(),
      exportData.getSnapshotMeta(),
      discardPile.getDiscardPile(),
    ]);

    const entries: Row[] = [
      ...owned.map(row => ({ kind: 'owned' as const, row })),
      ...wants.map(row => ({ kind: 'want' as const, row })),
      ...discards.map(item => ({ kind: 'discard' as const, item })),
    ];
    // A release's confirmed master from any source, so one release lands in
    // one group even where a source doesn't know its master
    const releaseMasters = new Map<number, number>();
    for (const entry of entries) {
      const { releaseId, masterId } = describe(entry);
      if (releaseId !== null && masterId !== null) {
        releaseMasters.set(releaseId, masterId);
      }
    }
    const rows = entries.map(entry => this.index(entry, releaseMasters));

    const byGroup = new Map<string, IndexedRow[]>();
    const byRowId = new Map<string, IndexedRow>();
    const wantsByOwnedRowId = new Map<string, IndexedRow[]>();
    for (const row of rows) {
      byGroup.set(row.groupKey, [...(byGroup.get(row.groupKey) ?? []), row]);
      byRowId.set(rowIdOf(row.entry), row);
      if (row.entry.kind === 'want') {
        for (const ownedId of row.entry.row.ownedCollectionRowIds) {
          const list = wantsByOwnedRowId.get(ownedId) ?? [];
          list.push(row);
          wantsByOwnedRowId.set(ownedId, list);
        }
      }
    }

    return {
      rows,
      byGroup,
      byRowId,
      wantsByOwnedRowId,
      cache: meta.collectionCache,
      generatedAt: meta.generatedAt || toIsoSeconds(this.now()),
      builtAt: this.now(),
      aliasFingerprint: this.aliases?.getFingerprint() ?? '',
    };
  }

  private index(entry: Row, releaseMasters: Map<number, number>): IndexedRow {
    const described = describe(entry);
    const { artistNames, title, releaseId } = described;
    const masterId =
      described.masterId ??
      (releaseId !== null ? (releaseMasters.get(releaseId) ?? null) : null);
    const groupKey = masterId ? `m:${masterId}` : described.groupKey;
    const artistVariants = new Set(artistNames);
    for (const name of artistNames) {
      for (const alias of this.aliases?.getAliases(name) ?? []) {
        artistVariants.add(alias);
      }
    }
    const words = new Set<string>(searchWords(title));
    for (const name of artistVariants) {
      for (const word of searchWords(name)) words.add(word);
      if (VARIOUS_ARTISTS.has(name.toLowerCase().trim())) {
        VARIOUS_WORDS.forEach(w => words.add(w));
      }
    }
    const artist = artistNames[0] ?? '';
    return {
      entry,
      groupKey,
      words: [...words],
      compacts: [...artistVariants, title].map(compactOf),
      titleCompact: compactOf(title),
      artistTitleCompact: compactOf(`${artist} ${title}`),
      releaseId,
      masterId,
    };
  }
}

// ============================================
// Helpers
// ============================================

function describe(entry: Row): {
  artistNames: string[];
  title: string;
  releaseId: number | null;
  masterId: number | null;
  groupKey: string;
} {
  if (entry.kind === 'owned') {
    const { row } = entry;
    return {
      artistNames: [row.artistDisplay, row.artistRaw],
      title: row.title,
      releaseId: row.releaseId,
      masterId: row.masterId,
      groupKey: row.masterId ? `m:${row.masterId}` : `r:${row.releaseId}`,
    };
  }
  if (entry.kind === 'want') {
    const { row } = entry;
    // Local-want masters are search guesses: they never join a group
    const confirmed =
      row.masterIdSource === 'release-data' ? row.masterId : null;
    return {
      artistNames: [row.artistDisplay, row.artistRaw],
      title: row.title,
      releaseId: row.source === 'discogs-want' ? row.releaseId : null,
      masterId: confirmed,
      groupKey: confirmed
        ? `m:${confirmed}`
        : row.source === 'discogs-want' && row.releaseId
          ? `r:${row.releaseId}`
          : `n:${albumGroupKey(row.artistDisplay, row.title)}`,
    };
  }
  const { item } = entry;
  return {
    artistNames: [item.artist],
    title: item.title,
    releaseId: item.releaseId,
    masterId: item.masterId || null,
    groupKey: item.masterId ? `m:${item.masterId}` : `r:${item.releaseId}`,
  };
}

function rowIdOf(entry: Row): string {
  return entry.kind === 'discard'
    ? `discard:${entry.item.id}`
    : entry.row.rowId;
}

/**
 * 0 when some query word matches no word of the row. Whole-word matches
 * count more than prefix matches; a query that is the whole title (or
 * artist and title) ranks first. Matching without spaces from the start
 * of a name ("acdc" for "AC/DC") is the weakest match.
 */
function textScore(
  row: IndexedRow,
  queryWords: string[],
  queryCompact: string
): number {
  let score = 0;
  for (const q of queryWords) {
    if (row.words.includes(q)) score += 2;
    else if (row.words.some(w => w.startsWith(q))) score += 1;
    // A word typed without its punctuation ("acdc" for AC/DC), from the
    // start of a name only
    else if (q.length >= 3 && row.compacts.some(c => c.startsWith(q)))
      score += 1;
    else {
      score = 0;
      break;
    }
  }
  if (score === 0) {
    // From the start of a name only, so "acdc" finds AC/DC but "agle"
    // doesn't find "Comfort Eagle"
    return queryCompact.length >= 3 &&
      row.compacts.some(c => c.startsWith(queryCompact))
      ? 1
      : 0;
  }
  if (
    queryCompact === row.titleCompact ||
    queryCompact === row.artistTitleCompact
  ) {
    score += 10;
  }
  return score;
}

function linkedRowIds(row: IndexedRow, snap: Snapshot): string[] {
  const { entry } = row;
  if (entry.kind === 'want') {
    return [
      ...entry.row.ownedCollectionRowIds,
      ...entry.row.relatedWishlistLinks.map(l => l.rowId),
    ];
  }
  if (entry.kind === 'owned') {
    return (snap.wantsByOwnedRowId.get(entry.row.rowId) ?? []).map(w =>
      rowIdOf(w.entry)
    );
  }
  return [];
}

/** Owned first, then artist and title */
function compareGroups(a: IndexedRow[], b: IndexedRow[]): number {
  const owned = (rows: IndexedRow[]) =>
    rows.some(r => r.entry.kind === 'owned') ? 0 : 1;
  const label = (rows: IndexedRow[]) => {
    const { artistNames, title } = describe(rows[0].entry);
    return `${artistNames[0] ?? ''} ${title}`.toLowerCase();
  };
  return owned(a) - owned(b) || label(a).localeCompare(label(b));
}

function buildGroup(
  key: string,
  rows: IndexedRow[],
  matchedBy: RecordCheckMatch,
  queriedRelease: number | null
): RecordCheckGroup {
  const owned: RecordCheckCopy[] = [];
  const wants: RecordCheckWant[] = [];
  const monitored: RecordCheckWant[] = [];
  const discards: RecordCheckDiscard[] = [];
  for (const { entry } of rows) {
    if (entry.kind === 'owned') {
      const r = entry.row;
      owned.push({
        rowId: r.rowId,
        releaseId: r.releaseId,
        artist: r.artistDisplay,
        title: r.title,
        year: r.year,
        formats: r.formats,
        labels: r.labels,
        dateAdded: r.dateAdded,
        isQueriedRelease: r.releaseId === queriedRelease,
      });
    } else if (entry.kind === 'want') {
      const r = entry.row;
      const want: RecordCheckWant = {
        rowId: r.rowId,
        source: r.source,
        releaseId: r.releaseId,
        artist: r.artistDisplay,
        title: r.title,
        year: r.year,
        formats: r.formats,
        ownedMatch: r.ownedMatch,
        ownedMatchConfidence: r.ownedMatchConfidence,
        lowestVinylPrice: r.lowestVinylPrice,
        priceCurrency: r.priceCurrency,
        dateAdded: r.dateAdded,
      };
      (r.source === 'discogs-want' ? wants : monitored).push(want);
    } else {
      const d = entry.item;
      discards.push({
        id: d.id,
        releaseId: d.releaseId,
        artist: d.artist,
        title: d.title,
        year: d.year || null,
        status: d.status,
        reason: d.reason,
        addedAt: d.addedAt,
        statusChangedAt: d.statusChangedAt,
      });
    }
  }
  owned.sort(
    (a, b) =>
      Number(b.isQueriedRelease) - Number(a.isQueriedRelease) ||
      (a.year ?? 9999) - (b.year ?? 9999)
  );
  discards.sort((a, b) => b.statusChangedAt - a.statusChangedAt);

  // Name the card after a copy you own, else a want, else the discard
  const lead =
    rows.find(r => r.entry.kind === 'owned') ??
    rows.find(r => r.entry.kind === 'want') ??
    rows[0];
  const { artistNames, title } = describe(lead.entry);
  const years = [
    ...owned.map(c => c.year),
    ...wants.map(w => w.year),
    ...discards.map(d => d.year),
  ].filter((y): y is number => !!y);
  return {
    key,
    artist: artistNames[0] ?? '',
    title,
    year: years.length > 0 ? Math.min(...years) : null,
    coverImageUrl: coverOf(lead.entry),
    matchedBy,
    owned,
    wants,
    monitored,
    discards,
  };
}

function coverOf(entry: Row): string | null {
  if (entry.kind === 'discard') return entry.item.coverImage ?? null;
  return entry.row.coverImageUrl;
}
