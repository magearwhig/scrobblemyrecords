import { CRATE_TEMPLATES } from '../../../src/shared/crateTemplates';
import {
  CRATE_PHRASES,
  CRATE_PHRASE_TOPICS,
  CratePhraseKey,
  formatCount,
  formatCrateDate,
  formatCrateMonth,
  formatRelative,
  formatRuntime,
  formatSpan,
  joinPhrases,
  phrase,
  phraseCount,
  phraseSlots,
  withNote,
} from '../../../src/shared/utils/crateCopy';

/** Fixture values for every slot name */
const SLOTS: Record<string, string | number> = {
  count: 12,
  date: 'Sep 14, 2026',
  month: 'Feb 2005',
  values: 'Jazz, Soul',
  format: 'Vinyl',
  artist: 'The Wedding Present',
  genres: 'Rock, Pop',
  styles: 'Post-Punk, Indie Rock',
  year: '2023',
  from: '1990',
  to: '1999',
  range: 'between 1990 and 1999',
  span: '12 months',
  limit: '40 minutes',
  runtime: '38:12',
  known: '24:10',
  timed: 6,
  total: 9,
  percent: 20,
  rank: 37,
  rankOf: 1150,
  scrobbles: '412 scrobbles',
  value: 3,
  min: 4,
  max: 50,
  period: 'since Jan 1, 2026',
  relative: '2 hours ago',
  reason: 'runtime unknown',
  name: 'Wedding Present',
  style: 'Post-Punk',
  genre: 'Jazz',
  decade: '1990',
  read: 3,
  expected: 12,
  first: 'Jazz, Soul',
  last: 'Funk',
  text: 'Bizarro (Deluxe)',
  names: '"Bizarro (Deluxe)"',
};

/** Per-phrase fixtures where the generic value would read oddly */
const OVERRIDES: Partial<
  Record<CratePhraseKey, Record<string, string | number>>
> = {
  'count.minutes.other': { count: 40 },
  'coverage.runtimeKnown': { count: 812, total: 1150 },
  'coverage.genreKnown': { count: 1020, total: 1150 },
  'coverage.rated': { count: 0, total: 1150 },
  'span.days.other': { count: 90 },
  'span.years.other': { count: 2 },
  'relative.days.other': { count: 7 },
  'relative.hours.other': { count: 2 },
  'relative.minutes.other': { count: 45 },
  'range.date.between': { from: 'Jan 1, 2026', to: 'Mar 1, 2026' },
  'range.date.from': { from: 'Jan 1, 2026' },
  'range.date.to': { to: 'Mar 1, 2026' },
  'period.since': { date: 'Jun 1, 2020' },
  'rule.format.is': { values: 'Vinyl' },
  'rule.format.anyOf': { values: 'Vinyl, Cassette' },
  'rule.format.isNot': { values: 'CD' },
  'rule.format.noneOf': { values: 'CD, File' },
  'rule.artist.is': { values: 'The Wedding Present' },
  'rule.artist.anyOf': { values: 'The Wedding Present, Cinerama' },
  'rule.genre.is': { values: 'Jazz' },
  'rule.genre.isNot': { values: 'Jazz' },
  'rule.style.is': { values: 'Post-Punk' },
  'rule.style.anyOf': { values: 'Post-Punk, Indie Rock' },
  'rule.style.isNot': { values: 'Post-Punk' },
  'rule.style.noneOf': { values: 'Free Jazz, Noise' },
  'rule.dateAdded.withinDays': { span: '90 days' },
  'rule.dateAdded.olderThanDays': { span: '2 years' },
  'rule.dateAdded.range': { range: 'between Jan 1, 2026 and Mar 1, 2026' },
  'rule.rating.atLeast': { value: 4 },
  'rule.rating.exactly': { value: 5 },
  'rule.runtime.between': { min: 30, max: 45 },
  'rule.scrobbleCount.atLeast.other': { count: 100 },
  'rule.scrobbleCount.atMost.other': { count: 5 },
  'rule.scrobblesInPeriod.none': { period: 'in the last 12 months' },
  'rule.scrobblesInPeriod.atLeast.one': { period: 'in the last 90 days' },
  'rule.scrobblesInPeriod.atLeast.other': {
    count: 10,
    period: 'in the last 90 days',
  },
  'rule.scrobblesInPeriod.atMost.one': { period: 'in the last 30 days' },
  'rule.scrobblesInPeriod.atMost.other': {
    count: 2,
    period: 'in the last 30 days',
  },
  'rule.lastRecordedPlay.olderThanDays': { span: '12 months' },
  'rule.lastRecordedPlay.olderThanDaysRecorded': { span: '2 years' },
  'rule.lastRecordedPlay.withinDays': { span: '30 days' },
  'rule.playsSinceAdded.atLeast.other': { count: 3 },
  'reason.format.noMatch.anyOf': { format: 'CD', values: 'Vinyl or Cassette' },
  'reason.format.noMatch.noneOf': { format: 'CD' },
  'reason.artist.noMatch': { values: 'Cinerama' },
  'reason.genre.match': { values: 'Jazz' },
  'reason.genre.noMatch.anyOf': { genres: 'Rock, Pop', values: 'Jazz or Soul' },
  'reason.genre.noMatch.noneOf': { values: 'Jazz' },
  'reason.style.match': { values: 'Post-Punk' },
  'reason.style.noMatch.anyOf': { styles: 'Indie Rock', values: 'Post-Punk' },
  'reason.style.noMatch.noneOf': { values: 'Free Jazz and Noise' },
  'reason.pressingYear.noMatch': { year: '2023' },
  'reason.dateAdded.noMatch.withinDays': {
    date: 'Mar 1, 2024',
    span: '90 days',
  },
  'reason.dateAdded.noMatch.range': {
    range: 'between Jan 1, 2026 and Mar 1, 2026',
  },
  'reason.rating.match': { value: 5 },
  'reason.runtime.complete.one': { runtime: '3:12' },
  'reason.runtime.complete.other': { count: 9 },
  'reason.runtime.outside': { min: 30, max: 40, runtime: '52:10' },
  'reason.runtime.tooLong': { runtime: '52:10' },
  'reason.runtime.tooShort': { runtime: '24:05' },
  'reason.runtime.partialOver': { known: '44:10' },
  'reason.runtime.partialAtLeast': { known: '44:10' },
  'reason.scrobbles.count.other': { count: 1412 },
  'reason.scrobbles.fewerThan.one': { value: 100 },
  'reason.scrobbles.fewerThan.other': { value: 100 },
  'reason.scrobbles.moreThan.other': { value: 5, count: 412 },
  'reason.scrobbles.notTop': { scrobbles: '3 scrobbles', rank: 900 },
  'reason.period.count.other': { count: 3 },
  'reason.period.fewerThan.one': { value: 10, period: 'in the last 90 days' },
  'reason.period.fewerThan.other': {
    value: 10,
    count: 4,
    period: 'in the last 90 days',
  },
  'reason.period.moreThan.other': { value: 1 },
  'reason.lastScrobble': { date: 'May 2, 2023' },
  'reason.lastScrobble.fragment': { date: 'Nov 3, 2025' },
  'reason.lastScrobble.recent': { date: 'Oct 1, 2026' },
  'reason.lastScrobble.old': { date: 'May 2, 2023', span: '90 days' },
  'reason.sinceAdded.count.other': { count: 3 },
  'reason.sinceAdded.fewerThan.one': { value: 10 },
  'reason.sinceAdded.fewerThan.other': { value: 10, count: 3 },
  'reason.sinceAdded.before.one': { month: 'Mar 2024' },
  'reason.sinceAdded.before.other': { count: 23, month: 'Mar 2024' },
  'unknownCount.line.other': { count: 31 },
  'coverage.banner.stale': { date: 'Oct 11, 2026' },
  'coverage.newestScrobble': { date: 'Oct 9, 2026' },
  'suggestion.styleQuiet.description': { span: '12 months' },
  'suggestion.topQuiet.name': { span: '2 years' },
  'suggestion.topQuiet.description': { span: '2 years' },
  'suggestion.addedQuiet.name': { span: '90 days' },
  'suggestion.addedQuiet.description': { span: '90 days' },
  'suggestion.reason.ownStyle.other': { count: 23 },
  'suggestion.reason.ownDecade.other': { count: 140 },
  'suggestion.reason.topSet.other': { count: 230 },
  'suggestion.reason.addedSet.one': { span: '90 days' },
  'suggestion.reason.addedSet.other': { span: '90 days', count: 6 },
  'suggestion.reason.quiet.other': { count: 15 },
  'suggestion.reason.quietSinceAdded.other': { count: 5 },
  'suggestion.reason.ownTimed.other': { count: 18 },
  'suggestion.reason.fits.other': { count: 7 },
  'suggestion.reason.template.other': { count: 41 },
};

const KEYS = Object.keys(CRATE_PHRASES) as CratePhraseKey[];

function fixtureSlots(key: CratePhraseKey): Record<string, string | number> {
  const slots: Record<string, string | number> = {};
  for (const name of phraseSlots(key)) {
    const value = OVERRIDES[key]?.[name] ?? SLOTS[name];
    if (value === undefined) throw new Error(`No fixture for {${name}}`);
    slots[name] = value;
  }
  return slots;
}

/** Template text with slots removed, so user data never fails a check */
function fixedText(text: string): string {
  return text.replace(/\{\w+\}/g, ' ');
}

const BANNED = [
  'played',
  'heard',
  'listened',
  'spun',
  'first listen',
  'arrived',
  'bought',
  'purchased',
  'unplayed',
  'vinyl play',
  'never listened',
  'on the turntable',
];

function bannedWordsIn(text: string): string[] {
  return BANNED.filter(word =>
    new RegExp(`\\b${word.replace(/ /g, '\\s+')}\\b`, 'i').test(text)
  );
}

describe('crateCopy', () => {
  describe('reviewed allow-list', () => {
    it('renders every phrase template (human-reviewed snapshot)', () => {
      const rendered: Record<string, string> = {};
      for (const key of KEYS) rendered[key] = phrase(key, fixtureSlots(key));
      expect(rendered).toMatchSnapshot();
    });

    it('renders the starter template names and descriptions (human-reviewed snapshot)', () => {
      expect(
        CRATE_TEMPLATES.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
        }))
      ).toMatchSnapshot();
    });
  });

  describe('semantic checks', () => {
    it.each(KEYS)('%s uses no listening or purchase verbs', key => {
      expect(bannedWordsIn(fixedText(CRATE_PHRASES[key]))).toEqual([]);
    });

    it.each(KEYS)('%s is plain text in sentence case', key => {
      const text: string = CRATE_PHRASES[key];
      // No emoji or pictographs
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      // Sentence case: no Title Case runs of three capitalised words
      expect(fixedText(text)).not.toMatch(
        /\b(?!Last\.fm|Discogs|Jan)[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+\b/
      );
    });

    const topicKeys = Object.keys(CRATE_PHRASE_TOPICS) as CratePhraseKey[];

    it('classifies only existing phrases', () => {
      for (const key of topicKeys) expect(KEYS).toContain(key);
    });

    it.each(
      topicKeys.filter(k => CRATE_PHRASE_TOPICS[k]?.includes('listening'))
    )('%s (listening) mentions scrobbles', key => {
      expect(fixedText(CRATE_PHRASES[key]).toLowerCase()).toContain('scrobble');
    });

    it.each(
      topicKeys.filter(k => CRATE_PHRASE_TOPICS[k]?.includes('dateAdded'))
    )('%s (date added) says added to Discogs', key => {
      expect(fixedText(CRATE_PHRASES[key])).toMatch(/[Aa]dded to Discogs/);
    });

    it('treats every phrase mentioning scrobbles as a listening phrase', () => {
      const unclassified = KEYS.filter(
        k =>
          /scrobble/i.test(fixedText(CRATE_PHRASES[k])) &&
          !CRATE_PHRASE_TOPICS[k]?.includes('listening')
      );
      expect(unclassified).toEqual([]);
    });

    it('treats every phrase mentioning Discogs dates as a date-added phrase', () => {
      const unclassified = KEYS.filter(
        k =>
          /added to Discogs/i.test(CRATE_PHRASES[k]) &&
          !CRATE_PHRASE_TOPICS[k]?.includes('dateAdded')
      );
      expect(unclassified).toEqual([]);
    });

    it('excludes slot values from the checks', () => {
      const text = phrase('reason.style.match', { values: 'Heard It Played' });
      expect(bannedWordsIn(text)).toEqual(['played', 'heard']);
      expect(
        bannedWordsIn(fixedText(CRATE_PHRASES['reason.style.match']))
      ).toEqual([]);
    });

    describe('starter templates', () => {
      it.each(CRATE_TEMPLATES.map(t => [t.id, t] as const))(
        '%s uses no listening or purchase verbs',
        (_, template) => {
          expect(bannedWordsIn(template.name)).toEqual([]);
          // Genre names in descriptions ("Jazz") are not verbs, so no slot stripping is needed
          expect(bannedWordsIn(template.description)).toEqual([]);
        }
      );

      it.each(
        CRATE_TEMPLATES.filter(t =>
          t.rules.some(r =>
            [
              'scrobbleCount',
              'scrobblesInPeriod',
              'lastRecordedPlay',
              'playsSinceAdded',
            ].includes(r.field)
          )
        ).map(t => [t.id, t] as const)
      )('%s (listening) describes recorded scrobbles', (_, template) => {
        expect(template.description.toLowerCase()).toContain('scrobble');
      });

      it.each(
        CRATE_TEMPLATES.filter(t =>
          t.rules.some(r => r.field === 'dateAdded')
        ).map(t => [t.id, t] as const)
      )('%s (date added) says added to Discogs', (_, template) => {
        expect(template.name).toMatch(/[Aa]dded to Discogs/);
        expect(template.description).toMatch(/[Aa]dded to Discogs/);
      });
    });
  });

  describe('phrase', () => {
    it('fills slots and formats numbers with thousands separators', () => {
      expect(phrase('count.scrobbles.other', { count: 1150 })).toBe(
        '1,150 scrobbles'
      );
      expect(phrase('copy.pressing', { year: '2023' })).toBe('2023 pressing');
    });

    it('throws on a missing slot', () => {
      expect(() => phrase('copy.pressing')).toThrow(/missing slot \{year\}/);
    });

    it('throws on an unknown slot', () => {
      expect(() => phrase('membership.rules', { date: 'Oct 2, 2026' })).toThrow(
        /has no slot \{date\}/
      );
    });

    it('renders an empty slot instead of throwing in production', () => {
      const env = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect(phrase('copy.pressing')).toBe(' pressing');
      } finally {
        process.env.NODE_ENV = env;
      }
    });

    it('picks the singular or plural form', () => {
      expect(phraseCount('count.scrobbles', 1)).toBe('1 scrobble');
      expect(phraseCount('count.scrobbles', 0)).toBe('0 scrobbles');
      expect(phraseCount('count.scrobbles', 412)).toBe('412 scrobbles');
      expect(phraseCount('span.years', 2)).toBe('2 years');
    });
  });

  describe('helpers', () => {
    it('joins rendered phrases', () => {
      expect(joinPhrases('Format: Vinyl', undefined, '', '2023 pressing')).toBe(
        'Format: Vinyl · 2023 pressing'
      );
      expect(withNote('No scrobbles recorded', 'history starts Feb 2005')).toBe(
        'No scrobbles recorded (history starts Feb 2005)'
      );
      expect(withNote('No scrobbles recorded', undefined)).toBe(
        'No scrobbles recorded'
      );
    });

    it('formats counts, runtimes and spans', () => {
      expect(formatCount(1150)).toBe('1,150');
      expect(formatCount(12.5)).toBe('12.5');
      expect(formatRuntime(38 * 60 + 12)).toBe('38:12');
      expect(formatRuntime(3725)).toBe('1:02:05');
      expect(formatRuntime(5)).toBe('0:05');
      expect(formatSpan(90)).toBe('90 days');
      expect(formatSpan(1)).toBe('1 day');
      expect(formatSpan(365)).toBe('12 months');
      expect(formatSpan(730)).toBe('2 years');
    });

    it('formats dates in local time', () => {
      expect(formatCrateDate(new Date(2026, 8, 14, 23, 30).getTime())).toBe(
        'Sep 14, 2026'
      );
      // A bare ISO date is a local day, whatever the machine's time zone
      expect(formatCrateDate('2026-01-01')).toBe('Jan 1, 2026');
      expect(formatCrateDate('2026-09-14T08:00:00')).toBe('Sep 14, 2026');
      expect(formatCrateMonth(new Date(2005, 1, 20).getTime())).toBe(
        'Feb 2005'
      );
      expect(formatCrateDate('not a date')).toBe('not a date');
    });

    it('formats relative times', () => {
      const now = new Date(2026, 9, 18, 12, 0);
      const ago = (ms: number) => formatRelative(now.getTime() - ms, now);
      expect(ago(10_000)).toBe('just now');
      expect(ago(-60_000)).toBe('just now');
      expect(ago(60_000)).toBe('1 minute ago');
      expect(ago(45 * 60_000)).toBe('45 minutes ago');
      expect(ago(60 * 60_000)).toBe('1 hour ago');
      expect(ago(2 * 60 * 60_000)).toBe('2 hours ago');
      expect(ago(24 * 60 * 60_000)).toBe('1 day ago');
      expect(ago(5 * 24 * 60 * 60_000)).toBe('5 days ago');
    });
  });
});
