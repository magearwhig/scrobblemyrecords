# Spotify Integration for Embedding Enrichment

## Overview

Integrate the Spotify Web API as an additional metadata source to enrich text profiles used by the embedding-based recommendation system. The primary value is **Spotify's genre taxonomy**, which is significantly more granular than Last.fm tags (e.g., "vapor soul", "bedroom pop", "dark cabaret" vs generic "rock", "electronic").

### Current State

The recommendation system builds text profiles from:
- **Discogs**: Artist, album, year, tracklist, format, label
- **Last.fm**: Artist tags, album tags, track tags, similar artists

### What Spotify Adds

Spotify's genre data fills a gap — Last.fm tags are user-generated and often noisy (e.g., "seen live", "favorites"), while Spotify genres are curated and consistent. Adding them as a complementary signal should improve embedding quality, especially for:
- Artists with sparse Last.fm tags
- Niche genres that Last.fm tags don't capture well
- Cross-genre artists where Spotify's multi-genre labeling is more precise

### Spotify API Reality (Post-February 2026)

The Spotify Web API underwent major cuts in February 2026. What's still available:

| Endpoint | Status | Useful Fields |
|----------|--------|---------------|
| **Search** (`GET /search`) | Available (limit: 10 results) | Artist name, ID, genres*, images |
| **Get Artist** (`GET /artists/{id}`) | Available | Name, ID, genres*, images |
| **Get Artist's Albums** (`GET /artists/{id}/albums`) | Available | Album names, release dates |
| **Get Several Artists** | **Removed** | N/A |
| **Get Artist's Top Tracks** | **Removed** | N/A |
| **Audio Features** | **Deprecated (Nov 2024)** | N/A |

\* `genres`, `popularity`, and `followers` are marked deprecated but may still be returned. The integration must handle their absence gracefully.

**Authentication**: OAuth 2.0 Client Credentials flow (no user login needed — we only access public catalog data).

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EXISTING ENRICHMENT PIPELINE                     │
│                                                                     │
│  Discogs Release ──▶ Last.fm Tags ──▶ Text Profile ──▶ Embedding  │
│                                                                     │
│                    NEW SPOTIFY ENRICHMENT                           │
│                                                                     │
│  Discogs Artist ──▶ Spotify Search ──▶ Spotify Artist ID          │
│                          │                    │                     │
│                          ▼                    ▼                     │
│                    Spotify Genres ──▶ Text Profile (enriched)      │
│                                                                     │
│  Discogs Album ──▶ Spotify Search ──▶ Spotify Album ID            │
│                          │                                          │
│                          ▼                                          │
│                    Album metadata ──▶ Text Profile (enriched)      │
└─────────────────────────────────────────────────────────────────────┘
```

### Service Architecture

```
spotifyAuthService          — OAuth Client Credentials token management
    ↓
spotifySearchService        — Artist/album search + ID matching
    ↓
spotifyEnricherService      — Fetch & cache Spotify metadata per artist
    ↓
profileBuilderService       — (modified) Include Spotify genres in text profile
```

All new services follow existing patterns: constructor injection, file-based JSON caching, graceful degradation on API failures.

---

## Phase 1: Spotify Authentication & Configuration

### 1.1 Settings & Configuration

Add Spotify config to `RecommendationSettings` (or separate settings file):

```typescript
interface SpotifySettings {
  enabled: boolean;              // Feature toggle (default: false until configured)
  clientId: string;              // From Spotify Developer Dashboard
  clientSecret: string;          // From Spotify Developer Dashboard
  rateLimitPerSecond: number;    // Default: 5 (Spotify is more generous than Last.fm)
  cacheMaxAgeDays: number;       // Default: 30 (same as Last.fm tags)
}
```

- Store credentials in the existing settings system (not `.env` — this app uses settings JSON files)
- Add Spotify client ID/secret inputs to the Settings page
- Encrypt secrets at rest using the same pattern as existing API keys

### 1.2 Auth Service (`spotifyAuthService.ts`)

Implements the Client Credentials flow:

```
POST https://accounts.spotify.com/api/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={clientId}
&client_secret={clientSecret}

Response: { access_token, token_type, expires_in }
```

Features:
- Token caching with automatic refresh (tokens expire after 1 hour)
- Retry with exponential backoff on 429 (rate limit) responses
- Connection test endpoint for settings page validation

### Files to Create

- `src/backend/services/spotifyAuthService.ts`
- `src/backend/services/spotifySettingsService.ts`

### Files to Modify

- `src/shared/types.ts` — Add SpotifySettings interface
- `src/renderer/pages/SettingsPage.tsx` — Add Spotify credential inputs + connection test button
- `src/backend/routes/settings.ts` — Add Spotify settings CRUD endpoints

---

## Phase 2: Artist Matching & Genre Fetching

### 2.1 Spotify Search Service (`spotifySearchService.ts`)

Matches Discogs artists/albums to Spotify entities:

```typescript
interface SpotifyArtistMatch {
  discogsArtistName: string;
  spotifyArtistId: string;
  spotifyArtistName: string;
  genres: string[];
  confidence: number;           // 0-1 based on name match quality
  matchedAt: number;            // timestamp
}

interface SpotifySearchService {
  searchArtist(artistName: string): Promise<SpotifyArtistMatch | null>;
  searchAlbum(artistName: string, albumName: string): Promise<SpotifyAlbumMatch | null>;
}
```

**Matching strategy**:
1. Search Spotify for `artist:{name}` with `type=artist`
2. Compare results by normalized name similarity (lowercase, strip "The", handle feat./ft.)
3. Accept matches above a configurable confidence threshold (default: 0.8)
4. If multiple matches, prefer the one with the most genres populated
5. Cache the mapping (artist name → Spotify ID + genres) for 30 days

**Edge cases**:
- Discogs uses "Various" for compilations — skip these
- Discogs artist names sometimes include numbers (e.g., "Pink Floyd (2)") — strip
- Handle "feat." / "ft." / "&" artist credits
- Some artists won't exist on Spotify — cache the miss to avoid re-searching

### 2.2 Spotify Enricher Service (`spotifyEnricherService.ts`)

Orchestrates enrichment for a collection:

```typescript
interface SpotifyEnricherService {
  enrichArtist(artistName: string): Promise<SpotifyArtistMatch | null>;
  enrichBatch(artistNames: string[], onProgress?: ProgressCallback): Promise<Map<string, SpotifyArtistMatch>>;
  getCachedGenres(artistName: string): string[] | null;
}
```

- Checks cache first; only calls Spotify API on cache miss or stale data
- Batch enrichment with bounded concurrency (default: 3 concurrent requests)
- Rate limiting: 5 req/sec (Spotify allows ~30/sec but conservative is safer)
- Progress reporting compatible with existing rebuild progress UI

### 2.3 Spotify Cache Storage (`spotifyStorageService.ts`)

File-based JSON storage following existing patterns:

```typescript
interface SpotifyArtistStore {
  schemaVersion: 1;
  entries: Record<string, SpotifyArtistMatch>;   // keyed by lowercase Discogs artist name
  misses: Record<string, number>;                 // artists not found on Spotify, with timestamp
}
```

**Storage location**: `embeddings/spotify-artists.json`

### Files to Create

- `src/backend/services/spotifySearchService.ts`
- `src/backend/services/spotifyEnricherService.ts`
- `src/backend/services/spotifyStorageService.ts`

---

## Phase 3: Profile Builder Integration

### 3.1 Modified Text Profile

The `profileBuilderService` is modified to include Spotify genres when available. The text profile format becomes:

**Before (current)**:
```
Artist: Pink Floyd
Album: The Dark Side of the Moon
Year: 1973
Genres: progressive rock, psychedelic rock, art rock
Tags: atmospheric, concept album, classic, experimental, british
Artist Tags: progressive, experimental, psychedelic, space rock
Similar Artists In Collection: King Crimson, Yes, Genesis
Tracks: Speak to Me, Breathe, On the Run, Time, ...
```

**After (with Spotify)**:
```
Artist: Pink Floyd
Album: The Dark Side of the Moon
Year: 1973
Genres: progressive rock, psychedelic rock, art rock
Spotify Genres: progressive rock, art rock, album rock, classic rock, psychedelic rock, symphonic rock
Tags: atmospheric, concept album, classic, experimental, british
Artist Tags: progressive, experimental, psychedelic, space rock
Similar Artists In Collection: King Crimson, Yes, Genesis
Tracks: Speak to Me, Breathe, On the Run, Time, ...
```

**Key decisions**:
- Spotify genres go on a **separate line** from Last.fm-derived genres so the embedding model can distinguish the signals
- If Spotify returns no genres (deprecated field removed), the line is simply omitted — no change to existing behavior
- Deduplication between Spotify genres and Last.fm tags is done at the profile level (exact string match only, no fuzzy dedup)

### 3.2 Profile Rebuild Trigger

When Spotify enrichment is first enabled or credentials change, users should rebuild embeddings to incorporate the new genre data. The existing "Rebuild All Embeddings" flow handles this — no new rebuild mechanism needed.

The `collectionIndexerService` already rebuilds text profiles before embedding. The only change is that `profileBuilderService.buildRecordProfile()` now also calls `spotifyEnricherService.getCachedGenres()`.

### 3.3 Incremental Enrichment During Rebuild

During a full rebuild:
1. **Before embedding loop**: Batch-enrich all unique artists via Spotify (with progress reporting)
2. **During per-record profile building**: Pull cached Spotify genres for each artist
3. This avoids hitting Spotify for every record — one API call per unique artist, cached for 30 days

### Files to Modify

- `src/backend/services/profileBuilderService.ts` — Add Spotify genres line to profile
- `src/backend/services/collectionIndexerService.ts` — Add Spotify batch enrichment step before embedding loop

---

## Phase 4: Frontend & Settings UI

### 4.1 Settings Page Additions

Add a "Spotify Integration" section to the Settings page:

```
┌─ Spotify Integration ─────────────────────────────────┐
│                                                         │
│  Status: ● Connected (143 artists matched)             │
│                                                         │
│  Client ID:     [________________________]             │
│  Client Secret: [________________________]             │
│                                                         │
│  [Test Connection]   [Save]                            │
│                                                         │
│  ┌─ Enrichment Stats ───────────────────────┐          │
│  │  Artists matched:  143 / 187 (76%)       │          │
│  │  Artists not found: 44                    │          │
│  │  Cache age: 12 days                       │          │
│  │  [Re-enrich All Artists]                  │          │
│  └──────────────────────────────────────────┘          │
│                                                         │
│  Note: After enabling Spotify, rebuild embeddings      │
│  to incorporate genre data into recommendations.       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Embedding Status Enhancement

Add Spotify enrichment status to the existing embedding status display:

- Show "Spotify genres: enabled/disabled" in embedding stats
- During rebuild, show Spotify enrichment phase as a sub-step in progress
- Show per-record whether Spotify genres were included in the profile

### 4.3 API Routes

```
POST /api/v1/spotify/test-connection     — Validate credentials
GET  /api/v1/spotify/status              — Enrichment stats (matched, missed, cache age)
POST /api/v1/spotify/enrich              — Trigger batch enrichment (without full embed rebuild)
```

### Files to Modify

- `src/renderer/pages/SettingsPage.tsx` — Add Spotify section
- `src/renderer/pages/RecommendationsPage.tsx` — Show Spotify genre presence in debug info

### Files to Create

- `src/backend/routes/spotify.ts` — Spotify-specific API routes

---

## Phase 5: Testing & Validation

### Unit Tests

- `spotifyAuthService` — Token caching, refresh, error handling
- `spotifySearchService` — Name matching, confidence scoring, edge cases
- `spotifyEnricherService` — Cache hits/misses, batch enrichment, rate limiting
- `spotifyStorageService` — CRUD operations, schema versioning
- `profileBuilderService` — Profile output with/without Spotify data

### Integration Tests

- Full enrichment pipeline: Discogs artist → Spotify search → cached → profile built
- Rebuild flow with Spotify enabled vs disabled
- Graceful degradation: Spotify API unavailable, genres field removed, invalid credentials

### Validation Strategy

Compare recommendation quality before/after Spotify integration:
1. Run recommendations with current profiles (baseline)
2. Rebuild with Spotify genres enabled
3. Run recommendations again
4. Compare: Are the recommended records more relevant? More diverse? Different genres represented?

---

## Implementation Order

```
Phase 1: Auth + Settings          (2 new services, settings UI)
    ↓
Phase 2: Search + Cache           (3 new services)
    ↓
Phase 3: Profile Integration      (2 modified services)
    ↓
Phase 4: Frontend                 (settings UI, status display)
    ↓
Phase 5: Testing                  (unit + integration tests)
```

Phases 1-3 are the core backend work. Phase 4 is UI. Phase 5 is validation.

Each phase can be implemented and tested independently. Spotify integration is entirely opt-in — the system works identically when Spotify is not configured.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Spotify fully removes `genres` field | Medium | Genres are the primary value; if removed, the integration provides little benefit. Design for graceful no-op. Monitor Spotify changelog. |
| Spotify rate limits Dev Mode apps aggressively | Low | Conservative rate limiting (5 req/sec). Batch + cache approach minimizes API calls. |
| Spotify Premium required for Dev Mode (Feb 2026) | Confirmed | User needs Spotify Premium to register a dev app. Document this requirement. |
| Poor artist name matching (Discogs → Spotify) | Medium | Fuzzy matching with confidence threshold. Log mismatches for manual review. Cache misses to avoid re-searching. |
| Spotify genres too different from Last.fm tags | Low | Separate profile line keeps signals distinct. Embedding model handles semantic similarity across naming conventions. |

---

## Dependencies & Prerequisites

- **Spotify Premium account** — Required to create a Developer Dashboard app (since Feb 2026)
- **Spotify Developer App** — User creates at https://developer.spotify.com/dashboard
- **No Ollama changes** — Same embedding model, same vector dimensions
- **No scoring changes** — Spotify data flows through text profiles → embeddings → cosine similarity. The scoring formula is unchanged.

---

## Future Enhancements (Out of Scope)

- **Spotify playback data**: If the user connects their Spotify account (Authorization Code flow), we could pull their Spotify listening history in addition to Last.fm scrobbles
- **Album-level Spotify matching**: Match albums (not just artists) for album-specific genre data
- **Spotify artist images**: Use Spotify's higher-quality artist images as fallback when Discogs images are missing
- **Playlist export**: Generate Spotify playlists from recommendations
- **MusicBrainz bridge**: Use MusicBrainz IDs to cross-reference between Discogs, Spotify, and Last.fm for better matching accuracy
