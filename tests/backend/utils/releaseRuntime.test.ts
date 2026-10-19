import { Track } from '../../../src/shared/types';
import {
  computeReleaseRuntime,
  parseDurationSeconds,
} from '../../../src/shared/utils/releaseRuntime';

const track = (position: string, duration?: string): Track => ({
  position,
  title: `Track ${position}`,
  duration,
});

describe('parseDurationSeconds', () => {
  it('parses M:SS and H:MM:SS', () => {
    expect(parseDurationSeconds('3:45')).toBe(225);
    expect(parseDurationSeconds('12:05')).toBe(725);
    expect(parseDurationSeconds('1:02:03')).toBe(3723);
    expect(parseDurationSeconds(' 4:00 ')).toBe(240);
  });

  it('returns null for missing, zero or malformed durations', () => {
    expect(parseDurationSeconds(undefined)).toBeNull();
    expect(parseDurationSeconds('')).toBeNull();
    expect(parseDurationSeconds('0:00')).toBeNull();
    expect(parseDurationSeconds('180')).toBeNull();
    expect(parseDurationSeconds('3:4a')).toBeNull();
    expect(parseDurationSeconds('1:2:3:4')).toBeNull();
    expect(parseDurationSeconds('-3:00')).toBeNull();
  });
});

describe('computeReleaseRuntime', () => {
  it('sums a fully timed tracklist and skips headings', () => {
    expect(
      computeReleaseRuntime([
        track('', undefined), // "Side A" heading
        track('A1', '3:00'),
        track('A2', '4:30'),
        track(' ', '9:99'), // whitespace position is a heading too
        track('B1', '1:00:00'),
      ])
    ).toEqual({
      knownSeconds: 180 + 270 + 3600,
      trackCount: 3,
      tracksWithDuration: 3,
      complete: true,
    });
  });

  it('reports partial durations as incomplete with the known part', () => {
    expect(
      computeReleaseRuntime([track('1', '3:00'), track('2'), track('3', '')])
    ).toEqual({
      knownSeconds: 180,
      trackCount: 3,
      tracksWithDuration: 1,
      complete: false,
    });
  });

  it('is incomplete for an empty or missing tracklist', () => {
    const empty = {
      knownSeconds: 0,
      trackCount: 0,
      tracksWithDuration: 0,
      complete: false,
    };
    expect(computeReleaseRuntime(undefined)).toEqual(empty);
    expect(computeReleaseRuntime([])).toEqual(empty);
    expect(computeReleaseRuntime([track('', '3:00')])).toEqual(empty);
  });
});
