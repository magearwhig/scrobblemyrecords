import { Track } from '../types';

/** Total running time of a release from its Discogs tracklist */
export interface ReleaseRuntime {
  /** Sum of parsed durations */
  knownSeconds: number;
  /** Tracks with a non-empty position (headings excluded) */
  trackCount: number;
  tracksWithDuration: number;
  /** trackCount > 0 && tracksWithDuration === trackCount */
  complete: boolean;
}

/** Parse "M:SS" or "H:MM:SS" into seconds; null when not a duration */
export function parseDurationSeconds(
  duration: string | undefined
): number | null {
  if (!duration) return null;
  const parts = duration.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every(p => /^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const seconds =
    nums.length === 3
      ? nums[0] * 3600 + nums[1] * 60 + nums[2]
      : nums[0] * 60 + nums[1];
  return seconds > 0 ? seconds : null;
}

/**
 * Runtime of a tracklist. Rows with an empty position are headings (e.g.
 * "Side A") and are skipped.
 */
export function computeReleaseRuntime(
  tracklist: Track[] | undefined
): ReleaseRuntime {
  let knownSeconds = 0;
  let trackCount = 0;
  let tracksWithDuration = 0;
  for (const track of tracklist ?? []) {
    if (!track.position || !track.position.trim()) continue;
    trackCount++;
    const seconds = parseDurationSeconds(track.duration);
    if (seconds !== null) {
      knownSeconds += seconds;
      tracksWithDuration++;
    }
  }
  return {
    knownSeconds,
    trackCount,
    tracksWithDuration,
    complete: trackCount > 0 && tracksWithDuration === trackCount,
  };
}
