# Discogs pressings catalogue

Status: PR 1 and PR 2 implemented, uncommitted (2026-11-14); migration verified on a copy of real data (19,227 pressings, 3,616 with details, 40 baselines kept).

## Problem

The pressings (Discogs "versions") of a master are stored in four places, each
filled by its own fetch code:

| File | Holds | Used by | Kept |
|---|---|---|---|
| `wishlist/versions-cache.json` | full versions (format, year, label, country) | wishlist sync, versions endpoint, export | 7 days, then cleanup deletes it |
| `sellers/release-master-cache.json` | release IDs per master, release -> master | seller listing matching | master lists refetched after 30 days |
| `wishlist/known-pressings.json` (uncommitted) | release IDs per master | new-pressing detection | forever |
| `wishlist/wishlist-items.json` `vinylVersions` | versions per wishlist item | wishlist page, prices, label monitoring, export | until next sync |

Consequences: new-pressing detection lost its "before" list when the versions
cache expired, so old pressings were flagged as new; the same master is fetched
by three features on three schedules; the seller cache's lists look complete
but can come from one-off release lookups.

## Design

One catalogue, `data/discogs/pressings.json`, owned by
`DiscogsPressingsService`. Reviewed by the peer reviewer 2026-11-14.

```ts
{
  schemaVersion: 1,
  releases: {
    [releaseId]: {
      masterId: number,
      version?: { title, format[], label, country, year, hasVinyl }, // absent for ID-only rows
      firstSeenAt: number,
    }
  },
  masters: {
    [masterId]: {
      baselineSince?: number,   // first newest/complete fetch; before it nothing is flagged
      everComplete?: boolean,   // a complete list was seen (undated pressings are known)
      newestCheckedAt?: number, // last successful newest-first (or complete) fetch
      completeCheckedAt?: number, // last fetch of every page
    }
  }
}
```

- A pressing is stored once. Master -> releases is an in-memory index built on load.
- The "before" list for detection is the set of release rows of a master. Rows
  are never removed, so nothing ages out.
- ID-only rows (seller lookups, old seller cache) count as known but are not
  returned as versions.
- No marketplace data in the catalogue: prices stay in
  `wishlist/pressing-prices.json`, alerts stay in `wishlist/new-releases.json`.

### One fetch path

`getPressings(masterId, { need, maxAgeMs, alertOverride? })`

- `need: 'newest'` -> fresh if newest or complete check within `maxAgeMs`;
  otherwise fetch newest-first, up to 100.
- `need: 'complete'` -> fresh if complete check within `maxAgeMs`; otherwise
  fetch every page.
- Coverage of a fetch: `complete` (every page), `newest` (newest-first prefix,
  capped), `partial` (failed part-way). Partial results are merged but advance
  no timestamp and cannot start a baseline.
- Concurrent requests for one master share one fetch.
- Retries on 429/503/network errors with backoff; the shared Discogs axios
  token bucket handles pacing.

Callers:

| Caller | need | maxAge |
|---|---|---|
| Wishlist sync / versions endpoint / release tracking (`getMasterVersions`) | newest | 7 days |
| New-pressing check (Check Next Batch) | newest | 7 days |
| Seller release refresh | complete | 30 days |
| Seller listing matching (release -> master) | `masterOf(releaseId)` from catalogue, else `/releases/:id`, recorded with `noteReleaseMaster` | - |

### Detection (inside the catalogue's commit)

For a master with a baseline, a pressing not previously in the catalogue is a
candidate when it is vinyl and released last year or later, or undated and the
master had been seen complete before this fetch. Candidates go to a detector
supplied by `WishlistService`, which decides whether anyone tracks the master
(wishlist / want list, settings, `alertOverride` for a manual check) and writes
alerts. The first newest/complete fetch only starts the baseline.

### Safety

- A failed catalogue save keeps the changes in memory and retries on the next
  save; a change counter makes sure a save only marks the changes it covered.

- One commit queue in `DiscogsPressingsService`; network outside it, merge
  inside it. `WishlistService` runs all `new-releases.json` writes through the
  same queue.
- Alerts are written before the catalogue (alert IDs `masterId-releaseId`
  dedupe a retry).
- A catalogue file that exists but can't be parsed stops writes; it is never
  replaced with an empty one.
- The catalogue is durable data (not in FileStorage's regenerable list) and not
  touched by cleanup.

### Migration (first load, before anything uses it)

Import, without flagging anything:

1. `sellers/release-master-cache.json`: release -> master rows (ID only). No
   baseline or timestamps: its lists can come from one-off lookups.
2. `wishlist/versions-cache.json`: rows with version details. No baseline: lists
   were capped in default order.
3. `wishlist/known-pressings.json`: rows plus `baselineSince` and
   `everComplete` as recorded. Not its check date: it kept no pressing
   details, so the next request fetches them (against the kept baseline).
4. `wishlist/new-releases.json`: each alert's pressing as a row with details.
5. `wishlist/wishlist-items.json` `vinylVersions`: rows with details.

Write the catalogue, then move each imported legacy file to
`<name>-pre-catalogue.bak` so it is never read again. Every load repeats that
step, which finishes an import interrupted after the catalogue was written. An
unreadable legacy file is left in place.

Known limitation: masters without a recorded baseline start one on their next
newest/complete fetch, which flags nothing.

## PR 1 -- catalogue, single fetch path, migration

- `DiscogsPressingsService` + tests (fetch, coverage, freshness, coalescing,
  detection, strict read, migration).
- `WishlistService`: `getMasterVersions`, the check loop and
  `getVersionsCache` (export adapter) read the catalogue; detector writes
  alerts; alert writes share the commit queue. Remove `recordPressings`,
  `known-pressings.json`, the versions cache and its two fetch functions.
- `SellerMonitoringService`: release refresh, matching and cache stats use the
  catalogue; remove `release-master-cache.json` handling.
- Cleanup no longer cleans the versions cache; FileStorage and migration
  registry updated.
- README.

## PR 2 -- wishlist reads pressings from the catalogue

- `wishlist-items.json` no longer stores `vinylVersions` (`StoredWishlistItem`);
  `getWishlistItems` fills them from `DiscogsPressingsService.knownVersions`
  (no fetch), so the wishlist page, prices, label monitoring and export read
  the catalogue. A vinyl pressing learned by any feature shows the record as
  having vinyl; no vinyl known keeps the saved status. An unreadable catalogue
  hides pressings, not the wishlist. Old files' stale copies are ignored.
- `getMasterVersions` (wishlist sync, want list, release tracking): when the
  newest pressings include no vinyl, every page is fetched (at most every 30
  days, `MASTER_COMPLETE_FRESH_MS`), so a record whose vinyl is older than its
  newest 100 pressings is not marked CD-only.
- Check Next Batch fetches every page of a record not fetched in full for 30
  days, otherwise the newest page (7 days), so undated pressings are learned
  monthly without seller monitoring.

## Open limitations

- A newest-first check sees at most the 100 newest pressings.
- A pressing Discogs moves to another master takes the new master on the next
  fetch of that master and is not flagged (it is known under any master).
