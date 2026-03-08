# Discogs to Last.fm Scrobbler

[![CI](https://github.com/magearwhig/scrobblemyrecords/actions/workflows/ci.yml/badge.svg)](https://github.com/magearwhig/scrobblemyrecords/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Last Commit](https://img.shields.io/github/last-commit/magearwhig/scrobblemyrecords)](https://github.com/magearwhig/scrobblemyrecords/commits/main)
[![Code Coverage](https://img.shields.io/badge/coverage-4131%20tests-brightgreen)](https://github.com/magearwhig/scrobblemyrecords)

🎵 **Sync your Discogs vinyl collection to Last.fm automatically!**

A modern web application that bridges your Discogs collection with Last.fm scrobbling. Browse your vinyl collection, select albums or tracks, and automatically scrobble them to your Last.fm profile with customizable timestamps.

## ✨ What This Does

- **Browse Your Collection**: View your entire Discogs vinyl collection with search and filtering
- **Smart Scrobbling**: Select individual tracks or entire albums to scrobble
- **Batch Operations**: Scrobble multiple albums at once with progress tracking
- **Time Control**: Auto timing (as if you just finished listening) or set custom timestamps for your scrobbles
- **Local-first**: Runs on your machine (browser UI + local Node/Express API) - your data stays on your computer
- **Caching**: 24-hour cache keeps your collection loading fast

## 🚀 Quick Start

1. **Install**:
   ```bash
   git clone <repository-url>
   cd recordscrobbles
   npm install
   ```

2. **Configure `.env`**: Copy `.env.example` to `.env` and fill in the required values (see **Configuration** below).

3. **Run (dev)**:
   ```bash
   npm run dev:app
   ```

4. **Open Browser**: Navigate to `http://localhost:8080`

5. **Authenticate & Scrobble**: Use **Setup & Authentication** in the UI to connect Discogs + Last.fm, then start scrobbling.

## 📋 Prerequisites

- **Node.js 18+** and npm
- **Discogs account** with API access
- **Last.fm account** with API access

## 🔧 API Setup

### Discogs API (Required)
1. Go to [Discogs Settings → Developers](https://www.discogs.com/settings/developers)
2. Click "Create an Application"
3. Fill in:
   - **Name**: "Discogs to Last.fm Scrobbler"
   - **Description**: "Web app for scrobbling Discogs collection to Last.fm"
   - **Callback URL**: `http://localhost:3001/api/v1/auth/discogs/callback`
4. Save your **Consumer Key** and **Consumer Secret**

**Alternative (no app creation):** You can use a **Discogs Personal Access Token** instead. Generate one from the same Discogs developer settings page and enter it in the in-app **Setup & Authentication** page.

### Last.fm API (Required)
1. Visit [Last.fm API Account Creation](https://www.last.fm/api/account/create)
2. Fill in:
   - **Application Name**: "Discogs to Last.fm Scrobbler"
   - **Description**: "Web app for scrobbling Discogs collection"
   - **Callback URL**: `http://localhost:3001/api/v1/auth/lastfm/callback`
3. Save your **API Key** and **Shared Secret**

## ⚙️ Configuration (.env)

Create a `.env` file in the project root (it is ignored by git). You can start from `.env.example`.

### Required
- `ENCRYPTION_KEY`: used to encrypt stored credentials at rest (must be **32+ characters**). Generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `LASTFM_API_KEY` and `LASTFM_SECRET`: from your Last.fm API app
- Discogs (choose one):
  - **OAuth (recommended)**: `DISCOGS_CLIENT_ID` + `DISCOGS_CLIENT_SECRET`
  - **Personal Access Token**: use the in-app Setup flow (no Discogs app required)

### Optional
- `BACKEND_PORT` (default `3001`)
- `FRONTEND_PORT` (default `8080`, dev server only)
- `HOST` (default `127.0.0.1`)
- `DISCOGS_CALLBACK_URL` / `LASTFM_CALLBACK_URL` (if you need custom callback URLs)
- `FRONTEND_URL` (additional allowed origin for CORS)

> If you change `BACKEND_PORT`, update the callback URLs in your Discogs/Last.fm apps accordingly.

## 🏃‍♂️ Running the App

### Development Mode (Recommended)
```bash
npm run dev:app
```
- Backend: `http://localhost:3001`
- Frontend: `http://localhost:8080`
- Auto-opens browser with hot reload

### Production Mode
```bash
npm run start:web
```

## 🎯 Features

### Core Features
- **Home Dashboard**: Engaging dashboard with quick stats, quick actions, recent albums, and monthly highlights
- **Collection Browser**: Search and filter your Discogs collection
- **Release Details**: Side/disc track selection and per-album scrobble history
- **Track Selection**: Choose individual tracks or entire albums
- **Batch Scrobbling**: Scrobble multiple items with progress tracking
- **Smart Timing**: Auto timing (simulates just finishing listening) or custom timestamps
- **History View**: Dual-tab history showing app scrobble sessions and synced Last.fm listening history
- **Stats Dashboard**: Comprehensive listening statistics, listening patterns, genre analysis, and visualizations
- **Collection Analytics**: Format breakdown, label distribution, decade histogram, growth timeline, and progressive collection value estimation from Discogs marketplace data
- **Artist & Track Deep Dives**: Clickable artist/track names throughout the app link to rich detail pages
- **What to Play Hub**: Play Suggestions, Forgotten Favorites, and Dusty Corners in one place
- **Marketplace Hub**: Wishlist, New Releases, Local Sellers, Seller Matches, and Missing Albums
- **Wrapped**: Spotify Wrapped-style period-in-review slideshow for any date range
- **Discard Pile**: Track records to sell, gift, or remove with marketplace integration
- **Cache Management**: Force reload collection data when needed
- **Cache Updates**: Check for new Discogs additions and update the cache incrementally
- **Discovery + Mapping**: Find "missing" albums/artists and map them to items in your collection
- **Keyboard Shortcuts**: Global shortcuts for quick navigation (press `?` to see all)
- **Setup Progress**: Guided setup banner shows remaining configuration steps
- **Sync Status Bar**: Real-time sync progress indicator in the header
- **Saved Filter Presets**: Save and recall collection filter configurations
- **Breadcrumbs**: Detail pages show navigation breadcrumbs for easy back-navigation
- **Dark Mode**: Toggle between light and dark themes
- **Local Timezone**: All times displayed in your local timezone
- **Sorting Options**: Sort collection by artist, title, year, date added, or scrobble count
- **Artist Name Resolution**: Unified alias graph resolves Discogs/Last.fm name variants across stats, history, and Wrapped
- **Artist Name Mapping**: Map Discogs artist names to Last.fm names for consistent scrobbling
- **Disambiguation Warnings**: Alerts when scrobbling artists with Discogs disambiguation suffixes (e.g., "Ghost (32)")
- **Possible Mappings**: Automatically suggests artists in your collection that may need name mappings
- **Split Entry Detection**: Detects and merges duplicate history entries caused by artist name variants

### 🏠 Home Dashboard
Your personalized dashboard showing key metrics and insights at a glance:

**Quick Stats:**
- Current listening streak and monthly scrobble count
- New artists discovered this month
- Collection coverage percentage
- Total listening hours

**Quick Actions:**
- Seller matches from monitored local record shops
- Missing albums from your listening history
- Dusty corners (albums you haven't played recently)
- One-click navigation to relevant pages

**Recent Activity:**
- Last 5 albums you played (album-focused view)
- Monthly top 5 artists and albums
- On This Day: what you were listening to on this date in previous years
- Calendar heatmap of listening activity
- Progress toward scrobble milestones

**Connection Status:**
- Server and API connection status
- Discogs and Last.fm authentication
- Auto-collapses when all services connected

### 📈 Stats Dashboard
Comprehensive listening statistics and visualizations:

- **Listening Streak**: Track your daily listening streak and longest streak ever
- **Scrobble Counts**: Today, this week, this month, this year, and all-time totals
- **Listening Hours**: Track how many hours you've spent listening
- **New Artists**: Count of new artists discovered this month
- **Collection Coverage**: Percentage of your vinyl collection played over various time periods
- **Calendar Heatmap**: GitHub-style visualization of daily listening activity by year, with click-to-expand day detail showing albums played
- **Listening Patterns**: Hourly polar chart (24-hour radar) and day-of-week bar chart with personalized insights ("You're an evening listener")
- **On This Day**: See what you were listening to on this date 1, 2, and 3 years ago
- **Your Music DNA**: Genre treemap powered by Last.fm artist tags, showing your top genres weighted by listening habits
- **Top Artists & Albums**: Leaderboards with period selection (week/month/year/all-time/custom) with Spotify play buttons
- **Custom Date Range**: Pick specific months or custom date ranges for all stats
- **Milestone Progress**: Track progress toward scrobble milestones (1K, 5K, 10K, etc.)
- **Dusty Corners**: Albums in your collection you haven't played in 6+ months, with Spotify play buttons
- **Collection ROI Score**: "Bang for your buck" leaderboard showing plays-per-dollar for albums in your collection with marketplace value data
- **Album Listening Arc**: Monthly play count chart for any album, revealing honeymoon phases, plateaus, and rediscovery
- **Taste Drift**: Genre trajectory chart showing how your listening taste evolves over time by quarter
- **Source Breakdown**: See which sources your scrobbles come from
- **Listening Timeline**: Visualize listening trends over time

### 📊 Collection Analytics
Insights into your vinyl collection powered by Discogs data -- no Last.fm sync required:

- **Collection Summary**: Total records, artists, labels, average release year, and rating stats
- **Format Breakdown**: Donut chart and detailed list showing LP, 7", 12", CD, cassette, and other format distribution with example releases
- **Label Distribution**: Horizontal bar chart and ranked list of your most-collected labels with variant name grouping
- **Decade Histogram**: Bar chart showing which musical eras dominate your shelves, with year-level drill-down
- **Growth Timeline**: Area chart tracking collection size over time with monthly or yearly granularity
- **Collection Value Estimation**: Progressive marketplace scan fetches median (VG+), low, and high prices for every release. Includes most/least valuable items, value by decade, and value by format
- **Scan Progress**: Background scanning with real-time progress bar, ETA, and current-item display. Resumable after interruption with 7-day cache per release

### 🎤 Artist & Track Deep Dives
Click any artist or track name throughout the app to navigate to a dedicated detail page:

**Artist Detail Page:**
- Play trend chart with period selector (weekly/monthly/yearly)
- Period stats: this week, this month, this year, all-time
- Top tracks by play count
- Albums list with "In Collection" badges and cover art
- First/last played dates
- External links to Last.fm and Spotify

**Track Detail Page:**
- Play trend chart with period selector
- Total play count with first/last played dates
- "Appears On" album list with collection badges
- Clickable artist name linking back to artist detail
- External links to Last.fm and Spotify

**Clickable Links Across the App:**
- Stats page top lists (artists, albums, tracks)
- Last.fm listening history
- Monthly highlights on the dashboard
- Release details page artist names
- Album cards throughout the collection

### 🎲 What to Play
A hub for deciding what to spin next, with three tabs: **Play Suggestions**, **Forgotten Favorites**, and **Dusty Corners**.

#### Play Suggestions
Intelligent album recommendations based on 9 weighted factors:

| Factor | Description |
|--------|-------------|
| **Recency Gap** | Prioritize albums you haven't played in a while |
| **Never Played** | Boost albums never scrobbled from any source |
| **Recent Addition** | Highlight newly added vinyl you may want to spin |
| **Artist Affinity** | Suggest artists you frequently listen to |
| **Era Preference** | Match decades you prefer based on listening history |
| **User Rating** | Prioritize albums you've rated highly |
| **Time of Day** | Context-aware suggestions based on listening patterns |
| **Diversity** | Avoid repetitive suggestions from same artist/era |
| **Completeness** | Favor albums you tend to listen to in full |

**Features:**
- Adjustable weight controls for each factor
- Refresh for new suggestions
- One-click navigation to collection
- "Why this suggestion?" breakdown

#### Forgotten Favorites
Surface tracks with high all-time play counts that you haven't listened to recently:

- **Configurable Dormant Period**: Set how long "forgotten" means (3 months to 3 years)
- **Configurable Min Plays**: Filter by minimum play count (5 to 100+)
- **Sorting Options**: Sort by play count, artist name, track name, or dormancy
- **Copy to Clipboard**: Copy single track or all tracks for playlist creation
- **CSV Export**: Export your forgotten favorites for external use
- **Last.fm Links**: Quick access to track pages on Last.fm
- **Spotify Integration**: Play button for each track
- **Track Mapping Support**: Manual track mappings ensure accurate matching

#### Dusty Corners
Albums in your collection you haven't played in 6+ months:

- Sorted by how long since last played
- Spotify play buttons for quick rediscovery
- Configurable dormancy threshold

### 📊 Scrobble History Sync
Sync your complete Last.fm history for smarter suggestions:

- **Progressive Sync**: Quick start with recent scrobbles, full history syncs in background
- **Auto-Sync**: Automatically updates on startup (configurable)
- **Storage Efficient**: ~5-10 MB for 50,000+ scrobbles
- **Source Agnostic**: Captures plays from Spotify, Apple Music, or any Last.fm source

**Sync Controls** (Settings → Scrobble History):
- Manual "Sync Now" button
- Pause/Resume during background sync
- Clear index for full re-sync
- Toggle auto-sync on startup

### 📜 History Page
Two-tab view of your listening activity:

**App Scrobble Sessions Tab:**
- Sessions scrobbled from this app to Last.fm
- Status indicators (completed, failed, pending)
- Album cover thumbnails
- Resubmit failed sessions
- Delete pending/failed sessions
- Backfill album covers from Discogs

**Last.fm Listening History Tab:**
- Your complete synced listening history from all sources
- Search by artist or album name
- Sort by play count, last played, artist, or album
- Paginated view for large libraries
- Play count and last played date for each album
- **Spotify Integration**: Play button for each track to instantly search and play on Spotify
- Sync controls to update the history index

### 🔍 Discovery Page
Find albums and artists you listen to but don't own on vinyl:

**Missing Albums Tab:**
- **Missing Albums**: Albums in your scrobble history not in your collection
- **Play Count Sorting**: Prioritized by how often you listen
- **Map to Collection**: Mark a "missing" album as owned by mapping it to an item in your Discogs collection
- **Monitor for Vinyl**: Start monitoring albums you want on vinyl
- **Status Badges**: "In Wishlist" for Discogs wantlist items, "Monitoring" for locally monitored items
- **Hide Wishlisted & Monitored**: Toggle to filter out items already being tracked

**Missing Artists Tab:**
- **Missing Artists**: Artists you love but don't have on vinyl
- **Play Count Sorting**: Prioritized by how often you listen
- **Map to Collection**: Map artist to a release in your collection

### 🛒 Marketplace
A hub for all acquisition-related features, with tabs for Wishlist, New Releases, Local Sellers, Seller Matches, and Missing Albums.

#### ❤️ Wishlist
Sync and manage your Discogs wantlist with vinyl availability tracking:

**Discogs Wantlist Sync:**
- **Auto-Sync**: Sync your Discogs wantlist with one click
- **Vinyl Status**: See which albums have vinyl pressings available
- **CD-Only Tracking**: Identify albums only available on CD/digital
- **Progressive Checking**: Vinyl availability checked progressively to respect API limits
- **Refresh All**: Force re-check vinyl status for all items

**Filtering & Sorting:**
- **Tabs**: All Items, Has Vinyl, CD Only, Affordable, Monitoring, New Releases
- **Sort Options**: Date Added, Price, Artist, Album, Scrobbles (Most Played)
- **Include Monitored Toggle**: Merge locally monitored albums into main wishlist view
- **Affordable Filter**: Show items under your price threshold

**Version Browser:**
- View all pressings for any master release
- Format details (LP, 12", 7", etc.)
- Country of origin
- Marketplace pricing (lowest, median, highest)
- Direct links to Discogs marketplace

**Local Monitored List:**
- Add albums from Discovery page to monitor for vinyl availability
- Check for vinyl availability on demand
- Notifications when vinyl becomes available
- Independent from Discogs wantlist (monitor anything)

**Settings (Settings → Wishlist):**
- **Price Threshold**: Filter by maximum price
- **Currency**: USD, EUR, GBP, CAD, AUD, JPY
- **Auto-Sync Interval**: Manual, daily, weekly, etc.
- **Vinyl Notifications**: Get notified when watched items get vinyl

**Vinyl Watch List:**
- Watch CD-only albums for future vinyl releases
- Automatic notifications when vinyl becomes available
- Manage watch list from Settings page

**New Releases Tab:**
- Track new vinyl pressings for albums on your wishlist
- Automatic detection of new versions (pressings) for master releases
- Batch processing respects Discogs API rate limits
- Filter by source: Discogs Wishlist, Local Want List, or Vinyl Watch List
- Filter by detection timeframe: 7 days, 30 days, or 90 days
- Dismiss individual releases or bulk dismiss all
- Quick links to Discogs marketplace listings

#### 🏪 Local Sellers
Track Discogs inventories of your favorite local record shops to find wishlist items available nearby:

**Seller Management:**
- Add local record stores by their Discogs seller username
- Custom display names for easy identification
- View inventory size and match counts at a glance
- Remove sellers when no longer needed

**Inventory Scanning:**
- **Full Scan**: Weekly comprehensive inventory scan
- **Quick Check**: Daily check for newest listings
- Progressive pagination handles large inventories (10,000+ items)
- Intelligent caching reduces API calls

**Match Detection:**
- Automatically matches seller inventory against your Discogs wishlist
- Vinyl-only filtering (LP, 12", 10", 7")
- Match by master release ID for accurate detection
- Track match lifecycle: active → seen → sold

**Match Management:**
- View all matches across all sellers
- Filter by seller, sort by newest/price/artist
- "Mark as Seen" to dismiss without buying
- Direct links to Discogs marketplace listings
- Notifications when new matches are found

**Settings (Settings → Sellers):**
- Configure scan frequency
- Enable/disable notifications
- Quick-add sellers directly from settings

#### 🎵 New Releases
Track new and upcoming releases from artists in your collection using MusicBrainz data:

**Release Discovery:**
- **Automatic Detection**: Scans MusicBrainz for new releases from artists in your Discogs collection
- **Upcoming Releases**: See what's coming before release dates
- **Recent Releases**: Discover albums released in the past 3 months
- **Release Types**: Albums, EPs, singles, compilations - filter by type

**Artist Disambiguation:**
- **Smart Matching**: Auto-matches artists with high confidence (score >= 95%)
- **Manual Resolution**: Disambiguation dialog for artists with multiple MusicBrainz matches
- **Persistent Mappings**: Once confirmed, artist mappings are stored permanently

**Vinyl Integration:**
- **Availability Check**: On-demand Discogs search for vinyl pressings
- **Price Range**: See marketplace pricing when vinyl is available
- **Wishlist Integration**: One-click add to your Discogs wishlist
- **Status Badges**: Vinyl Available, CD Only, or Not Found

**Cover Art:**
- Album artwork from Cover Art Archive (MusicBrainz)
- Lazy loading with 30-day caching

**Filtering & Tabs:**
- All Releases, Upcoming Only, Recent Only, Vinyl Available
- Filter by release type (album, EP, single, compilation)
- Hide releases already in wishlist

**Settings (Settings → Releases):**
- Enable/disable release notifications
- Include/exclude EPs and singles
- Configure check frequency

### 🤖 AI Suggestions (Optional)
Local AI-powered recommendations via [Ollama](https://ollama.ai). Runs entirely on your computer with no API fees.

#### Installation

<details>
<summary><strong>macOS</strong></summary>

**Option 1: Homebrew (Recommended)**
```bash
brew install ollama
```

**Option 2: Direct Download**
1. Download from [ollama.ai/download](https://ollama.ai/download)
2. Open the `.dmg` file and drag Ollama to Applications
3. Launch Ollama from Applications

**Start the Service:**
```bash
ollama serve
```
Or launch the Ollama app (it runs in the menu bar).

</details>

<details>
<summary><strong>Windows</strong></summary>

**Option 1: Installer (Recommended)**
1. Download the Windows installer from [ollama.ai/download](https://ollama.ai/download)
2. Run `OllamaSetup.exe`
3. Follow the installation wizard
4. Ollama starts automatically and runs in the system tray

**Option 2: winget**
```powershell
winget install Ollama.Ollama
```

**Verify Installation:**
```powershell
ollama --version
```

**Note:** On Windows, Ollama runs as a background service automatically after installation.

</details>

<details>
<summary><strong>Linux</strong></summary>

**One-line Install:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Start the Service:**
```bash
ollama serve
```

Or run as a systemd service:
```bash
sudo systemctl start ollama
sudo systemctl enable ollama  # Start on boot
```

</details>

#### Download Models

After installing Ollama, download the required models:

```bash
# Required for embedding-based recommendations
ollama pull nomic-embed-text

# Required for AI chat suggestions (pick one)
ollama pull mistral
```

**Embedding Model (Required for Recommendations):**

| Model | Command | Size | Best For |
|-------|---------|------|----------|
| **nomic-embed-text** | `ollama pull nomic-embed-text` | 274 MB | Embedding-based recommendations (768-dim vectors) |

**Chat Models (For AI Suggestions):**

| Model | Command | Size | RAM Required | Best For |
|-------|---------|------|--------------|----------|
| **Mistral 7B** | `ollama pull mistral` | 4.1 GB | 8 GB | Best overall quality/speed balance (recommended) |
| **Llama 3.2 3B** | `ollama pull llama3.2` | 2.0 GB | 4 GB | Fast responses, good reasoning |
| **Phi-3 Mini** | `ollama pull phi3` | 2.3 GB | 4-8 GB | Microsoft's efficient model |
| **Gemma 2B** | `ollama pull gemma:2b` | 1.4 GB | 4 GB | Ultra-lightweight, fastest |
| **Llama 3.1 8B** | `ollama pull llama3.1` | 4.7 GB | 8 GB | Latest Llama, excellent quality |

**Tips for Model Selection:**
- **8+ GB RAM**: Use Mistral 7B or Llama 3.1 for best results
- **4-8 GB RAM**: Llama 3.2 3B offers great balance
- **Limited RAM (<4 GB)**: Gemma 2B works but with reduced quality
- First model load takes 10-30 seconds; subsequent calls are faster

#### Enable AI Chat Suggestions

1. Go to **Settings → AI Recommendations**
2. Toggle "Enable AI suggestions"
3. Select your downloaded model from the dropdown
4. Click "Test Connection" to verify
5. AI suggestions will appear on the Suggestions page

#### Enable Embedding-Based Recommendations

1. Ensure `nomic-embed-text` is pulled: `ollama pull nomic-embed-text`
2. Go to **Recommendations** (✨ in sidebar)
3. Click "Rebuild All Embeddings" to index your collection
4. First-time indexing fetches Last.fm tags (rate-limited at 1 req/sec) — large collections (500+ records) take 15-30+ minutes
5. Subsequent rebuilds are incremental and much faster
6. Recommendations are based on your recent Last.fm listening history

#### Troubleshooting Ollama

**"Connection refused" error:**
- Ensure Ollama is running: `ollama serve` (or check system tray on Windows)
- Default URL is `http://localhost:11434`

**"Model not found" error:**
- Download the model first: `ollama pull mistral`
- List installed models: `ollama list`

**Slow first response:**
- Normal! First call loads model into memory (10-30s)
- Subsequent calls are much faster

**High memory usage:**
- Models stay in RAM for fast access
- Use `ollama stop` to unload, or choose a smaller model

#### Features
- Contextual awareness (time of day, recent listening patterns)
- Natural language reasoning explaining picks
- Confidence level indicator
- Works alongside algorithm-based suggestions
- **Cost: $0** - Runs 100% locally, no API fees, works offline

### 🎧 Spotify Integration
Instantly play tracks and albums on Spotify with one-click play buttons throughout the app:

**How It Works:**
- Click any play button (▶️) to search for and play the track/album on Spotify
- Automatically tries desktop app first via `spotify:` URI scheme
- Falls back to web player if desktop app isn't installed
- No Spotify API authentication required - uses simple deep linking

**Where You'll Find Play Buttons:**
- **Forgotten Favorites**: Play individual forgotten tracks
- **Last.fm History**: Play any track from your listening history
- **Top Tracks & Albums**: Play trending tracks and albums from Stats page
- **Release Details**: Play entire albums or individual tracks
- **Dusty Corners**: Rediscover albums you haven't played recently
- **All Track Listings**: Play buttons wherever tracks appear

**Requirements:**
- Spotify free or premium account
- Spotify desktop app (recommended) or web browser access
- No additional configuration needed

### 🎁 Wrapped (Period in Review)
A Spotify Wrapped-style interactive slideshow summarizing your listening activity over any time period:

**Presets & Custom Ranges:**
- Quick presets: This Year, Last Year, Last 6/3 Months, This/Last Month
- Custom date range picker for any period
- Works with Last.fm only -- Discogs connection is optional (collection slides appear automatically when available)

**Slideshow Slides:**
- Total scrobbles, listening hours, unique artists/albums
- Top artists, top albums, top tracks with play counts
- New artists discovered during the period
- Peak listening day and longest listening streak
- Collection growth (records added) -- when Discogs connected
- Most-played new addition -- when Discogs connected
- Vinyl vs digital listening breakdown -- when Discogs connected
- Listening activity heatmap

### 📦 Discard Pile
Track records you want to sell, gift, trade in, or remove from your collection:

- **Reasons**: Mark albums as selling, duplicate, damaged, upgrading, not listening, or giving away
- **Status Tracking**: Marked, listed, sold, gifted, traded in, or removed
- **Traded In**: Mark records traded at a store — data preserved locally as permanent history
- **Bulk Operations**: Multi-select with shift-click range selection, bulk "Trade In" with confirmation
- **Marketplace Integration**: Track listing URLs and sale prices
- **Orphaned Detection**: Find records no longer in your Discogs collection
- **Stats**: Total items, estimated value, actual sales — financial stats reflect current filter view
- **Tabs**: Active (default, hides completed items), Pending, Listed, History (sold/gifted/traded in/removed), Orphaned
- **Component Architecture**: Decomposed into DiscardItemCard, DiscardStatsBar, DiscardFilterBar, and selection hook

### 📀 Album Scrobble History
View detailed listening history for any album:

- **Last Played**: When you last scrobbled the album
- **Total Plays**: Track-level scrobble count
- **Play Timeline**: Chronological list of listening sessions
- **Spotify Integration**: Play buttons for album and individual tracks
- **Album Mapping**: Map Last.fm scrobble history to Discogs collection items when names differ
  - Search-and-click interface to find matching albums
  - Create multiple mappings for reissues, deluxe editions, etc.
  - Visual indicators show already-mapped albums
  - Prevents duplicate mappings
- **Track Mapping Support**: Manual track-level mappings for naming variants
- Visible on the Release Details page

### 💾 Backup & Restore
Protect your user-generated data with manual and automatic backups:

**What's Backed Up:**
- All settings (user, suggestions, AI, wishlist, sellers, releases, sync)
- Album mappings (Last.fm → Discogs collection)
- Track mappings (Last.fm → normalized cache)
- Artist name mappings (scrobbling and discovery)
- Hidden albums and artists (Discovery page)
- Local want list and vinyl watch list
- Monitored sellers list
- MusicBrainz artist mappings and excluded artists
- Discard pile items (full history with merge support)

**Manual Backup (Settings → Backup):**
- **Export Preview**: See exactly what will be backed up before exporting
- **Credential Protection**: Optionally include API credentials (encrypted with password)
- **Download as JSON**: Lightweight backup file (~15-20KB)

**Import Options:**
- **Preview Before Import**: See what will change before applying
- **Merge Mode**: Add new items, update existing (keeps local-only data)
- **Replace Mode**: Overwrite all data with backup contents
- **Checksum Verification**: Ensures backup integrity

**Auto-Backup (Optional):**
- Disabled by default for privacy
- Configurable frequency: daily, weekly, or monthly
- Retention: keeps last 5 backups (configurable)
- Never includes credentials (requires manual export)

**Security:**
- Credentials encrypted with PBKDF2 + AES-256-GCM
- Password required to export/import credentials
- Checksums prevent tampering

## 🛠️ Development

### Scripts
```bash
npm run dev:app      # Full development environment
npm run dev          # Backend only with hot reload
npm run dev:web      # Frontend only with hot reload
npm run build        # Build for production
npm run test         # Run test suite
npm run test:coverage # Run tests with coverage
```

### Project Structure
```
src/
├── server.ts                      # Express server entrypoint
├── backend/                       # Node.js API server
│   ├── routes/                    # API endpoints
│   │   ├── auth.ts                # Authentication (Discogs OAuth, Last.fm)
│   │   ├── collection.ts          # Discogs collection sync & browsing
│   │   ├── scrobble.ts            # Scrobbling to Last.fm
│   │   ├── stats.ts               # Stats dashboard & rankings
│   │   ├── images.ts              # Album/artist image fetching
│   │   ├── suggestions.ts         # Suggestions, discovery, AI
│   │   ├── artistMapping.ts       # Artist name mapping CRUD
│   │   ├── wishlist.ts            # Wishlist & vinyl tracking
│   │   ├── sellers.ts             # Local seller monitoring
│   │   ├── releases.ts            # New release tracking
│   │   ├── backup.ts              # Backup & restore
│   │   ├── discardPile.ts         # Discard pile management
│   │   ├── wrapped.ts             # Wrapped/period-in-review
│   │   ├── collectionAnalytics.ts # Collection analytics & value estimation
│   │   ├── embeddings.ts          # Embedding management endpoints
│   │   └── recommendations.ts     # Embedding-based recommendations
│   ├── services/                  # Business logic
│   │   ├── authService.ts         # Encrypted credential storage
│   │   ├── discogsService.ts      # Discogs API client (rate-limited)
│   │   ├── lastfmService.ts       # Last.fm API client
│   │   ├── analyticsService.ts    # Listening analytics
│   │   ├── statsService.ts        # Stats calculations
│   │   ├── genreAnalysisService.ts # Genre distribution via Last.fm tags
│   │   ├── rankingsService.ts     # Rankings over time
│   │   ├── imageService.ts        # Album/artist images
│   │   ├── suggestionService.ts   # Recommendation algorithm
│   │   ├── scrobbleHistorySyncService.ts # Last.fm history sync
│   │   ├── scrobbleHistoryStorage.ts     # History index storage
│   │   ├── mappingService.ts      # Scrobble artist mappings
│   │   ├── trackMappingService.ts # Discogs↔Last.fm track mappings
│   │   ├── artistMappingService.ts # Artist name mappings
│   │   ├── artistNameResolver.ts  # Unified artist alias resolution (union-find)
│   │   ├── historyIndexMergeService.ts # Split history entry detection & merge
│   │   ├── hiddenItemService.ts   # User-hidden suggestions
│   │   ├── hiddenReleasesService.ts # User-hidden releases
│   │   ├── wishlistService.ts     # Wishlist & vinyl tracking
│   │   ├── sellerMonitoringService.ts # Local seller monitoring
│   │   ├── musicbrainzService.ts  # MusicBrainz API
│   │   ├── releaseTrackingService.ts  # New release tracking
│   │   ├── discardPileService.ts  # Discard pile logic
│   │   ├── wrappedService.ts     # Wrapped/period-in-review
│   │   ├── backupService.ts       # Backup & restore
│   │   ├── cleanupService.ts      # Cache cleanup
│   │   ├── migrationService.ts    # Data schema migrations
│   │   ├── ollamaService.ts       # AI integration (Ollama)
│   │   ├── aiPromptBuilder.ts     # AI prompt generation
│   │   ├── ollamaEmbedderService.ts    # Ollama embedding generation
│   │   ├── embeddingStorageService.ts  # Vector storage for embeddings
│   │   ├── profileBuilderService.ts    # Album profile construction for recommendations
│   │   ├── scoringEngineService.ts     # Cosine similarity scoring engine
│   │   ├── recommendationService.ts    # Embedding-based recommendation orchestration
│   │   ├── collectionAnalyticsService.ts # Collection analytics & value estimation
│   │   └── collectionIndexerService.ts   # Collection index for batch lookups
│   └── utils/                     # Utilities
│       ├── fileStorage.ts         # File-based JSON storage
│       ├── logger.ts              # Secure logger with redaction
│       ├── validation.ts          # Input validation & sanitization
│       ├── encryptionValidator.ts # Encryption key strength checks
│       └── timestamps.ts          # Timestamp utilities
├── renderer/                      # React frontend
│   ├── components/                # UI components
│   │   ├── ErrorBoundary.tsx      # Render error recovery
│   │   ├── Header.tsx             # App header
│   │   ├── Sidebar.tsx            # Navigation sidebar
│   │   ├── MainContent.tsx        # Page router
│   │   ├── AlbumCard.tsx          # Album grid card
│   │   ├── ArtistLink.tsx         # Clickable artist name navigation
│   │   ├── TrackLink.tsx          # Clickable track name navigation
│   │   ├── PlayTrendChart.tsx     # Reusable play trend area chart
│   │   ├── SearchBar.tsx          # Search input
│   │   ├── ui/                    # Reusable primitives (Button, Modal, Badge, etc.)
│   │   ├── dashboard/             # Dashboard widgets
│   │   ├── discard/              # Discard pile components (ItemCard, StatsBar, FilterBar, TradedInModal)
│   │   ├── discovery/             # Discovery tab components
│   │   ├── marketplace/           # Marketplace components
│   │   ├── settings/              # Settings page sections
│   │   ├── stats/                 # Stats visualizations
│   │   ├── collection-analytics/  # Collection analytics charts & sections
│   │   ├── whattoplay/            # What to Play components
│   │   ├── wishlist/              # Wishlist components
│   │   └── wrapped/               # Wrapped slideshow slides
│   ├── pages/                     # Application pages
│   │   ├── HomePage.tsx           # Dashboard
│   │   ├── CollectionPage.tsx     # Discogs collection browser
│   │   ├── ReleaseDetailsPage.tsx # Album detail & scrobble
│   │   ├── ScrobblePage.tsx       # Quick scrobble
│   │   ├── HistoryPage.tsx        # Scrobble history & Last.fm
│   │   ├── WhatToPlayPage.tsx     # What to Play hub (suggestions, forgotten, dusty)
│   │   ├── SuggestionsPage.tsx    # Play suggestions & AI
│   │   ├── DiscoveryPage.tsx      # Missing albums & artists
│   │   ├── StatsPage.tsx          # Listening statistics
│   │   ├── WrappedPage.tsx        # Period in review slideshow
│   │   ├── MarketplacePage.tsx    # Marketplace hub (wishlist, releases, sellers)
│   │   ├── ArtistDetailPage.tsx   # Artist deep dive
│   │   ├── TrackDetailPage.tsx    # Track deep dive
│   │   ├── DiscardPilePage.tsx    # Discard pile
│   │   ├── CollectionAnalyticsPage.tsx # Collection analytics
│   │   ├── RecommendationsPage.tsx # Embedding-based recommendations
│   │   └── SettingsPage.tsx       # Settings (tabs: Connections, Mappings, Filters, etc.)
│   ├── context/                   # React Context providers
│   │   ├── AppContext.tsx         # Global app state
│   │   ├── AuthContext.tsx        # Auth status
│   │   └── ThemeContext.tsx       # Dark/light theme
│   ├── hooks/                     # Custom hooks
│   ├── services/                  # API client (api.ts, statsApi.ts)
│   └── utils/                     # Frontend utilities (logger, dates)
└── shared/                        # Shared types & utilities
    ├── types.ts                   # TypeScript interfaces
    └── utils/
        └── trackNormalization.ts  # Track/artist name normalization
```

## 🔒 Security & Privacy

- **Local Storage**: App data (cache, history, settings) is stored locally under `./data/` (gitignored)
- **Encrypted Tokens**: API credentials are encrypted at rest (requires `ENCRYPTION_KEY`)
- **Automatic Backups**: `data/settings/user-settings.json` is backed up before changes (keeps 3 most recent)
- **No Cloud Dependencies**: Everything runs on your computer
- **CORS Protected**: Only allows localhost connections by default (with a strict allowlist)

## 🐛 Troubleshooting

### Common Issues

**"Server won't start"**
- Check Node.js version: `node --version` (needs 18+)
- Kill existing processes: `lsof -ti:3001 | xargs kill -9`
- Reinstall dependencies: `rm -rf node_modules && npm install`

**"Authentication fails"**
- Verify API credentials are correct
- Check callback URLs match exactly
- Ensure applications are properly configured on Discogs/Last.fm

**"Collection not loading"**
- Check Discogs API credentials
- Try force reloading cache from the UI
- Verify your Discogs username is correct

### Getting Help
1. Check browser console for errors
2. Verify server is running: `curl http://localhost:3001/health`
3. Review API credentials in the setup wizard
4. Check the application logs in the terminal

## 📊 Testing

```bash
npm test              # Run all tests
npm run test:coverage # Run with coverage report
npm run test:watch    # Run in watch mode
```

**Coverage Thresholds**: Enforced in jest.config.js (incrementally raised as coverage improves)

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidance on architecture, coding standards, and development workflow.

Quick start:

1. Fork the repository
2. Create a feature branch
3. Make your changes following the [coding standards](CONTRIBUTING.md#coding-standards)
4. Run tests: `npm test` and `npm run test:coverage`
5. Submit a pull request

See also: [TEST_STYLE_GUIDE.md](TEST_STYLE_GUIDE.md) | [TESTING_GUIDE.md](TESTING_GUIDE.md) | [SECURITY.md](SECURITY.md)

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for vinyl collectors and music lovers**