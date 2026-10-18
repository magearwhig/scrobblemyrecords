/**
 * Which tracked releases are recent enough to show on New Releases.
 *
 * MusicBrainz dates can be partial ("2026", "2026-10"); they are compared as
 * YYYY-MM-DD strings using the earliest or latest day the date could mean.
 */

/** New Releases shows releases from this many months back, plus upcoming ones */
export const RELEASE_WINDOW_MONTHS = 2;

/** Local calendar date as YYYY-MM-DD */
function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Earliest day a (possibly partial) release date could mean */
function earliestDay(releaseDate: string): string {
  if (releaseDate.length === 4) return `${releaseDate}-01-01`;
  if (releaseDate.length === 7) return `${releaseDate}-01`;
  return releaseDate;
}

/** Latest day a (possibly partial) release date could mean */
function latestDay(releaseDate: string): string {
  if (releaseDate.length === 4) return `${releaseDate}-12-31`;
  if (releaseDate.length === 7) return `${releaseDate}-31`;
  return releaseDate;
}

/** First day of the window: today minus RELEASE_WINDOW_MONTHS */
export function releaseWindowStart(now: Date = new Date()): string {
  const start = new Date(now);
  start.setMonth(start.getMonth() - RELEASE_WINDOW_MONTHS);
  return toDateString(start);
}

/**
 * True when the release came out within the window or is still to come.
 * Releases without a date are kept, since their age is unknown.
 */
export function isInReleaseWindow(
  releaseDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!releaseDate) return true;
  return latestDay(releaseDate) >= releaseWindowStart(now);
}

/** True when the release date is after today (computed now, not at sync) */
export function isUpcomingRelease(
  releaseDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!releaseDate) return false;
  return earliestDay(releaseDate) > toDateString(now);
}
