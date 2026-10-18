import {
  formatReleaseDate,
  isInReleaseWindow,
  isUpcomingRelease,
  releaseWindowStart,
} from '../../../src/shared/utils/releaseWindow';

describe('releaseWindow', () => {
  const now = new Date(2026, 9, 18, 12, 0); // 18 Oct 2026, local time

  it('starts the window two months before today', () => {
    expect(releaseWindowStart(now)).toBe('2026-08-18');
  });

  it('clamps to the last day of a shorter month', () => {
    expect(releaseWindowStart(new Date(2026, 7, 31))).toBe('2026-06-30');
    expect(releaseWindowStart(new Date(2026, 3, 30))).toBe('2026-02-28');
    expect(releaseWindowStart(new Date(2028, 3, 30))).toBe('2028-02-29');
    expect(releaseWindowStart(new Date(2026, 0, 15))).toBe('2025-11-15');
  });

  it('keeps releases from the window, upcoming ones and undated ones', () => {
    expect(isInReleaseWindow('2026-08-18', now)).toBe(true);
    expect(isInReleaseWindow('2026-12-04', now)).toBe(true);
    expect(isInReleaseWindow(undefined, now)).toBe(true);
    expect(isInReleaseWindow('2026-08-17', now)).toBe(false);
  });

  it('judges partial dates by the latest day they could mean', () => {
    expect(isInReleaseWindow('2026-08', now)).toBe(true);
    expect(isInReleaseWindow('2026-07', now)).toBe(false);
    expect(isInReleaseWindow('2026', now)).toBe(true);
    expect(isInReleaseWindow('2025', now)).toBe(false);
  });

  it('treats only dates after today as upcoming', () => {
    expect(isUpcomingRelease('2026-10-19', now)).toBe(true);
    expect(isUpcomingRelease('2026-10-18', now)).toBe(false);
    expect(isUpcomingRelease('2026-04-10', now)).toBe(false);
    expect(isUpcomingRelease('2026-11', now)).toBe(true);
    expect(isUpcomingRelease('2026', now)).toBe(false);
    expect(isUpcomingRelease(undefined, now)).toBe(false);
  });

  it('formats dates locally, keeping their precision', () => {
    const local = (y: number, m: number, d?: number) =>
      new Date(y, m, d ?? 1).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        ...(d ? { day: 'numeric' } : {}),
      });
    expect(formatReleaseDate('2026-10-19')).toBe(local(2026, 9, 19));
    expect(formatReleaseDate('2026-10')).toBe(local(2026, 9));
    expect(formatReleaseDate('2026')).toBe('2026');
    expect(formatReleaseDate(null)).toBe('Unknown');
  });
});
