import {
  isInReleaseWindow,
  isUpcomingRelease,
  releaseWindowStart,
} from '../../../src/renderer/utils/releaseWindow';

describe('releaseWindow', () => {
  const now = new Date(2026, 9, 18, 12, 0); // 18 Oct 2026, local time

  it('starts the window two months before today', () => {
    expect(releaseWindowStart(now)).toBe('2026-08-18');
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
});
