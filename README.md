# Discogs to Last.fm Scrobbler

[![CI](https://github.com/magearwhig/scrobblemyrecords/actions/workflows/ci.yml/badge.svg)](https://github.com/magearwhig/scrobblemyrecords/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Last Commit](https://img.shields.io/github/last-commit/magearwhig/scrobblemyrecords)](https://github.com/magearwhig/scrobblemyrecords/commits/main)
[![Code Coverage](https://img.shields.io/badge/coverage-1940%20tests-brightgreen)](https://github.com/magearwhig/scrobblemyrecords)

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
- **Home Dashboard**: Server status plus Last.fm recent scrobbles/top tracks/top artists
- **Collection Browser**: Search and filter your Discogs collection
- **Release Details**: Side/disc track selection and per-album scrobble history
- **Track Selection**: Choose individual tracks or entire albums
- **Batch Scrobbling**: Scrobble multiple items with progress tracking
- **Smart Timing**: Auto timing (simulates just finishing listening) or custom timestamps
- **History View**: Dual-tab history showing app scrobble sessions and synced Last.fm listening history
- **Stats Dashboard**: Comprehensive listening statistics and visualizations
- **Cache Management**: Force reload collection data when needed
- **Cache Updates**: Check for new Discogs additions and update the cache incrementally
- **Discovery + Mapping**: Find "missing" albums/artists and map them to items in your collection
- **Dark Mode**: Toggle between light and dark themes
- **Local Timezone**: All times displayed in your local timezone
- **Sorting Options**: Sort collection by artist, title, year, or date added
- **Artist Name Mapping**: Map Discogs artist names to Last.fm names for consistent scrobbling
- **Disambiguation Warnings**: Alerts when scrobbling artists with Discogs disambiguation suffixes (e.g., "Ghost (32)")
- **Possible Mappings**: Automatically suggests artists in your collection that may need name mappings

### 📈 Stats Dashboard
Comprehensive listening statistics and visualizations:

- **Listening Streak**: Track your daily listening streak and longest streak ever
- **Scrobble Counts**: Today, this week, this month, this year, and all-time totals
- **Listening Hours**: Track how many hours you've spent listening
- **New Artists**: Count of new artists discovered this month
- **Collection Coverage**: Percentage of your vinyl collection played over various time periods
- **Calendar Heatmap**: GitHub-style visualization of daily listening activity by year
- **Top Artists & Albums**: Leaderboards with period selection (week/month/year/all-time/custom)
- **Custom Date Range**: Pick specific months or custom date ranges for all stats
- **Milestone Progress**: Track progress toward scrobble milestones (1K, 5K, 10K, etc.)
- **Dusty Corners**: Albums in your collection you haven't played in 6+ months
- **Source Breakdown**: See which sources your scrobbles come from
- **Listening Timeline**: Visualize listening trends over time

### 🎲 Play Suggestions
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
- Sync controls to update the history index

### 🔍 Discovery Page
Find albums you listen to but don't own, and rediscover forgotten favorites:

**Missing Albums Tab:**
- **Missing Albums**: Albums in your scrobble history not in your collection
- **Play Count Sorting**: Prioritized by how often you listen
- **Map to Collection**: Mark a "missing" album as owned by mapping it to an item in your Discogs collection
- **Add to Wanted List**: Track albums you want on vinyl for later

**Missing Artists Tab:**
- **Missing Artists**: Artists you love but don't have on vinyl
- **Play Count Sorting**: Prioritized by how often you listen
- **Map to Collection**: Map artist to a release in your collection

**Forgotten Favorites Tab:**
- **Rediscover Tracks**: Surface tracks with high all-time play counts that you haven't listened to recently
- **Configurable Dormant Period**: Set how long "forgotten" means (3 months to 3 years)
- **Configurable Min Plays**: Filter by minimum play count (5 to 100+)
- **Sorting Options**: Sort by play count, artist name, track name, or dormancy
- **Copy to Clipboard**: Copy single track or all tracks for playlist creation
- **CSV Export**: Export your forgotten favorites for external use
- **Last.fm Links**: Quick access to track pages on Last.fm

### ❤️ Wishlist Page
Sync and manage your Discogs wantlist with vinyl availability tracking:

**Discogs Wantlist Sync:**
- **Auto-Sync**: Sync your Discogs wantlist with one click
- **Vinyl Status**: See which albums have vinyl pressings available
- **CD-Only Tracking**: Identify albums only available on CD/digital
- **Progressive Checking**: Vinyl availability checked progressively to respect API limits
- **Refresh All**: Force re-check vinyl status for all items

**Filtering & Sorting:**
- **Tabs**: All Items, Has Vinyl, CD Only, Affordable, Wanted
- **Sort Options**: Date Added, Price, Artist, Album
- **Affordable Filter**: Show items under your price threshold

**Version Browser:**
- View all pressings for any master release
- Format details (LP, 12", 7", etc.)
- Country of origin
- Marketplace pricing (lowest, median, highest)
- Direct links to Discogs marketplace

**Local Wanted List:**
- Add albums from Discovery page to track
- Check for vinyl availability on demand
- Notifications when vinyl becomes available
- Independent from Discogs wantlist (track anything)

**Settings (Settings → Wishlist):**
- **Price Threshold**: Filter by maximum price
- **Currency**: USD, EUR, GBP, CAD, AUD, JPY
- **Auto-Sync Interval**: Manual, daily, weekly, etc.
- **Vinyl Notifications**: Get notified when watched items get vinyl

**Vinyl Watch List:**
- Watch CD-only albums for future vinyl releases
- Automatic notifications when vinyl becomes available
- Manage watch list from Settings page

### 🏪 Local Seller Monitoring
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

### 🎵 New Releases Tracking
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

#### Download a Model

After installing Ollama, download a model:

```bash
ollama pull mistral
```

**Recommended Models:**

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

#### Enable in App

1. Go to **Settings → AI Recommendations**
2. Toggle "Enable AI suggestions"
3. Select your downloaded model from the dropdown
4. Click "Test Connection" to verify
5. AI suggestions will appear on the Suggestions page

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

### 📀 Album Scrobble History
View detailed listening history for any album:

- **Last Played**: When you last scrobbled the album
- **Total Plays**: Track-level scrobble count
- **Play Timeline**: Chronological list of listening sessions
- Visible on the Release Details page

## 🛠️ Development

### Scripts
```bash
npm run dev:app      # Full development environment
npm run dev          # Backend only with hot reload
npm run dev:web      # Frontend only with hot reload
npm run build        # Build for production
npm run test         # Run test suite
npm run test:coverage # Run tests with coverage (90% target)
```

### Project Structure
```
src/
├── server.ts                   # Express server entrypoint
├── backend/                    # Node.js API server
│   ├── routes/                 # API endpoints
│   │   ├── auth.ts             # Authentication routes
│   │   ├── collection.ts       # Discogs collection routes
│   │   ├── scrobble.ts         # Scrobbling routes
│   │   ├── stats.ts            # Stats dashboard routes
│   │   ├── images.ts           # Album/artist image routes
│   │   ├── suggestions.ts      # Suggestions, discovery, AI routes
│   │   ├── wishlist.ts         # Wishlist and vinyl tracking routes
│   │   ├── sellers.ts          # Local seller monitoring routes
│   │   └── releases.ts         # New release tracking routes
│   ├── services/               # Business logic
│   │   ├── analyticsService.ts # Listening analytics
│   │   ├── statsService.ts     # Stats dashboard calculations
│   │   ├── imageService.ts     # Album/artist image fetching
│   │   ├── suggestionService.ts # Recommendation algorithm
│   │   ├── scrobbleHistorySyncService.ts # Last.fm history sync
│   │   ├── scrobbleHistoryStorage.ts # History index storage
│   │   ├── ollamaService.ts    # AI integration
│   │   ├── aiPromptBuilder.ts  # AI prompt generation
│   │   ├── wishlistService.ts  # Wishlist and vinyl tracking
│   │   ├── sellerMonitoringService.ts # Local seller monitoring
│   │   ├── musicbrainzService.ts # MusicBrainz API integration
│   │   └── releaseTrackingService.ts # New release tracking
│   └── utils/                  # Utilities
├── renderer/                   # React frontend
│   ├── components/             # UI components
│   │   └── settings/           # Settings page sections
│   ├── pages/                  # Application pages
│   │   ├── HomePage.tsx
│   │   ├── SetupPage.tsx
│   │   ├── CollectionPage.tsx
│   │   ├── ReleaseDetailsPage.tsx
│   │   ├── ScrobblePage.tsx
│   │   ├── SuggestionsPage.tsx
│   │   ├── DiscoveryPage.tsx
│   │   ├── HistoryPage.tsx
│   │   ├── StatsPage.tsx
│   │   ├── WishlistPage.tsx
│   │   ├── SellersPage.tsx
│   │   ├── NewReleasesPage.tsx
│   │   └── SettingsPage.tsx
│   └── context/                # State management
└── shared/                     # Shared types
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

**Coverage Target**: 90% minimum

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Ensure coverage: `npm run test:coverage`
6. Submit a pull request

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for vinyl collectors and music lovers**