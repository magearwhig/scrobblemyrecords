# Discogs to Last.fm Scrobbler

[![CI](https://github.com/magearwhig/scrobblemyrecords/actions/workflows/ci.yml/badge.svg)](https://github.com/magearwhig/scrobblemyrecords/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Last Commit](https://img.shields.io/github/last-commit/magearwhig/scrobblemyrecords)](https://github.com/magearwhig/scrobblemyrecords/commits/main)
[![Code Coverage](https://img.shields.io/badge/coverage-827%20tests-brightgreen)](https://github.com/magearwhig/scrobblemyrecords)

🎵 **Sync your Discogs vinyl collection to Last.fm automatically!**

A modern web application that bridges your Discogs collection with Last.fm scrobbling. Browse your vinyl collection, select albums or tracks, and automatically scrobble them to your Last.fm profile with customizable timestamps.

## ✨ What This Does

- **Browse Your Collection**: View your entire Discogs vinyl collection with search and filtering
- **Smart Scrobbling**: Select individual tracks or entire albums to scrobble
- **Batch Operations**: Scrobble multiple albums at once with progress tracking
- **Time Control**: Auto timing (as if you just finished listening) or set custom timestamps for your scrobbles
- **Local & Private**: Runs entirely in your browser - your data stays on your computer
- **Caching**: 24-hour cache keeps your collection loading fast

## 🚀 Quick Start

1. **Install & Run**:
   ```bash
   git clone <repository-url>
   cd recordscrobbles
   npm install
   npm run dev:app
   ```

2. **Open Browser**: Navigate to `http://localhost:8080`

3. **Setup APIs**: Follow the authentication wizard to connect your Discogs and Last.fm accounts

4. **Start Scrobbling**: Browse your collection and start scrobbling!

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

### Last.fm API (Required)
1. Visit [Last.fm API Account Creation](https://www.last.fm/api/account/create)
2. Fill in:
   - **Application Name**: "Discogs to Last.fm Scrobbler"
   - **Description**: "Web app for scrobbling Discogs collection"
   - **Callback URL**: `http://localhost:3001/api/v1/auth/lastfm/callback`
3. Save your **API Key** and **Shared Secret**

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
- **Collection Browser**: Search and filter your Discogs collection
- **Track Selection**: Choose individual tracks or entire albums
- **Batch Scrobbling**: Scrobble multiple items with progress tracking
- **Smart Timing**: Auto timing (simulates just finishing listening) or custom timestamps
- **History View**: See your scrobbling history and session details
- **Cache Management**: Force reload collection data when needed
- **Dark Mode**: Toggle between light and dark themes
- **Local Timezone**: All times displayed in your local timezone
- **Sorting Options**: Sort collection by artist, title, year, or date added
- **Artist Name Mapping**: Map Discogs artist names to Last.fm names for consistent scrobbling
- **Disambiguation Warnings**: Alerts when scrobbling artists with Discogs disambiguation suffixes (e.g., "Ghost (32)")
- **Possible Mappings**: Automatically suggests artists in your collection that may need name mappings

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

### 🔍 Discovery Page
Find albums you listen to but don't own:

- **Missing Albums**: Albums in your scrobble history not in your collection
- **Missing Artists**: Artists you love but don't have on vinyl
- **Play Count Sorting**: Prioritized by how often you listen
- Perfect for building your wishlist!

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
├── backend/                    # Node.js API server
│   ├── routes/                 # API endpoints
│   │   ├── auth.ts             # Authentication routes
│   │   ├── collection.ts       # Discogs collection routes
│   │   ├── scrobble.ts         # Scrobbling routes
│   │   └── suggestions.ts      # Suggestions, discovery, AI routes
│   ├── services/               # Business logic
│   │   ├── analyticsService.ts # Listening analytics
│   │   ├── suggestionService.ts # Recommendation algorithm
│   │   ├── scrobbleHistorySyncService.ts # Last.fm history sync
│   │   ├── scrobbleHistoryStorage.ts # History index storage
│   │   ├── ollamaService.ts    # AI integration
│   │   └── aiPromptBuilder.ts  # AI prompt generation
│   └── utils/                  # Utilities
├── renderer/                   # React frontend
│   ├── components/             # UI components
│   │   ├── SuggestionCard.tsx  # Algorithm suggestion display
│   │   ├── AISuggestionCard.tsx # AI suggestion display
│   │   ├── SuggestionWeightControls.tsx # Weight sliders
│   │   ├── SyncStatusBar.tsx   # Sync progress bar
│   │   ├── AlbumScrobbleHistory.tsx # Album play history
│   │   └── MissingFromCollection.tsx # Discovery component
│   ├── pages/                  # Application pages
│   │   ├── SuggestionsPage.tsx # Play suggestions
│   │   ├── DiscoveryPage.tsx   # Missing albums discovery
│   │   └── ...
│   └── context/                # State management
└── shared/                     # Shared types
```

## 🔒 Security & Privacy

- **Local Storage**: All data stored locally in JSON files
- **Encrypted Tokens**: API credentials encrypted at rest
- **Automatic Backups**: Settings files backed up before changes (keeps 3 most recent)
- **No Cloud Dependencies**: Everything runs on your computer
- **CORS Protected**: Only allows localhost connections

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