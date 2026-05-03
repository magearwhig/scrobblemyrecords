# Plan: Reissue & Label Discovery Features

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
