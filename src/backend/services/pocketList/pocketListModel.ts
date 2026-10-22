/**
 * Pocket List model: turns export rows into ordered sections, artist blocks,
 * album groups and version lines, and decides every string the PDF prints
 * (badges, version text, notes, cover summary and warnings). Pure apart from
 * a warning log on copy-count mismatches.
 * See .plan/done/pocket-list-export-plan.md: "Matching", "Collation & Grouping
 * Rules", "Formats" and "Data Model".
 *
 * Pass all collection rows even for a wishlist-only export: they are not
 * listed then, but they name the owned copy in owned-version notes.
 *
 * Filing (which bin an artist goes in, album order, Various and Soundtracks
 * sections) follows .plan/done/record-store-filing-plan.md and reads only the
 * FilingSnapshot passed in; with an empty snapshot every artist files by its
 * own name.
 */

import {
  ExportCollectionRow,
  ExportRowLink,
  ExportSnapshotMeta,
  ExportWishlistRow,
  MatchConfidence,
  PocketListKind,
  PocketListOptions,
} from '../../../shared/types';
import { albumGroupKey } from '../../../shared/utils/albumMapping';
import { createLogger } from '../../utils/logger';
import {
  EMPTY_FILING_SNAPSHOT,
  FilingSnapshot,
  SOUNDTRACK_STYLES,
  isVariousCredit,
  masterYearOf,
  resolveArtistFiling,
} from '../filing/filingRules';

import {
  PocketAlbumSortFields,
  PocketArtistSortFields,
  SOUNDTRACKS_BUCKET,
  VARIOUS_BUCKET,
  albumSortKey,
  compareAlbumFields,
  compareArtistFields,
  compareCodePoints,
  compareVersionFields,
  compareYears,
  createPocketCollator,
  discogsSuffixNumbers,
  filingParts,
  filingText,
  sectionFor,
} from './pocketListCollation';
import {
  POCKET_SECTION_BUCKETS,
  PocketBadge,
  PocketSectionBucket,
  PocketListAlbumGroup,
  PocketListArtistBlock,
  PocketListCounts,
  PocketListModel,
  PocketListSection,
  PocketListVersionLine,
} from './pocketListTypes';

const log = createLogger('pocketListModel');

/** Wishlist notes are cut to about this many characters */
export const POCKET_NOTES_MAX = 100;

const KIND_ORDER: PocketListKind[] = ['wishlist', 'collection'];

/** Primary media that are not vinyl; always shown, even with format off */
const NON_VINYL_FORMATS = new Set([
  'cd',
  'cdr',
  'cassette',
  'dvd',
  'dvdr',
  'blu-ray',
  'file',
  'all media',
  'box set',
  'flexi-disc',
  'sacd',
  'shellac',
  'minidisc',
  'lathe cut',
  'reel-to-reel',
  '8-track cartridge',
  'hybrid',
]);

type AnyRow = ExportCollectionRow | ExportWishlistRow;

type OwnedTier = 'thisPressing' | 'otherVersion' | 'possibly';

interface OwnedFlag {
  tier: OwnedTier;
  /** Full wording, e.g. "Possibly owned: similar title" */
  wording: string;
}

const TIER_RANK: Record<OwnedTier, number> = {
  thisPressing: 0,
  otherVersion: 1,
  possibly: 2,
};

const TIER_BADGE: Record<OwnedTier, PocketBadge> = {
  thisPressing: { text: 'OWNED: this pressing', tone: 'owned' },
  otherVersion: { text: 'OWNED: another version', tone: 'owned' },
  possibly: { text: 'Possibly owned', tone: 'possible' },
};

const CONFIDENCE_RANK: Record<MatchConfidence, number> = {
  certain: 0,
  confident: 1,
  likely: 2,
};

interface WantInfo {
  row: ExportWishlistRow;
  flag: OwnedFlag | null;
  /** Discogs want that absorbed a certain/confident local want */
  alsoMonitored: boolean;
  /** Discogs want rowIds this local want may be (likely link) */
  likelyOverlapIds: string[];
}

interface WorkBlock {
  key: string;
  identityKey: string | null;
  rows: AnyRow[];
  groups: WorkGroup[];
}

interface WorkGroup {
  /** Confirmed master, or null for a name-only group */
  master: number | null;
  rows: AnyRow[];
  /** Name matched two or more confirmed-master groups */
  ambiguous: boolean;
}

const isCollectionRow = (row: AnyRow): row is ExportCollectionRow =>
  row.source === 'discogs-collection';

const hasConfirmedMaster = (row: AnyRow): boolean =>
  row.masterIdSource === 'release-data' &&
  row.masterId !== null &&
  row.masterId > 0;

const artistNameKey = (artistDisplay: string): string =>
  albumGroupKey(artistDisplay, '');

/** Formats for display: "All Media" → "Box/mixed", duplicates dropped */
export function displayFormat(formats: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const format of formats) {
    const label = format === 'All Media' ? 'Box/mixed' : format;
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out.join(', ');
}

export function isNonVinyl(formats: string[]): boolean {
  return formats.some(f => NON_VINYL_FORMATS.has(f.trim().toLowerCase()));
}

/** Notes cut at ~100 characters, at a word break when one is close */
export function truncateNotes(
  notes: string | null,
  max = POCKET_NOTES_MAX
): string | null {
  if (notes === null) return null;
  const text = notes.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  let cut = chars.slice(0, max - 1).join('');
  const space = cut.lastIndexOf(' ');
  if (space >= max - 20) cut = cut.slice(0, space);
  return `${cut.trimEnd()}…`;
}

/**
 * Owned-version wording from (ownedMatch, ownedMatchConfidence). "this
 * pressing" needs `certain` and a confirmed releaseId (so never a local
 * want); nothing below `confident` says "OWNED".
 */
export function ownedFlagFor(row: ExportWishlistRow): OwnedFlag | null {
  const { ownedMatch, ownedMatchConfidence: confidence } = row;
  if (
    ownedMatch === 'not-owned' ||
    ownedMatch === 'unknown' ||
    confidence === null
  ) {
    return null;
  }
  if (
    confidence === 'certain' &&
    ownedMatch === 'owned-same-release' &&
    row.releaseId !== null
  ) {
    return { tier: 'thisPressing', wording: 'OWNED: this pressing' };
  }
  if (
    (confidence === 'confident' || confidence === 'certain') &&
    ownedMatch === 'owned-other-version'
  ) {
    return { tier: 'otherVersion', wording: 'OWNED: another version' };
  }
  // Everything else, including pairs the shared layer should never send
  // (e.g. a same-release match without a confirmed releaseId), stays "Possibly"
  return ownedMatch === 'owned-name-match'
    ? { tier: 'possibly', wording: 'Possibly owned: similar title' }
    : { tier: 'possibly', wording: 'Possibly owned: same album on Discogs' };
}

function strongestLinks(links: ExportRowLink[]): ExportRowLink[] {
  const unique = new Map<string, ExportRowLink>();
  for (const link of links) {
    const prev = unique.get(link.rowId);
    if (
      !prev ||
      CONFIDENCE_RANK[link.confidence] < CONFIDENCE_RANK[prev.confidence]
    ) {
      unique.set(link.rowId, link);
    }
  }
  return [...unique.values()].sort(
    (a, b) =>
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
      compareCodePoints(a.rowId, b.rowId)
  );
}

/** "OWNED: another version (1994 · Vinyl) +1 more" */
function ownedNote(
  flag: OwnedFlag,
  row: ExportWishlistRow,
  collectionById: Map<string, ExportCollectionRow>
): string {
  const links = strongestLinks(row.ownedCollectionLinks);
  if (links.length === 0) return flag.wording;
  const owned = collectionById.get(links[0].rowId);
  const parts = owned
    ? [
        owned.year !== null ? String(owned.year) : '',
        displayFormat(owned.formats),
      ].filter(Boolean)
    : [];
  let note = flag.wording;
  if (parts.length > 0) note += ` (${parts.join(' · ')})`;
  if (links.length > 1) note += ` +${links.length - 1} more`;
  return note;
}

function mostCommon<T>(
  items: T[],
  keyOf: (item: T) => string,
  tieBreak: (a: T, b: T) => number
): T {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...items].sort(
    (a, b) =>
      (counts.get(keyOf(b)) ?? 0) - (counts.get(keyOf(a)) ?? 0) ||
      tieBreak(a, b)
  )[0];
}

const byYearThenRowId = (a: AnyRow, b: AnyRow): number =>
  compareYears(a.year, b.year) || compareCodePoints(a.rowId, b.rowId);

/** Heading: most common display spelling; ties to collection, then code points */
function headingFor(rows: AnyRow[], identityKey: string | null): string {
  // Rows moved in for a shared master (another identity) show "credited:"
  // instead of voting
  const own = rows.filter(
    r => r.artistIdentityKey === identityKey || r.artistIdentityKey === null
  );
  return mostCommon(
    own.length > 0 ? own : rows,
    r => r.artistDisplay,
    (a, b) =>
      Number(!isCollectionRow(a)) - Number(!isCollectionRow(b)) ||
      compareCodePoints(a.artistDisplay, b.artistDisplay)
  ).artistDisplay;
}

/** Album line title: most common among owned rows (else wanted rows) */
function albumTitleFor(rows: AnyRow[]): string {
  const owned = rows.filter(isCollectionRow);
  const pool: AnyRow[] = owned.length > 0 ? owned : rows;
  return mostCommon(pool, r => r.title, byYearThenRowId).title;
}

function minRowId(rows: AnyRow[]): string {
  return rows.map(r => r.rowId).sort(compareCodePoints)[0];
}

function earliestYear(rows: AnyRow[]): number | null {
  const years = rows.map(r => r.year).filter((y): y is number => y !== null);
  return years.length > 0 ? Math.min(...years) : null;
}

/**
 * Original year of a group: the lower of its confirmed master's cached year
 * and its earliest row year. Name-only groups (master null, which includes
 * every local want's search guess) use the row years alone.
 */
function originalYear(work: WorkGroup, filing: FilingSnapshot): number | null {
  const rowYear = earliestYear(work.rows);
  const masterYear =
    work.master !== null ? masterYearOf(work.master, filing) : null;
  if (masterYear === null) return rowYear;
  return rowYear === null ? masterYear : Math.min(masterYear, rowYear);
}

/** A Various group with any owned copy styled as a soundtrack or score */
function isSoundtrackGroup(work: WorkGroup): boolean {
  return work.rows.some(
    row =>
      isCollectionRow(row) &&
      (row.styles ?? []).some(style => SOUNDTRACK_STYLES.has(style))
  );
}

/**
 * Artist blocks by identity, each with its conservative album groups. Local
 * wants join the one Discogs identity with the same name, else their own
 * block. Groups are reconciled inside each identity block first; then a
 * confirmed master credited differently in several blocks moves, whole
 * group included, into one block.
 */
function buildBlocks(rows: AnyRow[]): WorkBlock[] {
  const blocks = new Map<string, WorkBlock>();
  const identitiesByName = new Map<string, Set<string>>();

  const add = (key: string, identityKey: string | null, row: AnyRow) => {
    let block = blocks.get(key);
    if (!block) {
      block = { key, identityKey, rows: [], groups: [] };
      blocks.set(key, block);
    }
    block.rows.push(row);
  };

  const localRows: AnyRow[] = [];
  for (const row of rows) {
    if (row.artistIdentityKey === null) {
      localRows.push(row);
      continue;
    }
    add(`id:${row.artistIdentityKey}`, row.artistIdentityKey, row);
    const name = artistNameKey(row.artistDisplay);
    const ids = identitiesByName.get(name) ?? new Set<string>();
    ids.add(row.artistIdentityKey);
    identitiesByName.set(name, ids);
  }
  for (const row of localRows) {
    const name = artistNameKey(row.artistDisplay);
    const ids = identitiesByName.get(name);
    if (ids && ids.size === 1) {
      const [identityKey] = [...ids];
      add(`id:${identityKey}`, identityKey, row);
    } else {
      add(`local:${name}`, null, row);
    }
  }

  const byMaster = new Map<
    number,
    Array<{ block: WorkBlock; group: WorkGroup }>
  >();
  for (const block of blocks.values()) {
    block.groups = buildGroups(block.rows);
    for (const group of block.groups) {
      if (group.master === null) continue;
      const list = byMaster.get(group.master) ?? [];
      list.push({ block, group });
      byMaster.set(group.master, list);
    }
  }

  // Differing credits for one confirmed master: one block, chosen by the
  // credit used by the most rows, then earliest year, then lowest rowId
  const masters = [...byMaster.keys()].sort((a, b) => a - b);
  for (const master of masters) {
    const homes = byMaster.get(master) as Array<{
      block: WorkBlock;
      group: WorkGroup;
    }>;
    if (homes.length < 2) continue;
    const blockOfRow = new Map<AnyRow, WorkBlock>();
    for (const { block, group } of homes) {
      for (const row of group.rows) {
        if (hasConfirmedMaster(row)) blockOfRow.set(row, block);
      }
    }
    const chosenRow = mostCommon(
      [...blockOfRow.keys()],
      r => (blockOfRow.get(r) as WorkBlock).key,
      byYearThenRowId
    );
    const target = homes.find(h => h.block === blockOfRow.get(chosenRow)) as {
      block: WorkBlock;
      group: WorkGroup;
    };
    for (const { block, group } of homes) {
      if (group === target.group) continue;
      target.group.rows.push(...group.rows);
      block.groups = block.groups.filter(g => g !== group);
    }
  }

  return [...blocks.values()]
    .map(block => ({ ...block, rows: block.groups.flatMap(g => g.rows) }))
    .filter(block => block.rows.length > 0);
}

/** Conservative album groups within one block (plan "Grouping & duplicates" 2) */
function buildGroups(rows: AnyRow[]): WorkGroup[] {
  const confirmed = new Map<number, AnyRow[]>();
  const rest: AnyRow[] = [];
  for (const row of rows) {
    if (hasConfirmedMaster(row)) {
      const list = confirmed.get(row.masterId as number) ?? [];
      list.push(row);
      confirmed.set(row.masterId as number, list);
    } else {
      rest.push(row);
    }
  }

  const mastersByName = new Map<string, Set<number>>();
  for (const [master, list] of confirmed) {
    for (const row of list) {
      const set = mastersByName.get(row.albumNameKey) ?? new Set<number>();
      set.add(master);
      mastersByName.set(row.albumNameKey, set);
    }
  }

  const nameOnly = new Map<string, WorkGroup>();
  for (const row of rest) {
    const masters = mastersByName.get(row.albumNameKey);
    if (masters && masters.size === 1) {
      const [master] = [...masters];
      const isGuess =
        row.masterIdSource === 'search-guess' && row.masterId !== null;
      if (!isGuess || row.masterId === master) {
        (confirmed.get(master) as AnyRow[]).push(row);
        continue;
      }
    }
    const ambiguous = masters !== undefined && masters.size > 1;
    const key = `${ambiguous ? 'ambiguous' : 'name'}:${row.albumNameKey}`;
    const group = nameOnly.get(key) ?? { master: null, rows: [], ambiguous };
    group.rows.push(row);
    nameOnly.set(key, group);
  }

  return [
    ...[...confirmed.entries()].map(([master, list]) => ({
      master,
      rows: list,
      ambiguous: false,
    })),
    ...nameOnly.values(),
  ];
}

interface BuiltGroup {
  group: PocketListAlbumGroup;
  sort: PocketAlbumSortFields;
  flags: OwnedTier[];
}

interface ModelContext {
  options: PocketListOptions;
  showVersions: boolean;
  wants: Map<string, WantInfo>;
  collectionById: Map<string, ExportCollectionRow>;
  collator: Intl.Collator;
  filing: FilingSnapshot;
}

function versionText(
  row: AnyRow,
  options: PocketListOptions
): { text: string; format: string } {
  const format = displayFormat(row.formats);
  const parts: string[] = [];
  if (options.details.pressing) {
    if (row.year !== null) parts.push(String(row.year));
    if (row.labels.length > 0) parts.push(row.labels[0]);
  }
  if (format && (options.details.format || isNonVinyl(row.formats))) {
    parts.push(format);
  }
  return { text: parts.join(' · '), format };
}

function buildGroup(
  work: WorkGroup,
  heading: string,
  ctx: ModelContext,
  albumOrder: 'year' | 'title' = 'year'
): BuiltGroup {
  const owned = work.rows.filter(isCollectionRow);
  const wanted = work.rows.filter(
    (r): r is ExportWishlistRow => !isCollectionRow(r)
  );
  // "Various" and "Various Artists" are one heading
  const credited = (row: AnyRow) =>
    row.artistDisplay !== heading &&
    !(isVariousCredit(row.artistDisplay) && isVariousCredit(heading))
      ? `credited: ${row.artistDisplay}`
      : null;
  const ambiguousNote = work.ambiguous ? 'possibly another version' : null;

  const lines: Array<
    PocketListVersionLine & { year: number | null; format: string }
  > = [];

  // Owned: one line per release, copies counted by rows
  const byRelease = new Map<number, ExportCollectionRow[]>();
  for (const row of owned) {
    const list = byRelease.get(row.releaseId) ?? [];
    list.push(row);
    byRelease.set(row.releaseId, list);
  }
  for (const copies of byRelease.values()) {
    copies.sort((a, b) => compareCodePoints(a.rowId, b.rowId));
    const first = copies[0];
    if (copies.some(c => c.copyCount !== copies.length)) {
      log.warn('Collection copyCount differs from row count; using rows', {
        releaseId: first.releaseId,
        rows: copies.length,
        copyCounts: copies.map(c => c.copyCount),
      });
    }
    const { text, format } = versionText(first, ctx.options);
    lines.push({
      rowId: first.rowId,
      status: 'owned',
      text,
      badges: [
        {
          text: copies.length > 1 ? `OWNED ×${copies.length}` : 'OWNED',
          tone: 'owned',
        },
      ],
      credited: credited(first),
      note: ambiguousNote,
      notes: null,
      year: first.year,
      format,
    });
  }

  const flags: OwnedTier[] = [];
  for (const row of wanted) {
    const info = ctx.wants.get(row.rowId) as WantInfo;
    const isLocal = row.source === 'local-want';
    const badges: PocketBadge[] = [{ text: 'WANTED', tone: 'wanted' }];
    if (isLocal) {
      badges.push({ text: 'any version', tone: 'neutral' });
      badges.push({ text: 'monitored', tone: 'neutral' });
    }
    if (info.alsoMonitored) {
      badges.push({ text: 'also monitored', tone: 'neutral' });
    }
    const noteParts: string[] = [];
    if (info.flag) {
      flags.push(info.flag.tier);
      noteParts.push(ownedNote(info.flag, row, ctx.collectionById));
    }
    if (ambiguousNote) noteParts.push(ambiguousNote);
    const { text, format } = versionText(row, ctx.options);
    lines.push({
      rowId: row.rowId,
      status: 'wanted',
      text,
      badges,
      credited: credited(row),
      note: noteParts.length > 0 ? noteParts.join('; ') : null,
      notes: ctx.options.details.notes ? truncateNotes(row.notes) : null,
      year: row.year,
      format,
    });
  }

  lines.sort(compareVersionFields);

  // Likely local/Discogs overlaps in the same group are shown, and pointed at
  const index = new Map(lines.map((line, i) => [line.rowId, i]));
  for (const [i, line] of lines.entries()) {
    const info = ctx.wants.get(line.rowId);
    if (!info || info.likelyOverlapIds.length === 0) continue;
    const others = info.likelyOverlapIds
      .map(id => index.get(id))
      .filter((n): n is number => n !== undefined);
    if (others.length === 0) continue;
    const where = others.some(n => n < i) ? 'above' : 'below';
    const overlap = `may be the same as ${where}`;
    line.note = line.note ? `${overlap}; ${line.note}` : overlap;
  }

  const ownedCount = owned.length;
  const wantedCount = wanted.length;
  const badges: PocketBadge[] = [];
  if (!ctx.showVersions) {
    if (ownedCount > 0) {
      badges.push({
        text: ownedCount > 1 ? `OWNED ×${ownedCount}` : 'OWNED',
        tone: 'owned',
      });
    }
    if (wantedCount > 0) {
      badges.push({
        text: wantedCount > 1 ? `WANTED (${wantedCount} pressings)` : 'WANTED',
        tone: 'wanted',
      });
    }
    if (wantedCount > 0 && wanted.every(r => r.source === 'local-want')) {
      badges.push({ text: 'any version', tone: 'neutral' });
    }
    const nonVinyl = work.rows
      .filter(r => isNonVinyl(r.formats))
      .sort((a, b) => compareCodePoints(a.rowId, b.rowId));
    if (nonVinyl.length > 0) {
      const formats = displayFormat(nonVinyl.flatMap(r => r.formats));
      badges.push({
        text:
          nonVinyl.length === work.rows.length ? formats : `incl. ${formats}`,
        tone: 'neutral',
      });
    }
  }
  // Album-level owned-version flag, unless an owned row already shows it
  if (flags.length > 0 && (ownedCount === 0 || !ctx.showVersions)) {
    const strongest = [...flags].sort((a, b) => TIER_RANK[a] - TIER_RANK[b])[0];
    badges.push(TIER_BADGE[strongest]);
  }
  // Grouping doubt, not an ownership claim: shown even with flags off
  if (work.ambiguous && !ctx.showVersions) {
    badges.push({ text: 'possibly another version', tone: 'possible' });
  }

  const title = albumTitleFor(work.rows);
  const year = originalYear(work, ctx.filing);
  return {
    group: {
      title,
      year,
      versions: ctx.showVersions
        ? lines.map(({ year: _y, format: _f, ...line }) => line)
        : [],
      ownedCount,
      wantedCount,
      badges,
    },
    sort: {
      sortKey: albumOrder === 'title' ? filingText(title) : albumSortKey(title),
      year,
      firstRowId: minRowId(work.rows),
    },
    flags,
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function wantsSummaryFor(
  options: PocketListOptions,
  counts: PocketListCounts
): string | null {
  if (!options.lists.includes('wishlist')) return null;
  const total = plural(counts.wanted, 'want', 'wants');
  const discogs = options.wishlistSources.includes('discogs-want');
  const local = options.wishlistSources.includes('local-want');
  if (discogs && local) {
    const parts = [
      `${counts.discogsWants} Discogs + ${counts.localWants} monitored`,
    ];
    if (counts.overlapsCollapsed > 0) {
      parts.push(`${counts.overlapsCollapsed} in both lists`);
    }
    if (counts.overlapsShown > 0) {
      parts.push(
        `${plural(
          counts.overlapsShown,
          'possible overlap',
          'possible overlaps'
        )} shown`
      );
    }
    return `${total} (${parts.join('; ')})`;
  }
  if (discogs) return `${total} (Discogs)`;
  if (local) return `${total} (monitored)`;
  return total;
}

function warningsFor(
  options: PocketListOptions,
  meta: ExportSnapshotMeta
): string[] {
  const cache = meta.collectionCache;
  const wishlist = options.lists.includes('wishlist');
  const collection = options.lists.includes('collection');
  const warnings: string[] = [];
  if (cache.status === 'missing') {
    if (wishlist)
      warnings.push('Collection not cached: owned flags unavailable');
    if (collection)
      warnings.push('Collection not cached: no owned records listed');
  } else if (cache.status === 'partial') {
    const pages = `${cache.pagesRead} of ${cache.pagesExpected ?? '?'} pages`;
    if (collection) {
      warnings.push(
        `Collection cache incomplete (${pages}): some owned records are missing`
      );
    }
    if (wishlist) {
      warnings.push(
        `Collection cache incomplete (${pages}): unflagged wants may still be owned`
      );
    }
  }
  return warnings;
}

/** Wishlist rows after source filtering and certain/confident collapsing */
function prepareWants(
  wishlistRows: ExportWishlistRow[],
  options: PocketListOptions,
  counts: PocketListCounts
): Map<string, WantInfo> {
  const rows = options.lists.includes('wishlist')
    ? wishlistRows.filter(r => options.wishlistSources.includes(r.source))
    : [];
  const byId = new Map(rows.map(r => [r.rowId, r]));
  counts.discogsWants = rows.filter(r => r.source === 'discogs-want').length;
  counts.localWants = rows.filter(r => r.source === 'local-want').length;

  // Links may be recorded on either side; gather them per local want
  const linksOfLocal = new Map<string, ExportRowLink[]>();
  const addLink = (localId: string, link: ExportRowLink) => {
    const list = linksOfLocal.get(localId) ?? [];
    list.push(link);
    linksOfLocal.set(localId, list);
  };
  for (const row of rows) {
    for (const link of row.relatedWishlistLinks) {
      const other = byId.get(link.rowId);
      if (!other || other.source === row.source) continue;
      if (row.source === 'local-want') addLink(row.rowId, link);
      else addLink(other.rowId, { ...link, rowId: row.rowId });
    }
  }

  const wants = new Map<string, WantInfo>();
  for (const row of rows) {
    const flag = ownedFlagFor(row);
    wants.set(row.rowId, {
      row,
      flag:
        !options.flagOwnedVersions && flag?.tier !== 'thisPressing'
          ? null
          : flag,
      alsoMonitored: false,
      likelyOverlapIds: [],
    });
  }

  const localIds = [...linksOfLocal.keys()].sort(compareCodePoints);
  for (const localId of localIds) {
    const links = strongestLinks(linksOfLocal.get(localId) as ExportRowLink[]);
    const strong = links.find(l => l.confidence !== 'likely');
    if (strong) {
      wants.delete(localId);
      (wants.get(strong.rowId) as WantInfo).alsoMonitored = true;
      counts.overlapsCollapsed++;
    } else if (links.length > 0) {
      (wants.get(localId) as WantInfo).likelyOverlapIds = links.map(
        l => l.rowId
      );
      counts.overlapsShown++;
    }
  }
  counts.wanted = wants.size;
  return wants;
}

/** Build the whole Pocket List model. Empty sections mean nothing to export. */
export function buildPocketListModel(
  collectionRows: ExportCollectionRow[],
  wishlistRows: ExportWishlistRow[],
  options: PocketListOptions,
  meta: ExportSnapshotMeta,
  now: Date = new Date(),
  filing: FilingSnapshot = EMPTY_FILING_SNAPSHOT
): PocketListModel {
  const counts: PocketListCounts = {
    albums: 0,
    entries: 0,
    owned: 0,
    wanted: 0,
    discogsWants: 0,
    localWants: 0,
    overlapsCollapsed: 0,
    overlapsShown: 0,
    ownedFlags: { thisPressing: 0, otherVersion: 0, possibly: 0 },
  };

  const owned = options.lists.includes('collection') ? collectionRows : [];
  counts.owned = owned.length;
  const wants = prepareWants(wishlistRows, options, counts);
  for (const info of wants.values()) {
    if (info.flag) counts.ownedFlags[info.flag.tier]++;
  }

  const ctx: ModelContext = {
    options,
    // Notes live on version lines, so a notes-only export keeps them (lines
    // then carry badges, notes and any non-vinyl format)
    showVersions:
      options.details.format ||
      options.details.pressing ||
      options.details.notes,
    wants,
    collectionById: new Map(collectionRows.map(r => [r.rowId, r])),
    collator: createPocketCollator(),
    filing,
  };

  const rows: AnyRow[] = [...owned, ...[...wants.values()].map(w => w.row)];

  type SortedBlock = {
    displayArtist: string;
    sort: PocketArtistSortFields & { key: string };
    albums: BuiltGroup[];
    /** Various and Soundtracks blocks: no same-name disambiguation */
    special: boolean;
  };
  const blocks: SortedBlock[] = [];
  // Various groups, by destination section; each section gets one block
  const specialGroups = new Map<
    PocketSectionBucket,
    Array<{ work: WorkGroup; identityKey: string | null; heading: string }>
  >();

  for (const block of buildBlocks(rows)) {
    const displayArtist = headingFor(block.rows, block.identityKey);
    if (isVariousCredit(displayArtist)) {
      for (const work of block.groups) {
        const bucket = isSoundtrackGroup(work)
          ? SOUNDTRACKS_BUCKET
          : VARIOUS_BUCKET;
        const list = specialGroups.get(bucket) ?? [];
        list.push({
          work,
          identityKey: block.identityKey,
          heading: displayArtist,
        });
        specialGroups.set(bucket, list);
      }
      continue;
    }

    const ownCredit = block.rows.find(
      r => r.artistIdentityKey === block.identityKey
    );
    const resolved = resolveArtistFiling(displayArtist, filing);
    const { head, tail } = filingParts(resolved.sortName);
    const sort: PocketArtistSortFields & { key: string } = {
      section: sectionFor(head),
      head,
      tail,
      collaboration: resolved.collaboration,
      suffixes:
        block.identityKey !== null && ownCredit
          ? discogsSuffixNumbers(ownCredit.artistRaw)
          : [],
      identityKey: block.identityKey,
      key: block.key,
    };
    const albums = block.groups
      .map(group => buildGroup(group, displayArtist, ctx))
      .sort((a, b) => compareAlbumFields(a.sort, b.sort, ctx.collator));
    blocks.push({ displayArtist, sort, albums, special: false });
  }

  for (const [bucket, list] of specialGroups) {
    // Heading: the Discogs spelling when there is one ("Various")
    const withIdentity = list.filter(g => g.identityKey !== null);
    const pool = withIdentity.length > 0 ? withIdentity : list;
    const heading = [...pool].map(g => g.heading).sort(compareCodePoints)[0];
    const identityKey =
      withIdentity
        .map(g => g.identityKey as string)
        .sort(compareCodePoints)[0] ?? null;
    const albums = list
      .map(g => buildGroup(g.work, heading, ctx, 'title'))
      .sort((a, b) =>
        compareAlbumFields(a.sort, b.sort, ctx.collator, 'title')
      );
    blocks.push({
      displayArtist: heading,
      sort: {
        section: bucket,
        head: '',
        tail: '',
        collaboration: null,
        suffixes: [],
        identityKey,
        key: bucket.id,
      },
      albums,
      special: true,
    });
  }

  blocks.sort(
    (a, b) =>
      compareArtistFields(a.sort, b.sort, ctx.collator) ||
      compareCodePoints(a.sort.key, b.sort.key)
  );

  // Same display name, different identity: tag every block after the first
  const seenNames = new Set<string>();
  const sections = new Map<string, PocketListSection>();
  for (const block of blocks) {
    const name = artistNameKey(block.displayArtist);
    let disambiguation: string | null = null;
    if (!block.special && seenNames.has(name)) {
      const number = block.sort.suffixes.find(n => n > 0);
      disambiguation =
        block.sort.identityKey === null
          ? `${block.displayArtist} · Discogs artist not identified`
          : number !== undefined
            ? `another artist named ${block.displayArtist} · Discogs #${number}`
            : `another artist named ${block.displayArtist}`;
    }
    if (!block.special) seenNames.add(name);

    const artist: PocketListArtistBlock = {
      identityKey: block.sort.identityKey,
      displayArtist: block.displayArtist,
      disambiguation,
      albums: block.albums.map(a => a.group),
    };
    counts.albums += artist.albums.length;
    counts.entries += ctx.showVersions
      ? artist.albums.reduce((n, a) => n + a.versions.length, 0)
      : artist.albums.length;

    const bucket = block.sort.section;
    const section = sections.get(bucket.id) ?? {
      id: bucket.id,
      label: bucket.label,
      artists: [],
    };
    section.artists.push(artist);
    sections.set(bucket.id, section);
  }

  return {
    meta: {
      generatedAt: now.toISOString(),
      lists: KIND_ORDER.filter(kind => options.lists.includes(kind)),
      counts,
      wantsSummary: wantsSummaryFor(options, counts),
      wishlistUpdatedAt: meta.wishlistUpdatedAt,
      collectionCachedAt: meta.collectionCachedAt,
      collectionCache: meta.collectionCache,
      warnings: warningsFor(options, meta),
    },
    sections: POCKET_SECTION_BUCKETS.map(b => sections.get(b.id)).filter(
      (s): s is PocketListSection => s !== undefined
    ),
  };
}
