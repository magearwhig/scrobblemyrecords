# Embedding-Based Record Recommendation System

## Claude Code Agent Team Implementation Plan

### Project Context

This is an enhancement to an existing locally-hosted web application (Node.js/Fastify backend, React frontend) that integrates with Last.fm, Discogs, and Ollama APIs. The app currently has a prompt-based recommendation system that sends recent listening history to an Ollama chat model and asks for recommendations from the user's Discogs collection. We are replacing this with an embedding-based similarity system that is more deterministic, scalable, and produces better recommendations.

### Current Stack

- **Backend**: Node.js with Fastify
- **Frontend**: React
- **APIs**: Last.fm (listening history, artist/track metadata, tags), Discogs (vinyl collection)
- **AI**: Ollama (local, currently used for chat-based recs)
- **Storage**: SQLite (local cache)

### What We're Building

A vector-similarity recommendation engine that:

1. Generates a rich text profile for each record in the user's Discogs collection using metadata from Discogs + Last.fm tags
2. Converts each profile into a vector embedding using Ollama's embedding model
3. Builds a "current taste" vector from recent listening sessions
4. Ranks collection records by cosine similarity to current taste, weighted by additional signals (recency, play frequency, artist similarity)
5. Exposes recommendations through a Fastify API endpoint consumed by the React frontend

---

## Architecture Overview

### Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Discogs   │────▶│  Collection  │────▶│  Text Profile    │
│   API       │     │  Records     │     │  Generator       │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
┌─────────────┐     ┌──────────────┐               ▼
│  Last.fm    │────▶│  Tag/Genre   │────▶┌─────────────────┐
│  API        │     │  Enrichment  │     │  Ollama Embed   │
└─────────────┘     └──────────────┘     │  (nomic-embed-  │
                                          │   text)          │
┌─────────────┐     ┌──────────────┐     └────────┬────────┘
│  Last.fm    │────▶│  Recent      │               │
│  Scrobbles  │     │  Listening   │               ▼
└─────────────┘     │  Profile     │────▶┌─────────────────┐
                    └──────────────┘     │  SQLite Vector  │
                                          │  Storage        │
                                          └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  Cosine Sim +   │
                                          │  Weighted Score  │
                                          └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  Fastify API    │
                                          │  /recommend     │
                                          └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  React UI       │
                                          └─────────────────┘
```

### Text Profile Format

Each record in the collection gets a text profile assembled from multiple sources. This is the string that gets embedded.

```
Artist: Pink Floyd
Album: The Dark Side of the Moon
Year: 1973
Genres: progressive rock, psychedelic rock, art rock
Tags: atmospheric, concept album, classic, experimental, british
Artist Tags: progressive, experimental, psychedelic, space rock
Similar Artists In Collection: King Crimson, Yes, Genesis
Tracks: Speak to Me, Breathe, On the Run, Time, The Great Gig in the Sky, Money, Us and Them, Any Colour You Like, Brain Damage, Eclipse
```

The embedding model converts this into a high-dimensional vector that captures semantic meaning — records with similar vibes, eras, genres, and associations will be close together in vector space.

### Listening Session Profile

Same format but constructed from recent scrobbles:

```
Recent Artists: Radiohead, Portishead, Massive Attack
Recent Genres: trip-hop, alternative rock, electronic, post-rock
Recent Tags: atmospheric, melancholic, experimental, british, 90s
Listening Pattern: evening, long sessions, album-oriented
Top Recent Tracks: Glory Box, Teardrop, Everything In Its Right Place
```

### Scoring Formula

```
final_score = (
    cosine_similarity(record_embedding, session_embedding) * 0.50
  + artist_similarity_score * 0.20
  + recency_decay_score * 0.20
  + diversity_bonus * 0.10
)
```

Where:
- **cosine_similarity**: Core embedding match (0-1)
- **artist_similarity_score**: Does Last.fm's artist.getSimilar link this artist to recently played artists? (0-1)
- **recency_decay_score**: Higher for records not listened to recently, exponential decay on last play date (0-1)
- **diversity_bonus**: Small boost for records from genres/artists underrepresented in recent recs to avoid echo chamber (0-1)

---

## Database Schema Additions

Add these tables to the existing SQLite database:

```sql
-- Vector embeddings for collection records
CREATE TABLE IF NOT EXISTS record_embeddings (
    discogs_release_id INTEGER PRIMARY KEY,
    text_profile TEXT NOT NULL,
    embedding BLOB NOT NULL,          -- Float32Array stored as binary
    embedding_model TEXT NOT NULL,     -- e.g. 'nomic-embed-text'
    last_enriched_at TEXT NOT NULL,    -- ISO timestamp
    tags_json TEXT,                    -- cached tag data from Last.fm
    artist_similar_json TEXT           -- cached artist.getSimilar data
);

-- Precomputed artist similarity mappings
CREATE TABLE IF NOT EXISTS artist_similarity (
    artist_name TEXT NOT NULL,
    similar_artist_name TEXT NOT NULL,
    match_score REAL NOT NULL,         -- 0-1 from Last.fm
    last_fetched_at TEXT NOT NULL,
    PRIMARY KEY (artist_name, similar_artist_name)
);

-- Recommendation history for diversity scoring
CREATE TABLE IF NOT EXISTS recommendation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discogs_release_id INTEGER NOT NULL,
    recommended_at TEXT NOT NULL,
    score REAL NOT NULL,
    was_selected INTEGER DEFAULT 0     -- did the user scrobble this after rec?
);

-- Listening session snapshots for the session embedding
CREATE TABLE IF NOT EXISTS listening_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_text_profile TEXT NOT NULL,
    session_embedding BLOB NOT NULL,
    created_at TEXT NOT NULL,
    scrobble_window_hours INTEGER DEFAULT 168  -- how far back we looked (default 1 week)
);
```

---

## Ollama Integration

### Model Setup

The user needs `nomic-embed-text` pulled locally:

```bash
ollama pull nomic-embed-text
```

This model outputs 768-dimensional embeddings and handles up to 8192 tokens of input. It's good at semantic similarity for descriptive text like our profiles.

### Embedding API Call

```javascript
async function getEmbedding(text) {
    const response = await fetch('http://localhost:11434/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'nomic-embed-text',
            input: text
        })
    });
    const data = await response.json();
    return data.embeddings[0]; // Float64Array, 768 dimensions
}
```

### Cosine Similarity

```javascript
function cosineSimilarity(vecA, vecB) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

---

## Last.fm API Endpoints Used

### Tag Enrichment

```
// Artist tags - high signal for genre/vibe
GET http://ws.audioscrobbler.com/2.0/?method=artist.getTopTags&artist={name}&api_key={key}&format=json

// Track tags - more granular mood/vibe data
GET http://ws.audioscrobbler.com/2.0/?method=track.getTopTags&artist={name}&track={name}&api_key={key}&format=json

// Album tags
GET http://ws.audioscrobbler.com/2.0/?method=album.getTopTags&artist={name}&album={name}&api_key={key}&format=json
```

### Artist Similarity

```
// Returns up to 100 similar artists with match scores
GET http://ws.audioscrobbler.com/2.0/?method=artist.getSimilar&artist={name}&api_key={key}&format=json&limit=50
```

### Recent Listening Data

```
// Recent scrobbles (up to 200 per page)
GET http://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks&user={name}&api_key={key}&format=json&limit=200&from={unix_timestamp}

// Top artists for a time period
GET http://ws.audioscrobbler.com/2.0/?method=user.getTopArtists&user={name}&api_key={key}&format=json&period=7day

// Top tracks for a time period
GET http://ws.audioscrobbler.com/2.0/?method=user.getTopTracks&user={name}&api_key={key}&format=json&period=7day
```

---

## API Endpoints (Fastify)

### New Routes

```
POST /api/embeddings/rebuild
  - Rebuilds all collection embeddings (full re-index)
  - Long running, should use a job queue or SSE for progress
  - Rate-limited against Last.fm API

POST /api/embeddings/refresh/:releaseId
  - Re-embeds a single record (after new tags available, etc.)

GET /api/recommendations
  Query params:
    - count (default 10): number of recs to return
    - window (default 168): hours of listening history to consider
    - excludeRecent (default true): exclude records played in the window
    - minScore (default 0.3): minimum score threshold
  Response: Array of scored records with explanation

GET /api/recommendations/debug/:releaseId
  - Returns the full scoring breakdown for a specific record
  - Useful for understanding why something was or wasn't recommended

POST /api/recommendations/feedback
  Body: { releaseId, action: 'played' | 'skipped' | 'liked' }
  - Logs recommendation feedback for diversity scoring
```

---

## Agent Team Structure

Use 5 agents with clearly separated concerns. Each agent works on an independent slice that can be developed and tested in isolation before integration.

### Agent 1: Data Layer Agent

**Scope**: Database schema, data access layer, migration

**Tasks**:
1. Create SQLite migration adding the new tables defined above
2. Create a `repositories/` module with data access functions:
   - `EmbeddingRepository`: CRUD for record_embeddings table, bulk upsert, query by release ID
   - `ArtistSimilarityRepository`: CRUD for artist_similarity, lookup by artist name
   - `RecommendationLogRepository`: insert recs, query recent recs for diversity scoring
   - `ListeningSessionRepository`: insert/query session snapshots
3. Binary serialization helpers for embedding vectors (Float32Array <-> Buffer)
4. Write unit tests for all repository methods using an in-memory SQLite instance

**Key files to create**:
- `src/db/migrations/XXX_add_embedding_tables.js`
- `src/repositories/embeddingRepository.js`
- `src/repositories/artistSimilarityRepository.js`
- `src/repositories/recommendationLogRepository.js`
- `src/repositories/listeningSessionRepository.js`
- `src/utils/vectorSerialization.js`
- `tests/repositories/*.test.js`

**Dependencies**: None (can start immediately)

**Acceptance criteria**:
- All tables created via migration
- All CRUD operations tested
- Vector serialization round-trips without precision loss

---

### Agent 2: Enrichment Pipeline Agent

**Scope**: Last.fm tag fetching, artist similarity caching, text profile generation

**Tasks**:
1. Create an `enrichment/` module:
   - `TagEnricher`: Fetches and caches artist, album, and track tags from Last.fm
   - `ArtistSimilarityEnricher`: Fetches and caches artist.getSimilar data
   - `ProfileBuilder`: Assembles the text profile string for a given Discogs release using Discogs metadata + enriched tags + similar artist data
2. Implement rate limiting for Last.fm API calls (respect their guidelines, ~1 req/sec)
3. Implement caching logic — only re-fetch tags older than a configurable threshold (default 30 days)
4. Handle Last.fm API failures gracefully — partial profiles are fine, log what's missing
5. Write unit tests with mocked API responses

**Key files to create**:
- `src/enrichment/tagEnricher.js`
- `src/enrichment/artistSimilarityEnricher.js`
- `src/enrichment/profileBuilder.js`
- `src/enrichment/rateLimiter.js`
- `tests/enrichment/*.test.js`

**Dependencies**: Agent 1 (repositories for caching)

**Acceptance criteria**:
- Tags fetched and cached correctly
- Profile text assembled from multiple sources
- Rate limiting enforced
- Graceful degradation when Last.fm returns errors or empty data

---

### Agent 3: Embedding Engine Agent

**Scope**: Ollama embedding integration, vector operations, indexing pipeline

**Tasks**:
1. Create an `embedding/` module:
   - `OllamaEmbedder`: Wraps the Ollama embed API, handles connection errors and retries
   - `VectorOps`: Cosine similarity, vector averaging, normalization utilities
   - `CollectionIndexer`: Orchestrates full re-index of the collection (fetch profiles from Agent 2's ProfileBuilder, embed each, store via Agent 1's repository)
   - `SessionEmbedder`: Builds and embeds the current listening session profile
2. Implement batch embedding with configurable concurrency (Ollama can be slow, don't overwhelm it)
3. Implement incremental indexing — only re-embed records whose profiles have changed
4. Add progress reporting via callback/event emitter for the UI to consume
5. Write unit tests with mocked Ollama responses

**Key files to create**:
- `src/embedding/ollamaEmbedder.js`
- `src/embedding/vectorOps.js`
- `src/embedding/collectionIndexer.js`
- `src/embedding/sessionEmbedder.js`
- `tests/embedding/*.test.js`

**Dependencies**: Agent 1 (vector storage), Agent 2 (profile text)

**Acceptance criteria**:
- Embeddings generated and stored correctly
- Cosine similarity computed accurately (validate against known test vectors)
- Full collection indexing works with progress reporting
- Incremental indexing skips unchanged records

---

### Agent 4: Recommendation Scoring Agent

**Scope**: The scoring algorithm, recommendation generation, API routes

**Tasks**:
1. Create a `recommendations/` module:
   - `ScoringEngine`: Implements the weighted scoring formula combining cosine similarity, artist similarity, recency decay, and diversity bonus
   - `RecencyScorer`: Calculates recency decay from last scrobble date (exponential decay, configurable half-life)
   - `DiversityScorer`: Checks recommendation log and penalizes recently recommended genres/artists
   - `RecommendationService`: Orchestrates the full recommendation pipeline — build session embedding, score all records, sort, filter, return top N
2. Register Fastify routes:
   - `GET /api/recommendations` — main recommendation endpoint
   - `GET /api/recommendations/debug/:releaseId` — scoring breakdown
   - `POST /api/recommendations/feedback` — log user actions
   - `POST /api/embeddings/rebuild` — trigger re-index
   - `POST /api/embeddings/refresh/:releaseId` — single record refresh
3. Add SSE or polling endpoint for rebuild progress
4. Write integration tests for the full recommendation pipeline

**Key files to create**:
- `src/recommendations/scoringEngine.js`
- `src/recommendations/recencyScorer.js`
- `src/recommendations/diversityScorer.js`
- `src/recommendations/recommendationService.js`
- `src/routes/recommendations.js`
- `src/routes/embeddings.js`
- `tests/recommendations/*.test.js`

**Dependencies**: Agent 1 (data), Agent 3 (embeddings)

**Acceptance criteria**:
- Recommendations returned with scores and explanations
- Debug endpoint shows full scoring breakdown
- Feedback logging works
- Rebuild triggers full re-index with progress reporting

---

### Agent 5: Frontend Agent

**Scope**: React UI components for recommendations and embedding management

**Tasks**:
1. Create a recommendations page/view:
   - Displays recommended records as cards with album art (from Discogs), artist, title, year, score
   - Score visualization (progress bar or similar)
   - Brief explanation of why each record was recommended (top matching tags, similar artists)
   - "I played this" / "Not interested" action buttons for feedback
   - Configurable listening window slider (1 day, 3 days, 1 week, 2 weeks, 1 month)
   - "Refresh" button to re-generate recommendations
2. Create an embedding management section (settings or admin area):
   - "Rebuild All Embeddings" button with progress bar
   - Stats: total records embedded, last rebuild time, average embedding age
   - Table showing records with missing/stale embeddings
3. Integrate with existing navigation/layout
4. Handle loading, error, and empty states

**Key files to create**:
- `src/client/components/Recommendations.jsx` (or .tsx)
- `src/client/components/RecommendationCard.jsx`
- `src/client/components/EmbeddingManager.jsx`
- `src/client/hooks/useRecommendations.js`
- `src/client/hooks/useEmbeddingStatus.js`

**Dependencies**: Agent 4 (API routes)

**Acceptance criteria**:
- Recommendations display correctly with album art and scores
- Feedback actions call the API and update UI optimistically
- Rebuild progress shows in real time
- Graceful handling of empty state (no embeddings yet)

---

## Agent Execution Order

```
Phase 1 (parallel):
  Agent 1: Data Layer ─────────────────┐
                                        │
Phase 2 (parallel, after Agent 1):      │
  Agent 2: Enrichment Pipeline ────────┤
  Agent 3: Embedding Engine ───────────┤
                                        │
Phase 3 (after Agents 2+3):            │
  Agent 4: Recommendation Scoring ─────┤
                                        │
Phase 4 (after Agent 4):               │
  Agent 5: Frontend ───────────────────┘
```

Agents 2 and 3 can run in parallel once Agent 1 is complete. Agent 4 needs 2 and 3. Agent 5 needs 4.

---

## Configuration

Add these to the app's existing config:

```json
{
  "embedding": {
    "model": "nomic-embed-text",
    "ollamaUrl": "http://localhost:11434",
    "batchSize": 5,
    "concurrency": 2,
    "cacheMaxAgeDays": 30
  },
  "recommendations": {
    "defaultCount": 10,
    "defaultWindowHours": 168,
    "weights": {
      "cosineSimilarity": 0.50,
      "artistSimilarity": 0.20,
      "recencyDecay": 0.20,
      "diversityBonus": 0.10
    },
    "recencyDecayHalfLifeDays": 90,
    "excludeRecentlyPlayed": true,
    "excludeRecentlyRecommended": true,
    "recentlyRecommendedWindowDays": 7
  }
}
```

---

## Setup Instructions (for README)

1. Ensure Ollama is running locally: `ollama serve`
2. Pull the embedding model: `ollama pull nomic-embed-text`
3. Run the database migration (however your app handles this)
4. Navigate to Embedding Manager in the app UI
5. Click "Rebuild All Embeddings" — this will:
   - Fetch your Discogs collection
   - Enrich each record with Last.fm tags (rate-limited, takes a while on first run)
   - Generate embeddings for each record
6. Go to Recommendations page — recs will be based on your Last.fm listening history

First-time embedding of a large collection (500+ records) will take 15-30+ minutes due to Last.fm rate limiting. Subsequent rebuilds are incremental and much faster.

---

## Future Enhancements (Out of Scope for This Implementation)

- **Feedback loop**: Use recommendation_log data to fine-tune scoring weights automatically
- **Mood/time-of-day context**: Embed time-of-day patterns from scrobble timestamps
- **Wantlist integration**: Score Discogs wantlist items the same way to prioritize purchases
- **Custom embedding fine-tuning**: Train adapter on user feedback pairs (step toward custom ML model)
- **MusicBrainz enrichment**: Cross-reference via barcodes for additional genre/tag data
- **Side B discovery**: Surface deep cuts from records the user owns but only plays hits from
