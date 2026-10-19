import { CrateRuleField, CrateSort, CrateTemplate } from './types';

/**
 * Copy-level fields describe one owned copy. All copy-level rules of a crate
 * must be met by a single copy, the witness (plan section 4.3).
 */
export const CRATE_COPY_FIELDS: ReadonlySet<CrateRuleField> = new Set([
  'format',
  'pressingYear',
  'dateAdded',
  'artist',
  'genre',
  'style',
  'rating',
  'runtime',
  'discardPile',
]);

/** Listening fields describe the album as a whole */
export const CRATE_LISTENING_FIELDS: ReadonlySet<CrateRuleField> = new Set([
  'scrobbleCount',
  'scrobblesInPeriod',
  'lastRecordedPlay',
  'playsSinceAdded',
]);

/** Every sort a crate can have, in the order the sort menus list them */
export const CRATE_SORTS: readonly CrateSort[] = [
  'artist',
  'album',
  'scrobblesDesc',
  'scrobblesAsc',
  'lastPlayedAsc',
  'lastPlayedDesc',
  'dateAddedDesc',
  'dateAddedAsc',
  'yearAsc',
  'yearDesc',
  'runtimeAsc',
  'runtimeDesc',
];

export const CRATE_MAX_RULES = 20;
export const CRATE_NAME_MAX_LENGTH = 80;

/** Starter templates (plan section 4.5) */
export const CRATE_TEMPLATES: CrateTemplate[] = [
  {
    id: 'top-quiet-year',
    name: 'Most scrobbled, none this year',
    description:
      'Your top 20% of owned albums by recorded scrobbles, used as a stand-in for favourites, with no scrobbles recorded since January 1. Discogs ratings are used only if you add a rating rule.',
    rules: [
      { id: 'top', field: 'scrobbleCount', op: 'topPercent', percent: 20 },
      {
        id: 'quiet',
        field: 'scrobblesInPeriod',
        period: { kind: 'calendarYear' },
        op: 'none',
      },
      { id: 'discard', field: 'discardPile', op: 'exclude' },
    ],
    sort: 'scrobblesDesc',
  },
  {
    id: 'added-no-scrobbles',
    name: 'Recently added to Discogs, no scrobbles since',
    description:
      'Added to Discogs in the last 90 days, with no scrobbles recorded since. Added to Discogs is not always when you got a record: some days you may have catalogued many at once.',
    rules: [
      { id: 'added', field: 'dateAdded', op: 'withinDays', days: 90 },
      { id: 'since', field: 'playsSinceAdded', op: 'none' },
      { id: 'discard', field: 'discardPile', op: 'exclude' },
    ],
    sort: 'dateAddedDesc',
  },
  {
    id: 'jazz-40',
    name: 'Jazz in 40 minutes',
    description:
      'Jazz records that fit into 40 minutes, where Discogs lists track durations. Records without durations are counted separately.',
    rules: [
      { id: 'genre', field: 'genre', op: 'anyOf', values: ['Jazz'] },
      {
        id: 'runtime',
        field: 'runtime',
        op: 'atMost',
        minutes: 40,
        ifUnknown: 'exclude',
      },
      { id: 'discard', field: 'discardPile', op: 'exclude' },
    ],
    sort: 'runtimeAsc',
  },
  {
    id: 'dusty-shelf',
    name: 'Dusty shelf',
    description:
      'Owned albums with no scrobbles recorded in the last year, including ones with none recorded at all.',
    rules: [
      {
        id: 'dusty',
        field: 'lastRecordedPlay',
        op: 'olderThanDays',
        days: 365,
        includeNoRecordedPlays: true,
      },
      { id: 'discard', field: 'discardPile', op: 'exclude' },
    ],
    sort: 'lastPlayedAsc',
  },
];
