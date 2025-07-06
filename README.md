# Discogs to Last.fm Scrobbler

A web application that allows users to select albums from their Discogs collection and automatically scrobble the tracks to their Last.fm profile.

## Features

- Connect your Discogs collection with Last.fm scrobbling
- Browse and search your Discogs collection
- Select individual tracks or entire albums to scrobble
- Batch scrobbling with progress tracking
- Customizable timestamps for scrobbling
- Secure API token storage
- Runs locally in your browser for privacy and security

## Prerequisites

- Node.js 18 or higher
- npm or yarn package manager

## API Access Setup

### Discogs API Setup

1. **Create a Discogs account** at [discogs.com](https://discogs.com)
2. **Register your application**:
   - Go to Settings → Developers
   - Click "Create an Application"
   - Fill in the form:
     - Application Name: "Discogs to Last.fm Scrobbler"
     - Description: "Desktop app for scrobbling Discogs collection to Last.fm"
     - Website: Leave blank or use your GitHub repo URL
     - Callback URL: `http://localhost:3001/api/v1/auth/discogs/callback`
3. **Get your credentials**:
   - Note down your Consumer Key and Consumer Secret
   - For single-user setup, you can also generate a Personal Access Token

### Last.fm API Setup

1. **Create a Last.fm account** at [last.fm](https://last.fm)
2. **Get API credentials**:
   - Visit [Last.fm API Account Creation](https://www.last.fm/api/account/create)
   - Fill in the application form:
     - Application Name: "Discogs to Last.fm Scrobbler"
     - Description: "Desktop app for scrobbling Discogs collection"
     - Website: Leave blank or use your GitHub repo URL
     - Callback URL: `http://localhost:3001/api/v1/auth/lastfm/callback`
3. **Note your credentials**:
   - API Key
   - Shared Secret

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd recordscrobbles
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment configuration** (Optional):
   ```bash
   cp .env.example .env
   ```
   
   The `.env` file contains application-level API credentials that can be used as defaults:
   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=development
   FRONTEND_URL=http://localhost:8080
   
   # Discogs API Configuration (for OAuth, currently using personal tokens)
   DISCOGS_CLIENT_ID=your_discogs_client_id
   DISCOGS_CLIENT_SECRET=your_discogs_client_secret
   DISCOGS_CALLBACK_URL=http://localhost:3001/api/v1/auth/discogs/callback
   
   # Last.fm API Configuration (app-level defaults)
   LASTFM_API_KEY=your_lastfm_api_key
   LASTFM_SECRET=your_lastfm_secret
   LASTFM_CALLBACK_URL=http://localhost:3001/api/v1/auth/lastfm/callback
   ```

   **Note**: You can either:
   - Use the environment defaults (if you have your own API keys)
   - Enter API credentials through the web interface
   - Mix both approaches (environment defaults + manual entry)

4. **Build the application**:
   ```bash
   npm run build
   ```

## Running the Application

### Development Mode (Recommended)
```bash
# Starts both backend and frontend with hot reload
npm run dev:app
```

This will start:
- Backend API server on `http://localhost:3001`
- Frontend web app on `http://localhost:8080`
- Automatically opens your browser to the application

### Production Mode
```bash
# Build and serve the application
npm run start:web
```

### Individual Components
```bash
# Backend only
npm run dev        # Development with hot reload
npm run start      # Production mode

# Frontend only  
npm run dev:web    # Development with hot reload
npm run build:web  # Production build
```

## Testing

Run the test suite:
```bash
npm test
```

Run tests with coverage (90% minimum required):
```bash
npm run test:coverage
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Development Scripts

- `npm run build` - Build both backend and web app
- `npm run build:backend` - Build backend TypeScript code
- `npm run build:web` - Build frontend web app
- `npm run dev:app` - Start full development environment
- `npm run dev` - Start backend development server with hot reload
- `npm run dev:web` - Start frontend development server with hot reload
- `npm run start` - Start production backend server
- `npm run start:web` - Build and serve complete application
- `npm run test` - Run test suite
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:watch` - Run tests in watch mode
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run linting (to be configured)

## Project Structure

```
recordscrobbles/
├── src/
│   ├── backend/           # Node.js backend API
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── utils/         # Utility functions
│   │   └── middleware/    # Express middleware
│   ├── renderer/          # React frontend app
│   │   ├── components/    # React components
│   │   ├── pages/         # Application pages
│   │   ├── context/       # React contexts
│   │   ├── services/      # Frontend services
│   │   └── styles/        # CSS files
│   ├── shared/            # Shared types and utilities
│   └── server.ts          # Main server file
├── data/                  # JSON data storage
│   ├── collections/       # Discogs collection cache
│   ├── settings/          # User settings
│   └── scrobbles/         # Scrobble history
├── public/                # Static web assets
├── tests/                 # Test files
└── dist/                  # Compiled output
    ├── web/               # Built web application
    └── (backend files)    # Compiled backend code
```

## Data Storage

The application uses JSON files for data persistence:
- `data/settings/user-settings.json` - User preferences and API tokens
- `data/collections/` - Cached Discogs collection data
- `data/scrobbles/` - Scrobble history and queued operations

## API Endpoints

- `GET /health` - Health check
- `GET /api/v1/auth/discogs` - Discogs authentication
- `GET /api/v1/auth/lastfm` - Last.fm authentication
- `GET /api/v1/collection` - Get Discogs collection
- `POST /api/v1/scrobble` - Scrobble tracks to Last.fm

## Security

- API tokens are stored encrypted in local JSON files
- CORS is configured to only allow requests from the frontend
- Helmet.js provides security headers
- No sensitive data is logged or transmitted in plain text

## Troubleshooting

### Common Issues

1. **"Unable to connect to backend server"**
   - **Cause**: Backend server not running or networking issue
   - **Solution 1**: Try development mode first: `npm run dev:app`
   - **Solution 2**: Check if port 3001 is accessible: `curl http://localhost:3001/health`
   - **Solution 3**: Ensure both backend and frontend are running
   - **Note**: Use `npm run dev:app` to start both services together

2. **Server won't start**
   - Check that Node.js 18+ is installed
   - Verify all dependencies are installed: `npm install`
   - Check that the port (3001) is not already in use

3. **API authentication fails**
   - Verify your API credentials in the `.env` file
   - Check that callback URLs match exactly
   - Ensure your Discogs/Last.fm applications are properly configured

4. **Tests failing**
   - Run `npm run typecheck` to check for TypeScript errors
   - Ensure test coverage meets 90% minimum requirement

5. **Data directory issues**
   - The application will create `data/` directories automatically
   - Check file permissions if you see access errors

6. **CORS errors**
   - The application is configured to allow localhost and file:// origins
   - If you see CORS errors, check the server logs for details

### Getting Help

1. Check the application logs for error messages
2. Verify your API credentials are correct
3. Test the `/health` endpoint to ensure the server is running: `curl http://localhost:3001/health`
4. Try development mode if production mode has issues: `npm run dev:app`
5. Review the API documentation for Discogs and Last.fm

### Development vs Production Mode

- **Development Mode** (`npm run dev:app`): 
  - Runs backend and frontend with hot reload
  - Frontend webpack dev server on http://localhost:8080
  - Backend API server on http://localhost:3001
  - Automatic browser opening and live reload

- **Production Mode** (`npm run start:web`):
  - Builds optimized production bundle
  - Serves static files with backend API
  - Single command for complete deployment

## Current Status

✅ **COMPLETE - Full Web Application**

### ✅ Phase 1: Backend API (COMPLETED)
- Node.js Express server with TypeScript
- Discogs API integration with OAuth 1.0a support
- Last.fm API integration with session authentication
- JSON file-based data storage
- Comprehensive test suite with >50% coverage
- All API endpoints implemented and tested

### ✅ Phase 2: Frontend Web App (COMPLETED)
- React 19 with TypeScript frontend
- Modern responsive web application
- Webpack build system with hot reload
- Authentication setup wizard
- Collection browser with search and pagination
- Track selection and scrobbling interface
- Scrobble history and session management
- Hash-based routing system
- API integration layer
- Context-based state management

### ✅ Completed Features
- **Authentication Management**: Full OAuth 1.0a and session-based authentication
- **Collection Management**: Browse, search, and cache Discogs collection
- **Track Scrobbling**: Single and batch scrobbling with timestamp customization
- **Progress Tracking**: Real-time scrobbling progress with detailed results
- **History Management**: View scrobble sessions with track details
- **Error Handling**: Comprehensive error handling and rate limiting
- **Security**: Encrypted token storage with secure IPC communication
- **Cross-platform**: Runs in any modern web browser

### ✅ Application Distribution
- **Production Build**: Complete TypeScript compilation and webpack bundling
- **Web Application**: Optimized bundle for browser deployment
- **Local Development**: Hot reload and instant feedback
- **Static Hosting**: Can be deployed to any web server

### API Endpoints Available
- `GET /health` - Health check
- `GET /api/v1` - API information
- `GET /api/v1/auth/status` - Check authentication status
- `POST /api/v1/auth/discogs/token` - Save Discogs token
- `GET /api/v1/auth/discogs/test` - Test Discogs connection
- `GET /api/v1/auth/lastfm/auth-url` - Get Last.fm auth URL
- `POST /api/v1/auth/lastfm/callback` - Handle Last.fm callback
- `GET /api/v1/auth/lastfm/test` - Test Last.fm connection
- `POST /api/v1/auth/clear` - Clear all authentication
- `GET /api/v1/collection/:username` - Get user collection
- `GET /api/v1/collection/:username/search` - Search collection
- `GET /api/v1/collection/release/:releaseId` - Get release details
- `DELETE /api/v1/collection/cache` - Clear collection cache
- `POST /api/v1/scrobble/track` - Scrobble single track
- `POST /api/v1/scrobble/batch` - Scrobble multiple tracks
- `GET /api/v1/scrobble/history` - Get scrobble history
- `POST /api/v1/scrobble/prepare-from-release` - Prepare tracks from release

## Application Usage

### First Time Setup
1. Start the application: 
   ```bash
   npm run dev:app
   ```
2. Open your browser to http://localhost:8080
3. Navigate to "Setup & Authentication" 
4. Enter your Discogs and Last.fm API credentials
5. Complete the authentication flow for both services

### Daily Usage
1. **Browse Collection**: View your Discogs collection with search and filters
2. **Select Albums**: Choose albums or individual tracks to scrobble
3. **Configure Scrobbling**: Set timestamps (current time or custom)
4. **Scrobble**: Execute batch scrobbling with progress tracking
5. **View History**: Check your scrobbling history and session details

### Web Application Access
- **Development**: http://localhost:8080 (with hot reload)
- **Production**: Build and serve with `npm run start:web`
- **Backend API**: http://localhost:3001 (health check: `/health`)

## Future Enhancements

### Phase 3: Enhancement (Optional)
1. **Increase Test Coverage**: Target 90% coverage with comprehensive frontend tests
2. **Advanced Features**: Playlist management, listening sessions, analytics
3. **Performance**: Optimize for very large collections (10,000+ items)
4. **UI/UX**: Enhanced visual design, keyboard shortcuts, drag-and-drop

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Ensure test coverage: `npm run test:coverage`
6. Submit a pull request

## License

ISC License - See LICENSE file for details.