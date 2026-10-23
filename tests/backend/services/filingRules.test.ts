import {
  FILING_RETRY_MS,
  FilingSnapshot,
  creditParts,
  filingNameKey,
  isFilingEntryDue,
  isVariousCredit,
  masterYearOf,
  resolveArtistFiling,
} from '../../../src/backend/services/filing/filingRules';
import { ArtistFilingCacheEntry } from '../../../src/shared/types';

const found = (name: string, sortName: string): ArtistFilingCacheEntry => ({
  name,
  status: 'found',
  sortName,
  type: 'Person',
  mbid: 'mbid',
  via: 'search',
  fetchedAt: 0,
});

function snapshot(
  entries: ArtistFilingCacheEntry[] = [],
  overrides: Record<string, string> = {}
): FilingSnapshot {
  return {
    artists: Object.fromEntries(entries.map(e => [filingNameKey(e.name), e])),
    overrides: new Map(
      Object.entries(overrides).map(([artist, fileUnder]) => [
        filingNameKey(artist),
        { key: filingNameKey(artist), artist, fileUnder, updatedAt: 0 },
      ])
    ),
    masterYears: { '7': { year: 1987 }, '8': { year: null } },
  };
}

describe('filingNameKey', () => {
  it('folds case, spacing, curly apostrophes and Discogs suffixes', () => {
    expect(filingNameKey('  Tool (2) ')).toBe('tool');
    expect(filingNameKey('Guns N’ Roses')).toBe("guns n' roses");
    expect(filingNameKey('Elliott   Smith')).toBe('elliott smith');
    expect(filingNameKey('Turnstile (2), Someone (3)')).toBe(
      'turnstile, someone'
    );
  });

  it('matches MusicBrainz hyphens and "and" spellings', () => {
    expect(filingNameKey('Run\u2010DMC')).toBe(filingNameKey('Run-DMC'));
    expect(filingNameKey('Gil Scott\u2010Heron')).toBe('gil scott-heron');
    expect(filingNameKey('Belle & Sebastian')).toBe(
      filingNameKey('Belle and Sebastian')
    );
    expect(filingNameKey('AT&T')).toBe('at&t');
  });

  it('keeps "The" and punctuation, unlike release tracking', () => {
    expect(filingNameKey('The The')).not.toBe(filingNameKey('The'));
    expect(filingNameKey('Tyler, The Creator')).toBe('tyler, the creator');
  });
});

describe('isVariousCredit / creditParts', () => {
  it('recognises Discogs and Last.fm spellings of Various', () => {
    expect(isVariousCredit('Various')).toBe(true);
    expect(isVariousCredit('Various Artists')).toBe(true);
    expect(isVariousCredit('Various (2)')).toBe(true);
    expect(isVariousCredit('The Various')).toBe(false);
  });

  it('splits only at the ", " Discogs joins with', () => {
    expect(creditParts('Lou Reed, John Cale')).toEqual([
      'Lou Reed',
      'John Cale',
    ]);
    expect(creditParts('Simon & Garfunkel')).toEqual(['Simon & Garfunkel']);
    expect(creditParts('Prince And The Revolution')).toEqual([
      'Prince And The Revolution',
    ]);
    expect(creditParts('Turnstile (2), Someone')).toEqual([
      'Turnstile',
      'Someone',
    ]);
  });
});

describe('resolveArtistFiling', () => {
  it('uses the MusicBrainz sort name', () => {
    expect(
      resolveArtistFiling(
        'Elliott Smith',
        snapshot([found('Elliott Smith', 'Smith, Elliott')])
      )
    ).toEqual({
      sortName: 'Smith, Elliott',
      source: 'musicbrainz',
      filedAs: null,
      collaboration: null,
    });
  });

  it('prefers an override, matched ignoring case and suffixes', () => {
    const result = resolveArtistFiling(
      'Alice Cooper (2)',
      snapshot([found('Alice Cooper', 'Alice Cooper')], {
        'alice cooper': '  Cooper, Alice ',
      })
    );
    expect(result).toMatchObject({
      sortName: 'Cooper, Alice',
      source: 'override',
    });
  });

  it('ignores a blank override', () => {
    expect(
      resolveArtistFiling('Beck', snapshot([], { Beck: '   ' })).source
    ).toBe('default');
  });

  it('falls back to the credit itself', () => {
    expect(resolveArtistFiling('Modest Mouse', snapshot())).toEqual({
      sortName: 'Modest Mouse',
      source: 'default',
      filedAs: null,
      collaboration: null,
    });
  });

  it('files a not-found collaboration under its first artist', () => {
    const result = resolveArtistFiling(
      'Lou Reed, John Cale',
      snapshot([
        found('Lou Reed', 'Reed, Lou'),
        { name: 'Lou Reed, John Cale', status: 'not-found', fetchedAt: 0 },
      ])
    );
    expect(result).toEqual({
      sortName: 'Reed, Lou',
      source: 'musicbrainz',
      filedAs: 'Lou Reed',
      collaboration: 'John Cale',
    });
  });

  it("files a not-found collaboration under its first artist's own name when that has no filing", () => {
    const result = resolveArtistFiling(
      '!!!, Guest',
      snapshot([{ name: '!!!, Guest', status: 'not-found', fetchedAt: 0 }])
    );
    expect(result).toEqual({
      sortName: '!!!',
      source: 'default',
      filedAs: '!!!',
      collaboration: 'Guest',
    });
  });

  it('keeps a whole credit found on MusicBrainz, even with a comma', () => {
    expect(
      resolveArtistFiling(
        'Tyler, The Creator',
        snapshot([
          found('Tyler, The Creator', 'Tyler, The Creator'),
          found('Tyler', 'Tyler'),
        ])
      )
    ).toMatchObject({ sortName: 'Tyler, The Creator', filedAs: null });
  });

  it('never splits a credit whose lookup is missing or ambiguous', () => {
    const lou = found('Lou Reed', 'Reed, Lou');
    expect(
      resolveArtistFiling('Lou Reed, John Cale', snapshot([lou])).source
    ).toBe('default');
    expect(
      resolveArtistFiling(
        'Lou Reed, John Cale',
        snapshot([
          lou,
          { name: 'Lou Reed, John Cale', status: 'ambiguous', fetchedAt: 0 },
        ])
      ).source
    ).toBe('default');
  });
});

describe('masterYearOf', () => {
  it('reads cached years and treats unknown masters as null', () => {
    expect(masterYearOf(7, snapshot())).toBe(1987);
    expect(masterYearOf(8, snapshot())).toBeNull();
    expect(masterYearOf(9, snapshot())).toBeNull();
  });
});

describe('isFilingEntryDue', () => {
  const now = 10 * FILING_RETRY_MS;

  it('is due when missing', () => {
    expect(isFilingEntryDue(undefined, undefined, now)).toBe(true);
  });

  it('retries not-found and ambiguous results after the retry window', () => {
    for (const status of ['not-found', 'ambiguous'] as const) {
      const fresh = { name: 'x', status, fetchedAt: now - 1000 };
      const stale = { name: 'x', status, fetchedAt: now - FILING_RETRY_MS };
      expect(isFilingEntryDue(fresh, undefined, now)).toBe(false);
      expect(isFilingEntryDue(stale, undefined, now)).toBe(true);
    }
  });

  it('keeps search results, and refetches tracker results when the mapping changes', () => {
    const search = found('x', 'X');
    expect(isFilingEntryDue(search, 'other', now)).toBe(false);
    const viaMap: ArtistFilingCacheEntry = {
      name: 'x',
      status: 'found',
      sortName: 'X',
      type: null,
      mbid: 'mbid',
      via: 'mbid-map',
      fetchedAt: 0,
    };
    expect(isFilingEntryDue(viaMap, 'mbid', now)).toBe(false);
    expect(isFilingEntryDue(viaMap, 'changed', now)).toBe(true);
    expect(isFilingEntryDue(viaMap, undefined, now)).toBe(true);
  });

  it('keeps a "none of these" result until the user maps the artist', () => {
    const none: ArtistFilingCacheEntry = {
      name: 'x',
      status: 'none',
      mbid: null,
      fetchedAt: 0,
    };
    expect(isFilingEntryDue(none, null, now)).toBe(false);
    expect(isFilingEntryDue(none, 'mbid', now)).toBe(true);
    expect(isFilingEntryDue(none, undefined, now)).toBe(true);
  });
});
