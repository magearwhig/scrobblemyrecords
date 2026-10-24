import { DiscogsRawTrack, Track } from '../types';

import { parseDurationSeconds } from './releaseRuntime';

/**
 * Discogs tracklists carry three kinds of row:
 * - "track": a track with a position ("A1")
 * - "heading": a section title with no position ("Side A", Wu-Tang's
 *   "Shaolin Sword"), sometimes with a duration
 * - "index": one track made of parts, with no position of its own; its
 *   parts are in `sub_tracks` ("Intro / Sweet Jane" = A1a "Intro" + A1b
 *   "Sweet Jane", "The Czar" = A4a–A4d)
 *
 * Release files saved before `TRACKLIST_VERSION` 2 dropped the parts, so an
 * index track looked like a heading and couldn't be selected or scrobbled.
 */
export const TRACKLIST_VERSION = 2;

/** Default length of a track with no duration, for scrobble timing */
export const DEFAULT_TRACK_SECONDS = 180;

/** A heading row: no position, not a track */
export function isTracklistHeading(track: Track): boolean {
  return !track.position || track.position.trim() === '';
}

/**
 * Position of an index track from its parts' positions: their shared
 * prefix without a trailing separator ("A1a", "A1b" → "A1"; "A1.a" → "A1";
 * "B7-A" → "B7"), or the first–last range when the parts only share a side
 * ("A1"…"A4" → "A1–A4").
 */
export function indexTrackPosition(partPositions: string[]): string {
  const positions = partPositions.map(p => p.trim()).filter(Boolean);
  if (positions.length === 0) return '';
  if (positions.length === 1) return positions[0];
  let prefix = positions[0];
  for (const position of positions.slice(1)) {
    let i = 0;
    while (i < prefix.length && prefix[i] === position[i]) i++;
    prefix = prefix.slice(0, i);
  }
  prefix = prefix.replace(/[\s.\-–:]+$/, '');
  if (/\d/.test(prefix)) return prefix;
  return `${positions[0]}–${positions[positions.length - 1]}`;
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function artistOf(raw: DiscogsRawTrack): string | undefined {
  return raw.artists?.map(a => a.name).join(', ') || undefined;
}

/** Discogs tracklist → our Track rows, keeping index tracks' parts */
export function fromDiscogsTracklist(
  raw: DiscogsRawTrack[] | undefined
): Track[] {
  return (raw ?? []).map(track => {
    const row: Track = {
      position: track.position,
      title: track.title,
      duration: track.duration,
      artist: artistOf(track),
    };
    const parts = (track.sub_tracks ?? []).filter(
      p => p.title && p.type_ !== 'heading'
    );
    if (track.type_ !== 'index' || parts.length === 0) return row;

    const subTracks: Track[] = parts.map(p => ({
      position: p.position,
      title: p.title.trim(),
      duration: p.duration,
      artist: artistOf(p),
    }));
    let duration = track.duration;
    if (!parseDurationSeconds(duration)) {
      const seconds = subTracks.map(p => parseDurationSeconds(p.duration));
      if (seconds.every((s): s is number => s !== null)) {
        duration = formatDuration(seconds.reduce((a, b) => a + b, 0));
      }
    }
    return {
      ...row,
      position:
        row.position.trim() || indexTrackPosition(parts.map(p => p.position)),
      duration,
      subTracks,
    };
  });
}

/**
 * A cached release whose tracklist may have lost index tracks' parts: saved
 * before TRACKLIST_VERSION 2 with a position-less row that has a duration
 * (true headings usually have none; the few that do are re-fetched once)
 */
export function needsTracklistRefetch(release: {
  tracklistVersion?: number;
  tracklist?: Track[];
}): boolean {
  if ((release.tracklistVersion ?? 1) >= TRACKLIST_VERSION) return false;
  return (release.tracklist ?? []).some(
    t => isTracklistHeading(t) && !!t.duration?.trim()
  );
}

/**
 * The tracks to scrobble for the selected rows, in tracklist order. Headings
 * are skipped (unless no row has a position). A track with parts is one track, unless its index is in
 * `split`: then each part is scrobbled, sharing the track's duration when
 * the parts have none of their own.
 */
export function tracksToScrobble(
  tracklist: Track[] | undefined,
  selected: Iterable<number>,
  split: ReadonlySet<number> = new Set()
): Track[] {
  const rows = tracklist ?? [];
  // A tracklist with no positions at all is all tracks, not all headings
  const unnumbered = rows.every(isTracklistHeading);
  const indices = Array.from(new Set(selected))
    .filter(i => rows[i] && (unnumbered || !isTracklistHeading(rows[i])))
    .sort((a, b) => a - b);
  const result: Track[] = [];
  for (const i of indices) {
    const track = rows[i];
    const parts = track.subTracks ?? [];
    if (!split.has(i) || parts.length === 0) {
      result.push({
        position: track.position,
        title: track.title,
        duration: track.duration,
        artist: track.artist,
      });
      continue;
    }
    const total = parseDurationSeconds(track.duration);
    const known = parts.map(p => parseDurationSeconds(p.duration));
    const knownSum = known.reduce<number>((sum, s) => sum + (s ?? 0), 0);
    const unknown = known.filter(s => s === null).length;
    const share =
      total !== null && unknown > 0 && total > knownSum
        ? (total - knownSum) / unknown
        : null;
    parts.forEach((part, n) => {
      const seconds = known[n] ?? share;
      result.push({
        position: part.position,
        title: part.title,
        duration: seconds ? formatDuration(seconds) : undefined,
        artist: part.artist || track.artist,
      });
    });
  }
  return result;
}

/** Seconds a track takes, for scrobble timing */
export function trackSeconds(track: Pick<Track, 'duration'>): number {
  return parseDurationSeconds(track.duration) ?? DEFAULT_TRACK_SECONDS;
}

/**
 * Titles to match plays against: every track, plus the parts of tracks
 * that have them (a play may name "Storm" or "Gathering Storm")
 */
export function tracklistMatchTitles(
  tracklist: Track[] | undefined
): Array<{ position: string; title: string }> {
  const titles: Array<{ position: string; title: string }> = [];
  for (const track of tracklist ?? []) {
    if (isTracklistHeading(track) || !track.title) continue;
    titles.push({ position: track.position, title: track.title });
    for (const part of track.subTracks ?? []) {
      if (part.title)
        titles.push({ position: part.position, title: part.title });
    }
  }
  return titles;
}
