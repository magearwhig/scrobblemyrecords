import {
  normalizeForMatching,
  createNormalizedTrackKey,
} from '../../../src/shared/utils/trackNormalization';

describe('normalizeForMatching', () => {
  describe('bracket suffixes', () => {
    it('removes [Explicit]', () => {
      expect(normalizeForMatching('Request Denied [Explicit]')).toBe(
        'request denied'
      );
    });

    it('removes [Clean]', () => {
      expect(normalizeForMatching('Song Title [Clean]')).toBe('song title');
    });

    it('removes [Remastered]', () => {
      expect(normalizeForMatching('Classic Song [Remastered]')).toBe(
        'classic song'
      );
    });

    it('removes [Remaster]', () => {
      expect(normalizeForMatching('Classic Song [Remaster]')).toBe(
        'classic song'
      );
    });

    it('removes [Deluxe]', () => {
      expect(normalizeForMatching('Album [Deluxe]')).toBe('album');
    });

    it('removes [Deluxe Edition]', () => {
      expect(normalizeForMatching('Album [Deluxe Edition]')).toBe('album');
    });

    it('removes [Bonus Track]', () => {
      expect(normalizeForMatching('Hidden Song [Bonus Track]')).toBe(
        'hidden song'
      );
    });

    it('removes [Bonus Tracks]', () => {
      expect(normalizeForMatching('Album [Bonus Tracks]')).toBe('album');
    });

    it('removes [Anniversary Edition]', () => {
      expect(normalizeForMatching('Album [Anniversary Edition]')).toBe('album');
    });
  });

  describe('parenthesis suffixes', () => {
    it('removes (Explicit)', () => {
      expect(normalizeForMatching('Track (Explicit)')).toBe('track');
    });

    it('removes (Remastered 2021)', () => {
      expect(normalizeForMatching('Classic (Remastered 2021)')).toBe('classic');
    });

    it('removes (Remastered)', () => {
      expect(normalizeForMatching('Classic (Remastered)')).toBe('classic');
    });

    it('removes (Deluxe Edition)', () => {
      expect(normalizeForMatching('Album (Deluxe Edition)')).toBe('album');
    });

    it('removes (Deluxe)', () => {
      expect(normalizeForMatching('Album (Deluxe)')).toBe('album');
    });

    it('removes (Special Edition)', () => {
      expect(normalizeForMatching('Album (Special Edition)')).toBe('album');
    });

    it('removes (Expanded Edition)', () => {
      expect(normalizeForMatching('Album (Expanded Edition)')).toBe('album');
    });

    it('removes (25th Anniversary)', () => {
      expect(normalizeForMatching('Album (25th Anniversary)')).toBe('album');
    });

    it('removes "at XX" anniversary suffix', () => {
      expect(normalizeForMatching('Gentlemen at 21')).toBe('gentlemen');
    });
  });

  describe('featuring variations', () => {
    it('removes feat. at end', () => {
      expect(normalizeForMatching('Song feat. Artist')).toBe('song');
    });

    it('removes (feat. Artist)', () => {
      expect(normalizeForMatching('Song (feat. Artist)')).toBe('song');
    });

    it('removes [feat. Artist]', () => {
      expect(normalizeForMatching('Song [feat. Artist]')).toBe('song');
    });
  });

  describe('case normalization', () => {
    it('converts to lowercase', () => {
      expect(normalizeForMatching('El-P')).toBe('el-p');
    });

    it('handles mixed case', () => {
      expect(normalizeForMatching('LOUD SONG')).toBe('loud song');
    });

    it('preserves hyphens', () => {
      expect(normalizeForMatching('Run-DMC')).toBe('run-dmc');
    });
  });

  describe('whitespace normalization', () => {
    it('normalizes multiple spaces', () => {
      expect(normalizeForMatching('Song   Title')).toBe('song title');
    });

    it('trims leading/trailing spaces', () => {
      expect(normalizeForMatching('  Song  ')).toBe('song');
    });

    it('handles tabs and newlines', () => {
      expect(normalizeForMatching('Song\tTitle\n')).toBe('song title');
    });
  });

  describe('quote normalization', () => {
    it('removes double quotes', () => {
      expect(normalizeForMatching('"Quoted"')).toBe('quoted');
    });

    it('removes single quotes', () => {
      expect(normalizeForMatching("'Single'")).toBe('single');
    });

    it('removes curly quotes', () => {
      expect(normalizeForMatching('"Curly"')).toBe('curly');
    });
  });

  describe('combined normalizations', () => {
    it('handles multiple suffixes', () => {
      expect(normalizeForMatching('Song [Explicit] (Remastered 2021)')).toBe(
        'song'
      );
    });

    it('handles real-world El-P example', () => {
      const lastfm = normalizeForMatching('Request Denied');
      const discogs = normalizeForMatching('Request Denied [Explicit]');
      expect(lastfm).toBe(discogs);
    });

    it('handles real-world album example', () => {
      const lastfm = normalizeForMatching('Cancer 4 Cure');
      const discogs = normalizeForMatching('Cancer 4 Cure [Explicit]');
      expect(lastfm).toBe(discogs);
    });

    it('handles Afghan Whigs Gentlemen at 21 example', () => {
      const original = normalizeForMatching('Gentlemen');
      const anniversary = normalizeForMatching('Gentlemen at 21');
      expect(original).toBe(anniversary);
    });
  });
});

describe('createNormalizedTrackKey', () => {
  it('creates key from artist, album, track', () => {
    const key = createNormalizedTrackKey('Artist', 'Album', 'Track');
    expect(key).toBe('artist|album|track');
  });

  it('normalizes all components', () => {
    const key = createNormalizedTrackKey(
      'El-P',
      'Cancer 4 Cure [Explicit]',
      'Request Denied [Explicit]'
    );
    expect(key).toBe('el-p|cancer 4 cure|request denied');
  });

  it('produces same key for Last.fm and Discogs versions', () => {
    const lastfmKey = createNormalizedTrackKey(
      'El-p',
      'Cancer 4 Cure',
      'Request Denied'
    );
    const discogsKey = createNormalizedTrackKey(
      'El-P',
      'Cancer 4 Cure [Explicit]',
      'Request Denied [Explicit]'
    );
    expect(lastfmKey).toBe(discogsKey);
  });

  it('handles empty strings', () => {
    const key = createNormalizedTrackKey('Artist', '', 'Track');
    expect(key).toBe('artist||track');
  });

  it('handles remastered albums', () => {
    const original = createNormalizedTrackKey(
      'Artist',
      'Classic Album',
      'Great Song'
    );
    const remastered = createNormalizedTrackKey(
      'Artist',
      'Classic Album (Remastered 2020)',
      'Great Song'
    );
    expect(original).toBe(remastered);
  });
});
