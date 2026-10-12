# Plan: Reissue & Label Discovery Features

> **Status (audited 2026-10-11): MOSTLY IMPLEMENTED, small gaps remain.**
> All three features (A reissues, B labels, C websites) shipped in commit
> `6be3c73` ("feat: marketplace discovery — reissues, labels, websites + dev
> sandbox"). The reissue
> dedupe gap and the settings-defaults bug were fixed on 2026-10-11 (branch
> `fix/plan-audit-bugs`). What is left is the auto-scan and notification
> pieces for labels and websites (gaps 3-5). The plan
> stays in `.plan/` until those are closed or explicitly dropped. The original
> plan text below is kept for history. Where the code differs from it, the
> code is the source of truth (see "Deliberate deviations").

## Completed scope

### Feature A: MusicBrainz reissue detection

- `MusicBrainzService.getRecentReleases(artistMbid, monthsBack = 12)` in
  `src/backend/services/musicbrainzService.ts` queries `/release` with
  `arid:… AND date:[YYYY-MM TO *] AND status:official`. It paginates 100 at a
  time with a 500-release cap per artist, uses the shared `enforceRateLimit` /
  `executeWithBackoff`, and returns `MBReleaseLite` entries (title, date,
  country, first label name, release-group MBID and types). It also sets
  `originalReleaseDate` through `enrichWithReleaseGroupDates`.
- `TrackedRelease` in `src/shared/types.ts` has `isReissue`,
  `releaseGroupMbid`, `originalReleaseDate`, `sourceType`, `labelName` and
  `country`. `ReleaseTrackingSettings.includeReissues` exists, and
  `ReleaseTrackingService.getSettings` defaults it to `true`.
- `ReleaseTrackingService.syncReleases` (`src/backend/services/releaseTrackingService.ts`)
  runs a reissue branch for each artist when `settings.includeReissues` is on,
  with a fixed 12-month lookback. The branch filters by enabled release types,
  dedupes by release MBID against `existingMbids`, converts each entry through
  the private `toReissueTrackedRelease`, and isolates failures in its own
  try/catch.
- `getFilteredReleases({ reissuesOnly })` handles the filter, and
  `GET /api/v1/releases?reissuesOnly=true` exposes it
  (`src/backend/routes/releases.ts`). `includeReissues` goes through the
  release settings GET/POST.
- Frontend:
  - `api.getTrackedReleases({ reissuesOnly })` and the `includeReissues`
    settings fields are in `src/renderer/services/api.ts`.
  - The "Reissues" tab in `NewReleasesPage.tsx` shows the count and
    "Orig. X → Reissue Y" dates through the `originalReleaseDates` map.
  - `ReleaseCard.tsx` shows the reissue badge and label/country.
  - The "Include reissues" toggle is in
    `components/settings/SettingsFiltersSection.tsx`.
- Tests:
  - `tests/backend/musicbrainzService.test.ts` covers `getRecentReleases`.
  - `tests/backend/releaseTrackingService.test.ts` has the
    `toReissueTrackedRelease`, `getFilteredReleases reissuesOnly` and
    `syncReleases reissue branch` suites.
  - `tests/backend/routes/releases.test.ts` covers the `reissuesOnly` param.

### Feature B: label monitoring

- Types in `src/shared/types.ts`: `MonitoredLabel`, `LabelRelease`,
  `LabelScanStatus`, `LabelMonitoringSettings`, `MonitoredLabelsStore`,
  `LabelReleasesStore` and `LabelScanStatusStore`.
- `LabelMonitoringService` (`src/backend/services/labelMonitoringService.ts`):
  - Storage is `labels/{monitored-labels,releases,scan-status,settings}.json`.
  - Label CRUD: `addLabel` validates through the Discogs `/labels/{id}` call,
    plus `removeLabel` and `getLabels`. `searchLabels` uses
    `/database/search?type=label`.
  - Scanning: `startScan(targetLabelId?)`, `getScanStatus` and `cancelScan`.
    It fetches newest-first and falls back to ascending when the descending
    sort looks wrong (`looksDescending`). It stops at the lookback window and
    caps at `maxReleasesPerLabel`.
  - Releases are enriched with collection and wishlist status.
  - `markReleaseAsSeen`, `dismissRelease` and their bulk versions.
  - `getSettings` / `saveSettings`.
- Routes in `src/backend/routes/labels.ts` are mounted at `/api/v1/labels` in
  `src/server.ts`. They cover everything the plan listed, plus:
  - per-label `POST /:labelId/scan`
  - `releases/bulk-seen` and `releases/bulk-dismiss`
  - `wishlist-label-options` and `wishlist-artist-options`
  - `artist-urls` and `website-suggestions`
- `migrationService.ts` registers all four label files. `backupService.ts`
  backs up `labels/settings.json` and `labels/monitored-labels.json`.
- Frontend: `src/renderer/pages/LabelsPage.tsx` with `LabelsPage.page.css`
  (Discogs label search, wishlist-label quick-add, scan progress, release
  cards, settings modal). It is embedded as the `labels` tab in
  `MarketplacePage.tsx`, and the API methods are in `api.ts`
  (e.g. `searchDiscogsLabels`).
- Tests:
  - `tests/backend/services/labelMonitoringService.test.ts`
  - `tests/backend/routes/labels.test.ts`
  - `tests/frontend/pages/LabelsPage.test.tsx`

### Feature C: website monitoring

- `cheerio` is a dependency in `package.json`.
- Types in `src/shared/types.ts`: `MonitoredWebsite`, `WebsiteItem` (with
  `confidence`, `formatKind` and `matches`), `WebsiteScanStatus` (with
  `ollamaAvailable`), `WebsiteMonitoringSettings` and the store wrappers.
- `WebsiteMonitoringService` (`src/backend/services/websiteMonitoringService.ts`):
  - Website CRUD: `addWebsite`, `updateWebsite`, `removeWebsite` and
    `getWebsites`, with URL validation.
  - Extraction pipeline: `fetchPage` (timeout, user-agent, byte cap) →
    `extractWithCheerio` (optional CSS selector) → `extractWithOllama`
    (JSON prompt through `ollamaService.chat`) → `extractFallback` (regex).
  - After extraction it applies `applyFormatFilter` and `applyMatches`, the
    latter marking wishlist, local-want, collection and Last.fm top-artist
    matches.
  - `previewWebsite` returns items, a warning, `rawTextPreview` and a
    suggested selector.
  - Scanning: `startScan(targetWebsiteId?)`, `cancelScan` and `getScanStatus`.
  - Item actions: seen, dismiss and their bulk versions.
- Routes in `src/backend/routes/websites.ts` are mounted at `/api/v1/websites`
  in `src/server.ts`, together with `ollamaService`. They cover everything the
  plan listed, plus `items/:itemId/dismiss`, the bulk routes and
  `GET /ollama/status`.
- `migrationService.ts` registers all four website files. `backupService.ts`
  backs up `websites/settings.json` and `websites/monitored-websites.json`.
- Frontend: `src/renderer/pages/WebsitesPage.tsx` with `WebsitesPage.page.css`
  (add/edit dialog with Preview, Ollama status, enable and `useOllama`
  toggles, scan progress, item cards). It is embedded as the `websites` tab in
  `MarketplacePage.tsx`.
- Tests:
  - `tests/backend/services/websiteMonitoringService.test.ts`
  - `tests/backend/routes/websites.test.ts`
  - `tests/frontend/pages/WebsitesPage.test.tsx`

### Deliberate deviations from the original plan (accepted as-is)

- The Discogs label calls (search, `/labels/{id}`, `/labels/{id}/releases`)
  live inside `LabelMonitoringService` through `getDiscogsAxios()`, not as
  new `DiscogsService` methods.
- `MonitoredLabel` uses a local UUID `id` plus `discogsLabelId` and a
  per-label `lookbackMonths`. `LabelRelease` uses boolean
  `isInCollection` / `isInWishlist` flags and a `'dismissed'` status, not the
  separate `notified` / `dismissed` fields.
- `LabelMonitoringSettings` is `defaultLookbackMonths`,
  `autoScanIntervalHours?` and `maxReleasesPerLabel?`. The plan's
  `vinylOnly` and `notifyOnNewRelease` were not added.
- `WebsiteMonitoringSettings` is `ollamaModel`, `ollamaEnabled`,
  `fetchTimeoutMs`, `maxBytes` and `formatFilter`. Each site also has a
  `useOllama` flag. `ollamaRequired`, `notifyOnNewItems` and
  `checkFrequencyDays` were not added.
- When Ollama is unavailable, the regex fallback produces items with
  `confidence: 0.2` and preview returns a warning plus `rawTextPreview`.
  The plan instead had raw-text items with `confidence: 0`.
- No `websites/page-cache/` debug HTML snapshots are written.
- `TrackedRelease.sourceType` is `'musicbrainz' | 'discogs' | 'website'`,
  not `'release-group' | 'release'`. `isReissue` / `releaseGroupMbid` carry
  that distinction instead.
- Backups include only label and website *settings and monitored lists*.
  Detected releases and items are treated as re-derivable cache.

## Remaining work

1. ~~**Reissue dedupe against release-groups found in the same sync (Feature A,
   step 3).**~~ **FIXED 2026-10-11.** `syncReleases` now skips a reissue
   candidate whose release group is tracked as a new album (from this sync or
   earlier) when the pressing is from the album's original era: before, or
   within 180 days after, the album's release date (`ORIGINAL_ERA_WINDOW_DAYS`,
   `isOriginalEraPressing`). Partial dates are compared conservatively. Later
   represses are still stored with `isReissue: true`. Original description: In `ReleaseTrackingService.syncReleases`, the reissue branch only
   dedupes by individual release MBID (`existingMbids.has(r.mbid)`). It does
   not skip releases whose `releaseGroupMbid` is a brand-new release-group in
   this sync. It also does not check that the release-group was already known
   before flagging the entry. As a result, the first pressing of a new album
   is stored twice: once as the release-group row and once with
   `isReissue: true`.
   - *Fix:* before the reissue loop, build a set of release-group MBIDs added
     as new albums in this sync, and skip any `r` whose `releaseGroupMbid` is
     in that set. Optionally, also skip when `r.originalReleaseDate` is in the
     same month as `r.date`.
   - *Acceptance:* a new test in the `syncReleases reissue branch` suite of
     `tests/backend/releaseTrackingService.test.ts`. When
     `getRecentAndUpcomingReleases` returns release-group X and
     `getRecentReleases` returns a pressing of X, only the release-group entry
     is persisted. A pressing of an older, already-tracked or pre-window
     release-group is still persisted with `isReissue: true`.

2. ~~**`includeReissues` (and other new settings) are lost on existing installs.**~~
   **FIXED 2026-10-11.** `getSettings` merges stored values over the defaults
   (explicit `false` is kept). Original description:
   `ReleaseTrackingService.getSettings` returns the stored file as-is whenever
   `schemaVersion === 1`, without merging defaults. The live
   `data/releases/settings.json` is `{ "schemaVersion": 1, "includeEps": true }`,
   so `settings.includeReissues` is `undefined` and the reissue branch never
   runs. `data/releases/tracked-releases.json` has 0 reissues among 408 entries
   after the 2026-10 sync. `saveSettings` spreads the same partial `current`,
   so nothing heals the file until the user toggles the checkbox.
   - *Fix:* return `{ ...DEFAULTS, ...stored }` from `getSettings`.
   - *Acceptance:* a unit test where a stored partial settings file yields
     `includeReissues: true`, and the Settings toggle shows as checked for
     such installs.

3. **Label auto-scan is exposed in the UI but never runs.** `LabelsPage.tsx`
   saves `LabelMonitoringSettings.autoScanIntervalHours`, but nothing reads
   it. No scheduler in `src/server.ts` or anywhere else calls
   `labelMonitoringService.startScan()`; the only `setInterval` is the
   auto-backup check.
   - *Fix:* add an interval or startup check in `src/server.ts`, next to the
     auto-backup interval. It should call `startScan()` when
     `lastScannedAt` is older than `autoScanIntervalHours` and no scan is
     running.
   - *Alternative:* remove the field from the UI.
   - *Acceptance:* a test for the due-check helper, and no scan when the
     setting is unset or 0.

4. **No scheduled website scans.** The plan's `checkFrequencyDays` for
   websites has no equivalent: there is no setting and no scheduler.
   - *Fix:* add an `autoScanIntervalHours?` field to
     `WebsiteMonitoringSettings` and reuse the scheduler from item 3.
   - *Alternative:* explicitly drop this item.

5. **No notifications for new label releases or website items.** The plan's
   `notifyOnNewRelease` / `notifyOnNewItems` were not implemented, and neither
   service creates notifications.
   - *Fix:* follow the seller-monitoring pattern. `SellerMonitoringService`
     has a `notifyOnNewMatch` setting and a `notified` flag on each match;
     the frontend raises the notification and then marks the match as
     notified. Do the same here with a setting that defaults to on, a
     `notified` flag, and a mark-notified route.
   - *Acceptance:* new items are notified exactly once, and nothing is
     notified when the setting is off. Cover this in the service, route and
     page tests.

## Original plan

## Context

Two albums (WHY? - Elephant Eyelash 20th Anniversary, billy woods & Kenny Segal - Maps reissue) were only found by chance on eBay/label sites. The current system catches new albums (MusicBrainz release groups) and new editions of wishlisted items (Discogs master versions), but misses reissues of non-wishlisted albums and label/website announcements.

Three new features to close these gaps, in priority order.

---

## Feature A: MusicBrainz Reissue Detection

**Problem**: Current code queries `/release-group` by `firstreleasedate` — a 2026 repress of a 2023 album still has `firstreleasedate: 2023`, so it's invisible.

**Fix**: Also query MusicBrainz `/release` endpoint (individual pressings) by `date` field. A 2026 repress has `date: 2026` on its individual release entry.

### Changes

1. **`src/backend/services/musicbrainzService.ts`** — Add `getRecentReleases(artistMbid, monthsBack)` method
   - Query: `arid:{mbid} AND date:[pastDate TO *] AND status:official`
   - Endpoint: `/ws/2/release` (not `/release-group`)
   - Returns: title, date, country, label, format, packaging, release-group MBID
   - Same rate limiting (1.1s delay, exponential backoff)

2. **`src/shared/types.ts`** — Extend `TrackedRelease` with:
   - `isReissue?: boolean`
   - `releaseGroupMbid?: string` (parent release group)
   - `sourceType?: 'release-group' | 'release'`
   - `labelName?: string`, `country?: string`

3. **`src/backend/services/releaseTrackingService.ts`** — In `syncReleases()`, after existing release-group fetch (~line 938):
   - Call `getRecentReleases()` for each resolved artist
   - Deduplicate: skip if release-group MBID was already found as a new album in this sync
   - Mark as `isReissue: true` when the release's release-group already exists from a previous sync

4. **`src/shared/types.ts`** — Add `includeReissues: boolean` to `ReleaseTrackingSettings` (default: true)

5. **`src/backend/routes/releases.ts`** — Add `reissuesOnly` query param filter

6. **`src/renderer/pages/NewReleasesPage.tsx`** — Add "Reissues" tab filtering by `isReissue === true`

7. **`src/renderer/services/api.ts`** — Add `reissuesOnly` param to `getTrackedReleases()`

### Rate Limit Impact
Doubles MB API calls per artist (release-group + release). Only runs when `includeReissues` is enabled. Same 1.1s delay.

---

## Feature B: Label Monitoring (User-Curated)

**Problem**: No way to watch specific labels for new releases. User wants to pick labels to monitor (like the local sellers feature).

**Pattern**: Follows `sellerMonitoringService.ts` exactly — CRUD for monitored items, scan with progress, match against collection/wishlist.

### Changes

1. **`src/shared/types.ts`** — Add types:
   - `MonitoredLabel` — `id` (Discogs label ID), `name`, `displayName?`, `addedAt`, `lastScanned?`, `releaseCount?`
   - `LabelRelease` — `id`, `labelId`, `labelName`, `releaseId`, `masterId?`, `artist`, `title`, `year?`, `format[]`, `catno?`, `dateFound`, `status: 'new' | 'in-collection' | 'in-wishlist' | 'seen'`, `notified`, `dismissed`
   - `LabelScanStatus` — `idle | scanning | matching | completed | error | cancelled` + progress fields
   - `LabelMonitoringSettings` — `checkFrequencyDays`, `vinylOnly`, `lookbackMonths` (default 6), `notifyOnNewRelease`
   - Store wrappers: `MonitoredLabelsStore`, `LabelReleasesStore`

2. **`src/backend/services/discogsService.ts`** — Add methods:
   - `searchLabels(query)` — `GET /database/search?type=label&q=...`
   - `getLabelInfo(labelId)` — `GET /labels/{id}`
   - `getLabelReleases(labelId, page, perPage, sort)` — `GET /labels/{id}/releases?sort=year&sort_order=desc`

3. **`src/backend/services/labelMonitoringService.ts`** — New service:
   - Storage: `labels/monitored-labels.json`, `labels/releases.json`, `labels/scan-status.json`, `labels/settings.json`
   - CRUD: `addLabel(labelId, displayName?)` (validates via Discogs API), `removeLabel(labelId)`, `getLabels()`
   - Scan: `startScan()`, `getScanStatus()`, `cancelScan()`
   - Fetches label releases sorted newest-first, stops when past `lookbackMonths`
   - Compares against cached releases, surfaces new entries
   - Cross-references against collection/wishlist for status enrichment
   - Matches: `getLabelReleases()`, `markAsSeen()`, `dismissRelease()`
   - Settings: `getSettings()`, `saveSettings()`

4. **`src/backend/routes/labels.ts`** — New route file:
   - `GET /api/v1/labels` — list monitored labels
   - `POST /api/v1/labels` — add label (body: `{ labelId, displayName? }`)
   - `DELETE /api/v1/labels/:labelId` — remove label
   - `GET /api/v1/labels/search?q=...` — search Discogs labels
   - `GET /api/v1/labels/releases` — all detected releases
   - `POST /api/v1/labels/scan` — start scan
   - `GET /api/v1/labels/scan/status` — scan progress
   - `POST /api/v1/labels/scan/cancel` — cancel scan
   - `POST /api/v1/labels/releases/:id/seen` — mark as seen
   - `POST /api/v1/labels/releases/:id/dismiss` — dismiss
   - `GET /api/v1/labels/settings` — get settings
   - `POST /api/v1/labels/settings` — save settings

5. **`src/server.ts`** — Instantiate `LabelMonitoringService`, mount labels router

6. **`src/backend/services/migrationService.ts`** — Register label JSON files (optional, schemaVersion 1)

7. **`src/backend/services/backupService.ts`** — Add label files to backup/restore

8. **`src/renderer/services/api.ts`** — Add label monitoring API methods

9. **`src/renderer/pages/LabelsPage.tsx`** + `LabelsPage.page.css` — New page component:
   - Add dialog with label search typeahead
   - List of monitored labels with scan/remove controls
   - Scan progress bar
   - Release cards showing detected items
   - Settings panel

10. **`src/renderer/pages/MarketplacePage.tsx`** — Add `'labels'` tab, render `<LabelsPage embedded />`

### Large Label Mitigation
Scan newest releases first (`sort=year&sort_order=desc`), stop paginating once past `lookbackMonths`. Prevents scanning 100K+ releases from major labels.

---

## Feature C: Website Monitoring (User-Curated, Ollama-Powered)

**Problem**: Label store exclusives and artist website pre-orders don't appear on Discogs or MusicBrainz until after the fact. User wants to monitor arbitrary URLs.

**Pattern**: Follows seller monitoring for CRUD/scan. Uses `cheerio` for HTML extraction + `ollamaService.chat()` for structured data extraction.

### Changes

1. **Install `cheerio`** — `npm install cheerio` (has built-in TS types)

2. **`src/shared/types.ts`** — Add types:
   - `MonitoredWebsite` — `id` (UUID), `name`, `url`, `cssSelector?`, `addedAt`, `lastScanned?`, `itemCount?`, `enabled`
   - `WebsiteItem` — `id`, `websiteId`, `websiteName`, `title`, `artist?`, `price?`, `url?`, `imageUrl?`, `format?`, `isPreorder?`, `dateFound`, `status: 'new' | 'seen' | 'purchased'`, `notified`, `confidence` (0-1, AI extraction quality)
   - `WebsiteScanStatus` — standard scan status + `ollamaAvailable: boolean`
   - `WebsiteMonitoringSettings` — `checkFrequencyDays`, `notifyOnNewItems`, `ollamaRequired` (skip scan if Ollama down), `requestTimeout`
   - Store wrappers

3. **`src/backend/services/websiteMonitoringService.ts`** — New service:
   - Storage: `websites/monitored-websites.json`, `websites/items.json`, `websites/scan-status.json`, `websites/settings.json`, `websites/page-cache/` (debug HTML snapshots)
   - Dependencies: `FileStorage`, `OllamaService`
   - CRUD: `addWebsite(url, name, cssSelector?)`, `removeWebsite(id)`, `getWebsites()`, `updateWebsite(id, updates)`
   - `previewWebsite(url, cssSelector?)` — fetch + extract without saving, returns items immediately (used when adding a site)
   - Scan: `startScan(websiteId?)`, `getScanStatus()`, `cancelScan()`
   - Extraction pipeline:
     1. `fetchPage(url, timeout)` — HTTP GET with configurable user-agent and timeout
     2. `extractWithCheerio(html, selector?)` — parse HTML, extract text content (optionally scoped by CSS selector), limit to 500KB
     3. `extractWithOllama(text)` — send to Ollama chat with JSON mode, prompt asks for structured product data
     4. `extractFallback(text)` — basic regex extraction when Ollama unavailable (best-effort)
   - Diffing: compare extracted items against cached items by title+artist+price, surface new ones
   - Items: `getItems(websiteId?)`, `markAsSeen(itemId)`
   - Settings: `getSettings()`, `saveSettings()`

   Ollama prompt:
   ```
   Extract all vinyl/music products from this web page text. For each, provide:
   title, artist, price, format (LP/2xLP/7"/CD/etc), isPreorder (true/false), url (if found).
   Return a JSON array. Only include physical music releases, not merch or digital.
   If no products found, return [].
   ```

4. **`src/backend/routes/websites.ts`** — New route file:
   - `GET /api/v1/websites` — list monitored websites
   - `POST /api/v1/websites` — add website
   - `PATCH /api/v1/websites/:id` — update website
   - `DELETE /api/v1/websites/:id` — remove website
   - `POST /api/v1/websites/preview` — preview extraction without saving (body: `{ url, cssSelector? }`)
   - `GET /api/v1/websites/items` — all extracted items
   - `POST /api/v1/websites/scan` — start scan
   - `POST /api/v1/websites/:id/scan` — scan single website
   - `GET /api/v1/websites/scan/status` — scan progress
   - `POST /api/v1/websites/scan/cancel` — cancel scan
   - `POST /api/v1/websites/items/:id/seen` — mark as seen
   - `GET /api/v1/websites/settings` — get settings
   - `POST /api/v1/websites/settings` — save settings

5. **`src/server.ts`** — Instantiate `WebsiteMonitoringService`, mount websites router

6. **`src/backend/services/migrationService.ts`** — Register website JSON files

7. **`src/backend/services/backupService.ts`** — Add website files to backup/restore

8. **`src/renderer/services/api.ts`** — Add website monitoring API methods

9. **`src/renderer/pages/WebsitesPage.tsx`** + `WebsitesPage.page.css` — New page component:
   - Add website dialog: URL input, name, optional CSS selector
   - "Preview" button in dialog — fetches and shows extracted items before saving
   - Ollama connection status indicator
   - List of monitored websites with enable/disable toggle, scan/remove controls
   - Scan progress bar
   - Item cards showing extracted products
   - Settings panel

10. **`src/renderer/pages/MarketplacePage.tsx`** — Add `'websites'` tab, render `<WebsitesPage embedded />`

### Ollama Fallback
When Ollama is unavailable:
- `previewWebsite()` returns raw extracted text instead of structured items, with a warning
- Scan skips extraction if `ollamaRequired: true` (setting), otherwise stores raw text items with `confidence: 0`
- UI shows "Ollama unavailable" badge and suggests starting Ollama

---

## Implementation Order

1. **Feature A** (MusicBrainz reissues) — smallest delta, modifies existing services, no new dependencies
2. **Feature B** (label monitoring) — new service but follows established seller pattern exactly
3. **Feature C** (website monitoring) — most complex, new dependency (cheerio), Ollama integration

## Verification

- **Feature A**: Run existing release tracking tests, add tests for `getRecentReleases()` and deduplication. Trigger a sync and verify reissues appear with `isReissue: true` in the "Reissues" tab.
- **Feature B**: Add tests for label CRUD, scan, and matching. Add a known label (e.g., Fat Possum), trigger scan, verify recent releases appear.
- **Feature C**: Add tests for cheerio extraction and Ollama integration (mocked). Add a test website URL, verify preview returns structured items. Test fallback when Ollama is offline.
- **All**: `npm run build` succeeds, `npm test` passes, manual smoke test of each feature in the UI.
