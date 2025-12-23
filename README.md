# Discogs to Last.fm Scrobbler

[![CI](https://github.com/magearwhig/scrobblemyrecords/actions/workflows/ci.yml/badge.svg)](https://github.com/magearwhig/scrobblemyrecords/actions/workflows/ci.yml)

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

- **Collection Browser**: Search and filter your Discogs collection
- **Track Selection**: Choose individual tracks or entire albums
- **Batch Scrobbling**: Scrobble multiple items with progress tracking
- **Smart Timing**: Auto timing (simulates just finishing listening) or custom timestamps
- **History View**: See your scrobbling history and session details
- **Cache Management**: Force reload collection data when needed
- **Dark Mode**: Toggle between light and dark themes
- **Local Timezone**: All times displayed in your local timezone
- **Sorting Options**: Sort collection by artist, title, year, or date added

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
├── backend/          # Node.js API server
│   ├── routes/       # API endpoints
│   ├── services/     # Business logic
│   └── utils/        # Utilities
├── renderer/         # React frontend
│   ├── components/   # UI components
│   ├── pages/        # Application pages
│   └── context/      # State management
└── shared/           # Shared types
```

## 🔒 Security & Privacy

- **Local Storage**: All data stored locally in JSON files
- **Encrypted Tokens**: API credentials encrypted at rest
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