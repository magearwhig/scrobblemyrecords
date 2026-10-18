/**
 * Reviewed user-facing copy for Smart Crates (plan section 8.4).
 *
 * Every crate and suggestion string shown to the user is rendered from one of
 * these phrase templates. Templates have named `{slot}` placeholders; slot
 * values are data (genre, artist, dates, counts) or other rendered phrases.
 * Code never concatenates free text into copy. Rendered phrases may be joined
 * with `joinPhrases` (" · "), `joinSentences` (" ") or `withNote` (" (...)").
 *
 * `tests/backend/utils/__snapshots__/crateCopy.test.ts.snap` is the
 * human-reviewed allow-list: changing or adding a phrase fails that test until
 * the snapshot is reviewed and updated.
 *
 * Honesty rules (plan section 8.1): listening copy talks about recorded
 * scrobbles, never about playing, hearing or buying a record; date-added copy
 * says "Added to Discogs".
 */

export const CRATE_PHRASES = {
  // ---- Counts (plural pairs: `<base>.one` / `<base>.other`) ----
  'count.scrobbles.one': '1 scrobble',
  'count.scrobbles.other': '{count} scrobbles',
  'count.minutes.one': '1 minute',
  'count.minutes.other': '{count} minutes',

  // ---- Spans of time ("the last {span}") ----
  'span.days.one': '1 day',
  'span.days.other': '{count} days',
  'span.year': '12 months',
  'span.years.other': '{count} years',

  // ---- Relative time ----
  'relative.justNow': 'just now',
  'relative.minutes.one': '1 minute ago',
  'relative.minutes.other': '{count} minutes ago',
  'relative.hours.one': '1 hour ago',
  'relative.hours.other': '{count} hours ago',
  'relative.days.one': '1 day ago',
  'relative.days.other': '{count} days ago',

  // ---- Ranges ----
  'range.year.between': 'between {from} and {to}',
  'range.year.exact': '{year}',
  'range.year.from': '{from} or later',
  'range.year.to': '{to} or earlier',
  'range.date.between': 'between {from} and {to}',
  'range.date.from': 'on or after {from}',
  'range.date.to': 'on or before {to}',

  // ---- Periods for scrobble rules ----
  'period.sinceJan1': 'since Jan 1',
  'period.since': 'since {date}',
  'period.last': 'in the last {span}',

  // ---- Lists of values ----
  'list.or': '{first} or {last}',
  'list.and': '{first} and {last}',
  quote: '"{text}"',

  // ---- Witness copy ----
  'copy.pressing': '{year} pressing',

  // ---- Notes ----
  'note.historyStarts': 'history starts {month}',
  'note.ifUnknownInclude': 'missing data counts as a match',

  // ---- Rule descriptions (builder and summary) ----
  'rule.format.is': 'Format is {values}',
  'rule.format.anyOf': 'Format is any of {values}',
  'rule.format.isNot': 'Format is not {values}',
  'rule.format.noneOf': 'Format is none of {values}',
  'rule.artist.is': 'Artist is {values}',
  'rule.artist.anyOf': 'Artist is any of {values}',
  'rule.genre.is': 'Genre is {values}',
  'rule.genre.anyOf': 'Genre is any of {values}',
  'rule.genre.isNot': 'Genre is not {values}',
  'rule.genre.noneOf': 'Genre is none of {values}',
  'rule.style.is': 'Style is {values}',
  'rule.style.anyOf': 'Style is any of {values}',
  'rule.style.isNot': 'Style is not {values}',
  'rule.style.noneOf': 'Style is none of {values}',
  'rule.pressingYear.range': 'Pressing year {range}',
  'rule.pressingYear.any': 'Pressing year listed on Discogs',
  'rule.dateAdded.withinDays': 'Added to Discogs in the last {span}',
  'rule.dateAdded.olderThanDays': 'Added to Discogs more than {span} ago',
  'rule.dateAdded.range': 'Added to Discogs {range}',
  'rule.dateAdded.any': 'Added to Discogs on any date',
  'rule.rating.atLeast': 'Rated {value} or higher on Discogs',
  'rule.rating.exactly': 'Rated {value} on Discogs',
  'rule.rating.isUnrated': 'Not rated on Discogs',
  'rule.runtime.atMost': 'Runtime {limit} or less',
  'rule.runtime.atLeast': 'Runtime {limit} or more',
  'rule.runtime.between': 'Runtime between {min} and {max} minutes',
  'rule.discardPile.exclude': 'Not in your discard pile',
  'rule.discardPile.only': 'In your discard pile',
  'rule.scrobbleCount.atLeast.one': 'At least 1 scrobble',
  'rule.scrobbleCount.atLeast.other': 'At least {count} scrobbles',
  'rule.scrobbleCount.atMostZero': 'No scrobbles recorded',
  'rule.scrobbleCount.atMost.one': 'At most 1 scrobble',
  'rule.scrobbleCount.atMost.other': 'At most {count} scrobbles',
  'rule.scrobbleCount.topPercent':
    'Top {percent}% of owned albums by scrobbles',
  'rule.scrobblesInPeriod.none': 'No scrobbles recorded {period}',
  'rule.scrobblesInPeriod.atLeast.one': 'At least 1 scrobble {period}',
  'rule.scrobblesInPeriod.atLeast.other': 'At least {count} scrobbles {period}',
  'rule.scrobblesInPeriod.atMost.one': 'At most 1 scrobble {period}',
  'rule.scrobblesInPeriod.atMost.other': 'At most {count} scrobbles {period}',
  'rule.lastRecordedPlay.olderThanDays':
    'Last scrobble more than {span} ago, or none recorded',
  'rule.lastRecordedPlay.olderThanDaysRecorded':
    'Last scrobble more than {span} ago',
  'rule.lastRecordedPlay.withinDays': 'Last scrobble in the last {span}',
  'rule.playsSinceAdded.none':
    'No scrobbles recorded since it was added to Discogs',
  'rule.playsSinceAdded.atLeast.one':
    'At least 1 scrobble since it was added to Discogs',
  'rule.playsSinceAdded.atLeast.other':
    'At least {count} scrobbles since it was added to Discogs',

  // ---- Reasons: copy-level rules ----
  'reason.format.match': 'Format: {format}',
  'reason.format.noMatch.anyOf': 'Format is {format}, not {values}',
  'reason.format.noMatch.noneOf':
    'Format is {format}, which this crate leaves out',
  'reason.artist.match': 'Artist: {artist}',
  'reason.artist.noMatch': 'Artist is {artist}, not {values}',
  'reason.genre.match': 'Genre: {values} (Discogs)',
  'reason.genre.noMatch.anyOf': 'Genre on Discogs is {genres}, not {values}',
  'reason.genre.noMatch.noneOf':
    'Genre on Discogs includes {values}, which this crate leaves out',
  'reason.genre.unknown':
    "Genre unknown: details for this release haven't been fetched from Discogs",
  'reason.style.match': 'Style: {values} (Discogs)',
  'reason.style.noMatch.anyOf': 'Style on Discogs is {styles}, not {values}',
  'reason.style.noMatch.noneOf':
    'Style on Discogs includes {values}, which this crate leaves out',
  'reason.style.unknown':
    "Style unknown: details for this release haven't been fetched from Discogs",
  'reason.pressingYear.match': 'Pressing year: {year}',
  'reason.pressingYear.noMatch': 'Pressing year {year}, not {range}',
  'reason.pressingYear.unknown': 'Pressing year not listed on Discogs',
  'reason.dateAdded.match': 'Added to Discogs {date}',
  'reason.dateAdded.noMatch.withinDays':
    'Added to Discogs {date}, more than {span} ago',
  'reason.dateAdded.noMatch.olderThanDays':
    'Added to Discogs {date}, within the last {span}',
  'reason.dateAdded.noMatch.range': 'Added to Discogs {date}, not {range}',
  'reason.rating.match': 'Rated {value} of 5 on Discogs',
  'reason.rating.noMatch.atLeast': 'Rated {value} of 5 on Discogs, below {min}',
  'reason.rating.unrated': 'Not rated on Discogs',
  'reason.runtime.complete.one': 'Runtime {runtime} (1 track)',
  'reason.runtime.complete.other':
    'Runtime {runtime} (all {count} tracks timed)',
  'reason.runtime.tooLong': 'Runtime {runtime}, longer than {limit}',
  'reason.runtime.tooShort': 'Runtime {runtime}, shorter than {limit}',
  'reason.runtime.outside':
    'Runtime {runtime}, not between {min} and {max} minutes',
  'reason.runtime.partialOver':
    'Runtime over {limit}: the {timed} of {total} tracks with durations on Discogs add up to {known}',
  'reason.runtime.partialAtLeast':
    'Runtime at least {limit}: the {timed} of {total} tracks with durations on Discogs add up to {known}',
  'reason.runtime.unknownPartial':
    'Runtime unknown: Discogs lists durations for {timed} of {total} tracks ({known} known)',
  'reason.runtime.unknownNoDurations':
    'Runtime unknown: Discogs lists no track durations for this release',
  'reason.runtime.unknownNoTracks':
    'Runtime unknown: Discogs lists no tracks for this release',
  'reason.runtime.unknownNotFetched':
    "Runtime unknown: details for this release haven't been fetched from Discogs",
  'reason.discardPile.notIn': 'Not in your discard pile',
  'reason.discardPile.in': 'In your discard pile',

  // ---- Reasons: listening rules ----
  'reason.scrobbles.count.one': '1 scrobble recorded',
  'reason.scrobbles.count.other': '{count} scrobbles recorded',
  'reason.scrobbles.fewerThan.one': '1 scrobble recorded, fewer than {value}',
  'reason.scrobbles.fewerThan.other':
    '{count} scrobbles recorded, fewer than {value}',
  'reason.scrobbles.moreThan.other':
    '{count} scrobbles recorded, more than {value}',
  'reason.scrobbles.top':
    'Top {percent}% by scrobbles: {scrobbles}, #{rank} of {rankOf} owned albums with scrobbles',
  'reason.scrobbles.notTop':
    'Not in your top {percent}% by scrobbles: {scrobbles}, #{rank} of {rankOf} owned albums with scrobbles',
  'reason.scrobbles.notTopNone':
    'Not in your top {percent}% by scrobbles: no scrobbles recorded',
  'reason.scrobbles.noneRecorded': 'No scrobbles recorded for this album',
  'reason.scrobbles.noNameMatch':
    'No scrobbles recorded under this title or its mapped names',
  'reason.scrobbles.fuzzyMatch': 'Scrobbles matched as {names}',
  'reason.period.none': 'No scrobbles recorded {period}',
  'reason.period.count.one': '1 scrobble recorded {period}',
  'reason.period.count.other': '{count} scrobbles recorded {period}',
  'reason.period.fewerThan.one':
    '1 scrobble recorded {period}, fewer than {value}',
  'reason.period.fewerThan.other':
    '{count} scrobbles recorded {period}, fewer than {value}',
  'reason.period.moreThan.other':
    '{count} scrobbles recorded {period}, more than {value}',
  'reason.lastScrobble.fragment': 'last scrobble {date}',
  'reason.lastScrobble': 'Last scrobble {date}',
  'reason.lastScrobble.recent': 'Last scrobble {date}, within the last {span}',
  'reason.lastScrobble.old': 'Last scrobble {date}, more than {span} ago',
  'reason.sinceAdded.added': 'Added to Discogs {date}',
  'reason.sinceAdded.none': 'no scrobbles recorded since',
  'reason.sinceAdded.count.one': '1 scrobble recorded since',
  'reason.sinceAdded.count.other': '{count} scrobbles recorded since',
  'reason.sinceAdded.fewerThan.one':
    '1 scrobble recorded since, fewer than {value}',
  'reason.sinceAdded.fewerThan.other':
    '{count} scrobbles recorded since, fewer than {value}',
  'reason.sinceAdded.before.one':
    '1 scrobble recorded before that (last {month})',
  'reason.sinceAdded.before.other':
    '{count} scrobbles recorded before that (last {month})',
  'reason.listening.noHistory':
    'No scrobble history yet: sync your Last.fm history',

  // ---- Membership ----
  'membership.rules': 'Matches rules',
  'membership.included': 'Included by you',
  'membership.includedOn': 'Included by you on {date}',
  'membership.alsoRules': 'also matches rules',
  'membership.excluded': 'Excluded by you',
  'membership.excludedOn': 'Excluded by you on {date}',

  // ---- "Might match" panel ----
  'unknownCount.line.one': '1 more album might match: {reason}',
  'unknownCount.line.other': '{count} more albums might match: {reason}',
  'unknownCount.runtime': 'runtime unknown',
  'unknownCount.genre': 'genre unknown',
  'unknownCount.style': 'style unknown',
  'unknownCount.rating': 'not rated on Discogs',
  'unknownCount.pressingYear': 'pressing year not listed on Discogs',
  'unknownCount.listening': 'no scrobble history yet',
  'unknownCount.other': 'data missing',
  'unknownCount.total.one':
    '1 more album might match if its missing data were known',
  'unknownCount.total.other':
    '{count} more albums might match if their missing data were known',

  // ---- Coverage header and banners ----
  'coverage.history': 'Listening data: Last.fm scrobbles since {month}',
  'coverage.historyNoStart': 'Listening data: Last.fm scrobbles',
  'coverage.noHistory':
    'Listening data: no Last.fm scrobble history synced yet',
  'coverage.lastSync': 'last sync finished {relative}',
  'coverage.newestScrobble': 'newest scrobble {date}',
  'coverage.banner.stale':
    'Recent scrobbles may be missing. Last sync finished {date}.',
  'coverage.banner.unknown':
    'Sync status unknown. Run a sync to make sure recent scrobbles are included.',
  'coverage.banner.noHistory':
    'Sync your Last.fm history to use listening rules',
  'coverage.collection.loadingPages':
    'Collection is still loading ({read} of {expected} pages). Some albums may be missing.',
  'coverage.collection.loading':
    'Collection is still loading. Some albums may be missing.',

  'coverage.runtimeKnown':
    'Runtime: {count} of {total} albums have a duration on Discogs for every track',
  'coverage.genreKnown':
    'Genre and style: {count} of {total} albums have release details from Discogs',
  'coverage.rated': 'Rating: {count} of {total} albums rated on Discogs',

  // ---- Rule builder: field labels ----
  'builder.field.format': 'Format',
  'builder.field.artist': 'Artist',
  'builder.field.genre': 'Genre',
  'builder.field.style': 'Style',
  'builder.field.pressingYear': 'Pressing year',
  'builder.field.dateAdded': 'Added to Discogs',
  'builder.field.rating': 'Discogs rating',
  'builder.field.runtime': 'Runtime',
  'builder.field.discardPile': 'Discard pile',
  'builder.field.scrobbleCount': 'Scrobbles, all time',
  'builder.field.scrobblesInPeriod': 'Scrobbles in a period',
  'builder.field.lastRecordedPlay': 'Last scrobble',
  'builder.field.playsSinceAdded': 'Scrobbles since added to Discogs',

  // ---- Rule builder: help text ----
  'builder.help.format':
    'Format of a copy you own. "None of" matches an album if any copy you own has another format.',
  'builder.help.artist': 'Artist name as listed on Discogs.',
  'builder.help.genre':
    'Genres from Discogs release details already fetched. Albums without details count as missing data.',
  'builder.help.style':
    'Styles from Discogs release details already fetched. Albums without details count as missing data.',
  'builder.help.pressingYear':
    'The year of your copy on Discogs. A reissue has its reissue year, not the year of the original release.',
  'builder.help.dateAdded':
    'The date a copy was added to Discogs, which is not always when you got it.',
  'builder.help.rating':
    'Your rating on Discogs. Unrated albums count as missing data.',
  'builder.help.runtime':
    'The sum of the track durations Discogs lists for your copy. Albums with missing durations count as missing data.',
  'builder.help.discardPile': 'Records in your discard pile.',
  'builder.help.listening':
    'Counts track scrobbles recorded on Last.fm from any source, not only from this record.',
  'builder.help.playsSinceAdded':
    'Counts track scrobbles recorded after your newest copy was added to Discogs. Scrobbles from before that date do not count.',
  'builder.includeNoRecordedPlays': 'Include albums with no scrobbles recorded',

  // ---- Rule builder: sort orders ----
  'builder.sort.artist': 'Artist, A to Z',
  'builder.sort.lastPlayedAsc': 'Last scrobble, oldest first',
  'builder.sort.scrobblesDesc': 'Most scrobbles first',
  'builder.sort.scrobblesAsc': 'Fewest scrobbles first',
  'builder.sort.dateAddedDesc': 'Most recently added to Discogs first',
  'builder.sort.runtimeAsc': 'Shortest runtime first',

  // ---- Suggested crates: names ----
  'suggestion.styleQuiet.name': '{style} with no scrobbles in {span}',
  'suggestion.artist.name': '{artist} shelf',
  'suggestion.decadeQuiet.name':
    '{decade}s pressings with no scrobbles in {span}',
  'suggestion.topQuiet.name':
    'Most-scrobbled albums with nothing recorded for {span}',
  'suggestion.addedQuiet.name':
    'Added to Discogs in the last {span}, no scrobbles recorded since',
  'suggestion.short.name': '{genre} that fits in {limit}',

  // ---- Suggested crates: descriptions ----
  'suggestion.styleQuiet.description':
    '{style} albums you own with no scrobbles recorded in the last {span}, ordered by last scrobble, oldest first.',
  'suggestion.artist.description':
    'Albums you own by {artist}, ordered by last scrobble, oldest first.',
  'suggestion.decadeQuiet.description':
    'Albums whose copy was pressed in the {decade}s, with no scrobbles recorded in the last {span}, fewest scrobbles first. Pressing year is the year of your copy, not of the original release.',
  'suggestion.topQuiet.description':
    'Your top {percent}% of owned albums by recorded scrobbles, with no scrobbles recorded in the last {span}, most scrobbled first.',
  'suggestion.addedQuiet.description':
    'Albums added to Discogs in the last {span}, with no scrobbles recorded since, most recently added first. Added to Discogs is not always when you got a record.',
  'suggestion.short.description':
    '{genre} albums whose track durations on Discogs add up to {limit} or less, shortest first. Albums without a duration for every track are left out.',

  // ---- Suggested crates: reasons ----
  'suggestion.reason.ownStyle.one': 'You own 1 {style} album.',
  'suggestion.reason.ownStyle.other': 'You own {count} {style} albums.',
  'suggestion.reason.ownArtist.one': 'You own 1 album by {artist}.',
  'suggestion.reason.ownArtist.other': 'You own {count} albums by {artist}.',
  'suggestion.reason.ownDecade.one':
    'You own 1 album pressed in the {decade}s.',
  'suggestion.reason.ownDecade.other':
    'You own {count} albums pressed in the {decade}s.',
  'suggestion.reason.topSet.one':
    'Your top {percent}% by scrobbles is 1 album.',
  'suggestion.reason.topSet.other':
    'Your top {percent}% by scrobbles is {count} albums.',
  'suggestion.reason.addedSet.one':
    '1 album was added to Discogs in the last {span}.',
  'suggestion.reason.addedSet.other':
    '{count} albums were added to Discogs in the last {span}.',
  'suggestion.reason.ownTimed.one':
    'You own 1 {genre} album with a duration on Discogs for every track.',
  'suggestion.reason.ownTimed.other':
    'You own {count} {genre} albums with a duration on Discogs for every track.',
  'suggestion.reason.quiet.one':
    '1 has no scrobbles recorded in the last {span}.',
  'suggestion.reason.quiet.other':
    '{count} have no scrobbles recorded in the last {span}.',
  'suggestion.reason.noneQuiet':
    'All of them have scrobbles recorded in the last {span}.',
  'suggestion.reason.quietSinceAdded.one':
    '1 has no scrobbles recorded since it was added.',
  'suggestion.reason.quietSinceAdded.other':
    '{count} have no scrobbles recorded since they were added.',
  'suggestion.reason.fits.one': '1 fits in {limit}.',
  'suggestion.reason.fits.other': '{count} fit in {limit}.',
  'suggestion.reason.template.one':
    '1 of your albums matches this starter crate.',
  'suggestion.reason.template.other':
    '{count} of your albums match this starter crate.',
  'suggestion.exhausted': "That's all the suggestions for today.",
  'suggestion.collectionLoading':
    'Suggestions appear once your collection has finished loading.',
  'suggestion.added': 'Crate added. Edit its rules any time.',
} as const;

export type CratePhraseKey = keyof typeof CRATE_PHRASES;

/** Keys that have `.one` / `.other` forms, without the suffix */
export type CratePluralKey = CratePhraseKey extends infer K
  ? K extends `${infer Base}.other`
    ? Base
    : never
  : never;

/** What a phrase talks about, for the semantic checks of plan section 8.4 */
export type CratePhraseTopic = 'listening' | 'dateAdded';

/**
 * Topics of phrases whose text must carry the honesty markers: listening
 * phrases contain "scrobble", date-added phrases contain "Added to Discogs".
 * Phrases not listed here are neutral. Checked by crateCopy.test.ts.
 */
export const CRATE_PHRASE_TOPICS: Partial<
  Record<CratePhraseKey, CratePhraseTopic[]>
> = {
  'count.scrobbles.one': ['listening'],
  'count.scrobbles.other': ['listening'],
  'rule.dateAdded.withinDays': ['dateAdded'],
  'rule.dateAdded.olderThanDays': ['dateAdded'],
  'rule.dateAdded.range': ['dateAdded'],
  'rule.dateAdded.any': ['dateAdded'],
  'rule.scrobbleCount.atLeast.one': ['listening'],
  'rule.scrobbleCount.atLeast.other': ['listening'],
  'rule.scrobbleCount.atMostZero': ['listening'],
  'rule.scrobbleCount.atMost.one': ['listening'],
  'rule.scrobbleCount.atMost.other': ['listening'],
  'rule.scrobbleCount.topPercent': ['listening'],
  'rule.scrobblesInPeriod.none': ['listening'],
  'rule.scrobblesInPeriod.atLeast.one': ['listening'],
  'rule.scrobblesInPeriod.atLeast.other': ['listening'],
  'rule.scrobblesInPeriod.atMost.one': ['listening'],
  'rule.scrobblesInPeriod.atMost.other': ['listening'],
  'rule.lastRecordedPlay.olderThanDays': ['listening'],
  'rule.lastRecordedPlay.olderThanDaysRecorded': ['listening'],
  'rule.lastRecordedPlay.withinDays': ['listening'],
  'rule.playsSinceAdded.none': ['listening', 'dateAdded'],
  'rule.playsSinceAdded.atLeast.one': ['listening', 'dateAdded'],
  'rule.playsSinceAdded.atLeast.other': ['listening', 'dateAdded'],
  'reason.dateAdded.match': ['dateAdded'],
  'reason.dateAdded.noMatch.withinDays': ['dateAdded'],
  'reason.dateAdded.noMatch.olderThanDays': ['dateAdded'],
  'reason.dateAdded.noMatch.range': ['dateAdded'],
  'reason.scrobbles.count.one': ['listening'],
  'reason.scrobbles.count.other': ['listening'],
  'reason.scrobbles.fewerThan.one': ['listening'],
  'reason.scrobbles.fewerThan.other': ['listening'],
  'reason.scrobbles.moreThan.other': ['listening'],
  'reason.scrobbles.top': ['listening'],
  'reason.scrobbles.notTop': ['listening'],
  'reason.scrobbles.notTopNone': ['listening'],
  'reason.scrobbles.noneRecorded': ['listening'],
  'reason.scrobbles.noNameMatch': ['listening'],
  'reason.scrobbles.fuzzyMatch': ['listening'],
  'reason.period.none': ['listening'],
  'reason.period.count.one': ['listening'],
  'reason.period.count.other': ['listening'],
  'reason.period.fewerThan.one': ['listening'],
  'reason.period.fewerThan.other': ['listening'],
  'reason.period.moreThan.other': ['listening'],
  'reason.lastScrobble.fragment': ['listening'],
  'reason.lastScrobble': ['listening'],
  'reason.lastScrobble.recent': ['listening'],
  'reason.lastScrobble.old': ['listening'],
  'reason.sinceAdded.added': ['dateAdded'],
  'reason.sinceAdded.none': ['listening'],
  'reason.sinceAdded.count.one': ['listening'],
  'reason.sinceAdded.count.other': ['listening'],
  'reason.sinceAdded.fewerThan.one': ['listening'],
  'reason.sinceAdded.fewerThan.other': ['listening'],
  'reason.sinceAdded.before.one': ['listening'],
  'reason.sinceAdded.before.other': ['listening'],
  'reason.listening.noHistory': ['listening'],
  'unknownCount.listening': ['listening'],
  'coverage.history': ['listening'],
  'coverage.historyNoStart': ['listening'],
  'coverage.noHistory': ['listening'],
  'coverage.newestScrobble': ['listening'],
  'coverage.banner.stale': ['listening'],
  'coverage.banner.unknown': ['listening'],
  'builder.field.dateAdded': ['dateAdded'],
  'builder.field.scrobbleCount': ['listening'],
  'builder.field.scrobblesInPeriod': ['listening'],
  'builder.field.lastRecordedPlay': ['listening'],
  'builder.field.playsSinceAdded': ['listening', 'dateAdded'],
  'builder.help.dateAdded': ['dateAdded'],
  'builder.help.listening': ['listening'],
  'builder.help.playsSinceAdded': ['listening', 'dateAdded'],
  'builder.includeNoRecordedPlays': ['listening'],
  'builder.sort.lastPlayedAsc': ['listening'],
  'builder.sort.scrobblesDesc': ['listening'],
  'builder.sort.scrobblesAsc': ['listening'],
  'builder.sort.dateAddedDesc': ['dateAdded'],
  'suggestion.styleQuiet.name': ['listening'],
  'suggestion.decadeQuiet.name': ['listening'],
  'suggestion.topQuiet.name': ['listening'],
  'suggestion.addedQuiet.name': ['listening', 'dateAdded'],
  'suggestion.styleQuiet.description': ['listening'],
  'suggestion.artist.description': ['listening'],
  'suggestion.decadeQuiet.description': ['listening'],
  'suggestion.topQuiet.description': ['listening'],
  'suggestion.addedQuiet.description': ['listening', 'dateAdded'],
  'suggestion.reason.topSet.one': ['listening'],
  'suggestion.reason.topSet.other': ['listening'],
  'suggestion.reason.addedSet.one': ['dateAdded'],
  'suggestion.reason.addedSet.other': ['dateAdded'],
  'suggestion.reason.quiet.one': ['listening'],
  'suggestion.reason.quiet.other': ['listening'],
  'suggestion.reason.noneQuiet': ['listening'],
  'suggestion.reason.quietSinceAdded.one': ['listening'],
  'suggestion.reason.quietSinceAdded.other': ['listening'],
};

export type CratePhraseSlots = Record<string, string | number>;

const SLOT_PATTERN = /\{(\w+)\}/g;

function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

/** Slot names used by a template, in order of first use */
export function phraseSlots(key: CratePhraseKey): string[] {
  const names: string[] = [];
  for (const match of CRATE_PHRASES[key].matchAll(SLOT_PATTERN)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/** Format a number for copy, with thousands separators ("1,150") */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/**
 * Render a phrase. Number slots are formatted with thousands separators, so
 * pass years and other identifiers as strings. Outside production a missing
 * or unexpected slot throws; in production a missing slot renders as empty.
 */
export function phrase(
  key: CratePhraseKey,
  slots: CratePhraseSlots = {}
): string {
  const template: string = CRATE_PHRASES[key];
  if (template === undefined) {
    throw new Error(`Unknown crate phrase "${String(key)}"`);
  }
  const used = phraseSlots(key);
  if (!isProduction()) {
    for (const name of used) {
      if (!(name in slots)) {
        throw new Error(`Crate phrase "${key}" is missing slot {${name}}`);
      }
    }
    for (const name of Object.keys(slots)) {
      if (!used.includes(name)) {
        throw new Error(`Crate phrase "${key}" has no slot {${name}}`);
      }
    }
  }
  return template.replace(SLOT_PATTERN, (_, name: string) => {
    const value = slots[name];
    if (value === undefined) return '';
    return typeof value === 'number' ? formatCount(value) : value;
  });
}

/**
 * Render the `.one` or `.other` form of a plural phrase. The count fills the
 * `{count}` slot of the `.other` form.
 */
export function phraseCount(
  base: CratePluralKey,
  count: number,
  slots: CratePhraseSlots = {}
): string {
  if (count === 1) {
    const oneKey = `${base}.one` as CratePhraseKey;
    if (oneKey in CRATE_PHRASES) return phrase(oneKey, slots);
  }
  return phrase(`${base}.other` as CratePhraseKey, { ...slots, count });
}

/** Join rendered phrases with " · ", skipping empty parts */
export function joinPhrases(
  ...parts: Array<string | null | undefined | false>
): string {
  return parts.filter(Boolean).join(' · ');
}

/** Join rendered sentences with a space, skipping empty parts */
export function joinSentences(
  ...parts: Array<string | null | undefined | false>
): string {
  return parts.filter(Boolean).join(' ');
}

/** Append a rendered note in parentheses: "No scrobbles recorded (history starts Feb 2005)" */
export function withNote(
  text: string,
  note: string | null | undefined
): string {
  return note ? `${text} (${note})` : text;
}

/**
 * Join slot values (genres, formats, artists) for a `{values}` slot:
 * "Jazz, Soul" by default, "Jazz, Soul or Funk" / "Jazz and Soul" when
 * `conjunction` is given.
 */
export function formatValueList(
  values: readonly string[],
  conjunction?: 'or' | 'and'
): string {
  if (!conjunction || values.length < 2) return values.join(', ');
  return phrase(conjunction === 'or' ? 'list.or' : 'list.and', {
    first: values.slice(0, -1).join(', '),
    last: values[values.length - 1],
  });
}

// ---- Dates (deterministic: en-US, the machine's local time zone) ----

function toDate(value: Date | number | string): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  // A bare ISO date is a local calendar day, not UTC midnight
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (bare) {
    return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
  }
  return new Date(value);
}

/** "Sep 14, 2026". Numbers are ms; use `secondsToMs` for scrobble times. */
export function formatCrateDate(value: Date | number | string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Feb 2005". Numbers are ms. */
export function formatCrateMonth(value: Date | number | string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

/** "38:12" or "1:02:05" */
export function formatRuntime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = String(s % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** A span of days: "90 days", "12 months" (365), "2 years" (730) */
export function formatSpan(days: number): string {
  if (days > 0 && days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? phrase('span.year') : phraseCount('span.years', years);
  }
  return phraseCount('span.days', days);
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago" */
export function formatRelative(thenMs: number, now: Date): string {
  const diff = now.getTime() - thenMs;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return phrase('relative.justNow');
  if (minutes < 60) return phraseCount('relative.minutes', minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return phraseCount('relative.hours', hours);
  return phraseCount('relative.days', Math.floor(hours / 24));
}
