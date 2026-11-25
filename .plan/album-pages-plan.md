# Album and record pages: one overview, one scrobble screen

Status: in progress 2026-11-25. Step 1 implemented on `feat/artist-owned-records`.

## Problem

The artist page listed albums only from plays, so a record you own but never
scrobbled didn't appear, and an artist you only own had an empty page. More
broadly the app has two album pages that each tell half the story:

- **Album page** (`#album`): the music, by artist and album name. Works for
  albums you don't own, merges every version you've played. Linked from every
  stats and history list.
- **Release Details** (`#release-details`): one Discogs pressing, by release
  id. Tracklist, sides, timing and scrobbling, plus marketplace, crates and
  discard pile, which all belong to a pressing. Also opened for records you
  don't own (Check Record, Recommendations).

Merging them into one page would mean choosing a copy before scrobbling when
you own two pressings, and an unowned album has no tracklist to scrobble from.

## Decision

One album overview, one per-record scrobble screen, one artist page that
covers both collection and listening (peer reviewer agreed).

Rule: plays belong to the album, never to a copy. Scrobbles don't say which
copy was played, so copy-level play counts are never added up.

## Steps

1. **Artist page covers collection and listening.** `getArtistDetail` lists
   owned records with no plays (via `identity.ownedByArtist`, one row per
   record by `recordKey`) after the played albums, with `playCount: 0` and
   `lastPlayed: null`; works without a history index. The page shows "Not
   played yet", hides the listening arc for them, and has an All / In
   collection filter. Done 2026-11-25.
2. **Album page lists your records.** "In Your Collection" becomes "Your
   records": every owned copy (from the server, via play identity), each with
   a "Scrobble this record" action that opens Release Details for that
   release. Release Details links back to the album overview. Unowned albums
   unchanged.
3. **Consistent links.** Album titles always open the overview; scrobble and
   manage actions open the record. Album and release go in the URL (keeping
   the localStorage fallback) so reloads, back links and new tabs work.

## Step 1 notes

Real data (copy): 65 artists gain records they own but never played (e.g.
Andrew Bird's *Hark!* and *Inside Problems*), 14 artists you only own now list
their records. Spot-checked ten: none were in the scrobble history under any
spelling, so they are real gaps, not matching misses.
