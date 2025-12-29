# Discogs to Last.fm Scrobbler - Product Requirements Document

## Product Overview

### Vision
A desktop application that allows users to select albums from their Discogs collection and automatically scrobble the tracks to their Last.fm profile, bridging the gap between vinyl/physical music collections and digital music tracking.

### Core Value Proposition
- **Seamless Integration**: Connect your physical music collection (tracked on Discogs) with your digital listening profile (on Last.fm)
- **Bulk Scrobbling**: Scrobble entire albums at once rather than individual tracks
- **Collection Sync**: Keep your Last.fm listening history aligned with your actual music collection
- **Offline Listening Tracking**: Log music you've listened to on turntables, CD players, or other non-digital sources

## API Analysis & Availability

### Discogs API
✅ **Available and Free**
- **API Version**: v2.0 (RESTful)
- **Cost**: Free for personal use
- **Rate Limits**: 60 requests/minute (authenticated), 25 requests/minute (unauthenticated)
- **Authentication**: OAuth 1.0a or Personal Access Token
- **Key Endpoints Needed**:
  - `GET /users/{username}/collection/folders/{folder_id}/releases` - Get user's collection
  - `GET /releases/{release_id}` - Get release details including tracklist
  - `GET /masters/{master_id}` - Get master release information

### Last.fm API
✅ **Available and Free**
- **API Version**: 2.0
- **Cost**: Free for personal use (commercial use requires contact)
- **Rate Limits**: Not explicitly stated, but recommends "reasonable usage"
- **Authentication**: API Key + Session Key (via OAuth-like flow)
- **Key Endpoints Needed**:
  - `track.scrobble` - Submit listening data
  - `auth.getSession` - Get user session for scrobbling
  - `user.getInfo` - Verify user authentication

## API Access Requirements

### Getting Discogs API Access
1. **Create Discogs Account**: Sign up at discogs.com
2. **Register Application**:
   - Go to Settings → Developers
   - Click "Create an Application"
   - Fill form with app name, description, and website
   - No callback URL needed for desktop app
3. **Authentication Options**:
   - **Personal Access Token** (Recommended for single-user app): Generate token in Settings → Developers
   - **OAuth 1.0a** (For multi-user app): Use consumer key/secret for full OAuth flow
4. **Cost**: Free

### Getting Last.fm API Access
1. **Create Last.fm Account**: Sign up at last.fm
2. **Get API Key**:
   - Visit https://www.last.fm/api/account/create
   - Fill application form with name, description, and website
   - Leave callback URL blank for desktop app
3. **Authentication Process**:
   - Use API key to get session token
   - Session tokens don't expire unless revoked
4. **Cost**: Free for personal use

## Feature Requirements

### Core Features (MVP)
1. **Collection Browser**
   - Display user's Discogs collection in a searchable, filterable list
   - Show album artwork, artist, title, year, format
   - Support for different collection folders
   - Pagination for large collections

2. **Track Selection**
   - Select individual albums from collection
   - Display full tracklist for selected album
   - Option to select/deselect individual tracks
   - Support for multiple album selection

3. **Scrobbling Engine**
   - Batch scrobble selected tracks to Last.fm
   - Customizable timestamp (when the music was "listened to")
   - Progress indicator for scrobbling process
   - Error handling and retry logic

4. **Authentication Management**
   - Secure storage of API tokens
   - Easy re-authentication flow
   - Connection status indicators

### Advanced Features (Future Releases)
1. **Listening Sessions**
   - Create listening sessions with timestamp tracking
   - Simulate real-time scrobbling
   - Save sessions for later scrobbling

2. **Smart Defaults**
   - Auto-detect listening patterns
   - Suggest scrobbling timestamps based on collection activity
   - Integration with other music tracking apps

3. **Bulk Operations**
   - Scrobble entire collection folders
   - Filter by format, genre, date added
   - Export/import scrobbling lists

4. **Analytics & Insights**
   - Show scrobbling statistics
   - Compare Discogs collection vs Last.fm listening history
   - Identify gaps in scrobbling

## Technical Architecture

### Technology Stack
- **Frontend**: React (single-page web app served locally)
- **Backend**: Node.js
- **Authentication**: OAuth 1.0a for Discogs, Last.fm session-based auth
- **Storage**: Local JSON files for cache, settings, and history
- **HTTP Client**: Axios for API calls with rate limiting

### Key Components
1. **Authentication Service**
   - Handles OAuth flows for both APIs
   - Manages token storage and refresh
   - Provides connection status

2. **Discogs Service**
   - Fetches user collection data
   - Caches collection locally for performance
   - Handles release and master data retrieval

3. **Last.fm Service**
   - Manages scrobbling operations
   - Handles batch submissions
   - Provides scrobbling history

4. **Data Layer**
   - Local JSON files for caching and indexing
   - User preferences and settings
   - Scrobbling queue management

### Rate Limiting Strategy
- **Discogs**: Implement 60 requests/minute limit with exponential backoff
- **Last.fm**: Conservative rate limiting (1 request/second) to avoid issues
- **Batch Processing**: Queue operations and process in controlled batches

## User Interface Design

### Main Application Windows
1. **Connection Setup**
   - API key configuration
   - Authentication flows
   - Connection testing

2. **Collection Browser**
   - Grid/list view of Discogs collection
   - Search and filter controls
   - Album selection interface

3. **Scrobbling Interface**
   - Selected albums/tracks display
   - Timestamp configuration
   - Scrobbling progress and results

4. **Settings & Preferences**
   - API credentials management
   - Default scrobbling options
   - Cache management

### User Experience Priorities
- **Simplicity**: Clear, intuitive interface for non-technical users
- **Transparency**: Clear indication of what will be scrobbled
- **Control**: User control over timestamps and track selection
- **Feedback**: Clear success/error messages and progress indicators

## Data Privacy & Security

### API Key Security
- Store API keys encrypted in local system keychain
- Never transmit credentials in plain text
- Provide option to revoke/regenerate tokens

### Data Handling
- Cache only necessary data locally
- Respect user privacy preferences
- Provide clear data deletion options
- No data transmission to third parties

## Success Metrics

### User Adoption
- Number of active users
- Collection size successfully integrated
- Retention rate after first scrobble

### Technical Performance
- API error rate < 1%
- Average scrobbling time per track < 2 seconds
- Application startup time < 5 seconds

### User Satisfaction
- Successful scrobbles per session
- User feedback ratings
- Support ticket volume

## Risks & Mitigation

### Technical Risks
- **API Rate Limits**: Implement robust rate limiting and queuing
- **API Changes**: Monitor API documentation and implement versioning
- **Authentication Issues**: Provide clear error messages and re-auth flows

### User Experience Risks
- **Complex Setup**: Provide step-by-step setup wizard
- **Performance Issues**: Implement caching and background processing
- **Data Loss**: Implement backup and recovery mechanisms

## Implementation Timeline (AI-Assisted Development)

### Phase 1 (MVP - 2-3 days)
- API integration and authentication setup
- Basic collection browsing interface
- Simple scrobbling functionality
- Core UI components with React

### Phase 2 (Enhanced Features - 1-2 days)
- Advanced filtering and search
- Batch operations
- Improved error handling and user feedback
- Settings management and preferences

### Phase 3 (Polish & Distribution - 1 day)
- UI/UX improvements and responsive design
- Performance optimization
- Production build and deployment packaging
- Basic documentation and README

**Total Development Time: 4-6 days**

*Note: Timeline assumes AI-assisted development with Cursor, leveraging code generation for boilerplate, API integrations, and UI components. Manual testing and refinement may add additional time.*

## Conclusion

Both APIs required for this application are available and free to use. The Discogs API provides comprehensive access to user collections, while the Last.fm API supports the scrobbling functionality needed. The main implementation challenges will be around OAuth authentication flows and rate limiting, but these are well-documented and achievable.

The application addresses a real need for vinyl and physical music collectors who want to maintain accurate Last.fm listening histories. With proper implementation, this tool could significantly enhance the music listening experience for collectors.