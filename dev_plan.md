# Discogs to Last.fm Scrobbler - Development Plan

## Overview
This plan outlines the development approach for building a local web application that connects Discogs collections with Last.fm scrobbling, based on the PRD requirements and development constraints.

## Development Constraints & Requirements
- **Backend**: Node.js (as specified in dev_prompt.md)
- **Unit Test Coverage**: 90% minimum for both frontend and backend
- **Data Usage**: Use real data whenever possible, request approval for estimations when data unavailable
- **Platform**: Local web application using React + Node.js backend
- **Timeline**: 1-2 days with Claude Code + Cursor AI-assisted development

## Technology Stack

### Core Technologies
- **Frontend**: React 18 with TypeScript
- **Backend**: Node.js with Express
- **Data Storage**: JSON files on filesystem (no database)
- **HTTP Client**: Axios with rate limiting
- **Authentication**: OAuth 1.0a (Discogs) + Last.fm session auth
- **State Management**: React Context API + useReducer
- **UI Components**: Custom CSS with modern styling

### Development Tools
- **Testing**: Jest + React Testing Library (frontend), Jest + Supertest (backend)
- **Code Quality**: ESLint + Prettier + TypeScript
- **Build System**: Webpack (via Create React App)
- **API Documentation**: Swagger/OpenAPI for backend endpoints

## Project Structure
```
discogs-lastfm-scrobbler/
├── src/
│   ├── renderer/              # React frontend
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── utils/
│   ├── backend/               # Node.js backend
│   │   ├── routes/
│   │   ├── services/
│   │   ├── models/
│   │   ├── middleware/
│   │   └── utils/
│   └── shared/                # Shared types and utilities
├── tests/
│   ├── frontend/
│   ├── backend/
│   └── integration/
├── data/
│   ├── collections/
│   ├── settings/
│   └── scrobbles/
└── docs/
```

## ✅ Phase 1: Foundation & Authentication (COMPLETED)

### Day 1: Project Setup & Authentication
**Backend Development (Node.js)** ✅ COMPLETED
1. **Project Initialization** ✅
   - ✅ Initialize Node.js project with TypeScript
   - ✅ Setup Express server with CORS and security middleware
   - ✅ Configure JSON file storage structure
   - ✅ Setup testing framework (Jest) with 90% coverage target

2. **Authentication Services** ✅
   - ✅ Implement Discogs OAuth 1.0a flow
   - ✅ Implement Last.fm session-based authentication
   - ✅ Create secure token storage (encrypted JSON files)
   - ✅ Build authentication middleware and validation

3. **File Storage Structure** ✅
   - ✅ settings.json (auth tokens, preferences)
   - ✅ collections.json (cached Discogs data)
   - ✅ scrobble-queue.json (pending/completed scrobbles)
   - ✅ user-preferences.json (user settings)

4. **API Rate Limiting** ✅
   - ✅ Implement rate limiting for both APIs
   - ✅ Create queue system for batch operations
   - ✅ Add exponential backoff for failed requests

**Frontend Development (React)** ✅ COMPLETED
1. **React Setup** ✅
   - ✅ Configure React with TypeScript
   - ✅ Setup API communication with backend
   - ✅ Implement security best practices (CSP, CORS)

2. **Authentication UI** ✅
   - ✅ Create login/setup wizard
   - ✅ Build API key configuration forms
   - ✅ Implement connection status indicators
   - ✅ Add authentication error handling

**Testing Requirements**
- Unit tests for all authentication functions
- Integration tests for API connections
- E2E tests for authentication flow
- Target: 90% test coverage

### Day 1 (Continued): Core API Integration ✅ COMPLETED

**Backend Development (Continued)** ✅ COMPLETED
1. **Discogs Service** ✅
   - ✅ Implement collection fetching with pagination
   - ✅ Add release/master data retrieval
   - ✅ Create JSON file caching mechanism
   - ✅ Build search and filter functionality

2. **Last.fm Service** ✅
   - ✅ Implement scrobbling endpoints
   - ✅ Add batch scrobbling with queue management
   - ✅ Create scrobble validation and error handling
   - ✅ Build retry logic for failed scrobbles

3. **Data Models** ✅
   - ✅ Collection item models
   - ✅ Track and release models
   - ✅ Scrobble session models
   - ✅ User preference models

**Frontend Development** ✅ COMPLETED
1. **Service Layer** ✅
   - ✅ Create API service clients
   - ✅ Implement caching strategies
   - ✅ Add error handling and retry logic
   - ✅ Build state management for API data

2. **Basic UI Components** ✅
   - ✅ Loading states and error boundaries
   - ✅ Connection status components
   - ✅ Basic layout and navigation
   - ✅ Responsive design foundation

**Testing Requirements**
- Unit tests for all API services
- Mock API responses for testing
- Integration tests for data flow
- Maintain 90% coverage target

## ✅ Phase 2: Core Features & Polish (COMPLETED)

### Day 2: Collection Browser & Scrobbling Interface

**Backend Development** ✅ COMPLETED
1. **Collection Management** ✅
   - ✅ Build collection sync endpoints
   - ✅ Implement search and filtering logic
   - ✅ Add collection folder support
   - ✅ Create collection update mechanisms

2. **Performance Optimization** ✅
   - ✅ Implement JSON file indexing/searching
   - ✅ Add pagination for large collections
   - ✅ Create background sync processes
   - ✅ Build cache invalidation strategies

**Frontend Development** ✅ COMPLETED
1. **Collection Browser UI** ✅
   - ✅ Grid/list view components
   - ✅ Search and filter controls
   - ✅ Album selection interface
   - ✅ Pagination and virtual scrolling

2. **Track Selection** ✅
   - ✅ Album detail view with tracklist
   - ✅ Individual track selection
   - ✅ Bulk selection operations
   - ✅ Track information display

**Testing Requirements**
- Unit tests for collection components
- Integration tests for search/filter
- Performance tests for large collections
- UI component testing with React Testing Library

3. **Scrobbling Engine Integration**
   - Build batch scrobbling endpoint
   - Implement timestamp customization
   - Create scrobbling queue management
   - Add progress tracking and reporting

4. **Error Handling & UX**
   - Comprehensive error logging
   - Retry mechanisms for failed scrobbles
   - Rate limit handling
   - User-friendly error messages

**Frontend Development (Continued)**
3. **Scrobbling Interface**
   - Selected tracks display
   - Timestamp configuration UI
   - Progress indicators and status
   - Scrobbling results display

4. **User Experience**
   - Confirmation dialogs
   - Success/error notifications
   - Undo/retry functionality
   - Scrobbling history view

5. **Settings & Polish**
   - Settings UI implementation
   - Application preferences
   - Final UI/UX improvements
   - Documentation and README.md

**Testing Requirements**
- Unit tests for all components and services
- Integration tests for full application flow
- Error scenario testing
- Performance testing for batch operations
- Final 90% test coverage verification

## Additional Deliverables

### README.md Requirements
Based on dev_prompt.md requirements, maintain comprehensive README.md including:
- **API Access Setup**: Step-by-step instructions for Discogs and Last.fm API registration
- **Environment Setup**: Required Node.js version, dependencies, and configuration
- **Application Setup**: Installation and configuration steps
- **Running the Application**: Commands to start development and production builds
- **Testing**: How to run the test suite and achieve 90% coverage
- **Troubleshooting**: Common issues and solutions

### Application Packaging & Distribution
- **Web Application**: Deploy as local web server
- **Security**: Security audit and best practices
- **Documentation**: User guides and developer documentation

## API Integration Strategy

### Discogs API Integration
- **Authentication**: Personal Access Token for MVP (OAuth 1.0a for multi-user)
- **Rate Limiting**: 60 requests/minute with exponential backoff
- **Caching**: Local JSON file cache for collection data
- **Error Handling**: Comprehensive retry logic and user feedback

### Last.fm API Integration
- **Authentication**: Session-based authentication with API key
- **Rate Limiting**: Conservative 1 request/second to avoid issues
- **Batch Processing**: Queue-based scrobbling with progress tracking
- **Error Handling**: Detailed error reporting and retry mechanisms

## Testing Strategy

### Unit Testing (90% Coverage Target)
- **Frontend**: Jest + React Testing Library
- **Backend**: Jest + Supertest
- **Coverage Tools**: Istanbul/NYC for coverage reporting
- **CI/CD**: Automated testing on commit/push

### Integration Testing
- **API Integration**: Test with real API endpoints (sandboxed)
- **File System Integration**: Test with temporary JSON files
- **E2E Testing**: Browser testing with Playwright

### Performance Testing
- **Load Testing**: Test with large collections (10,000+ items)
- **Memory Testing**: Monitor memory usage during operations
- **API Rate Limiting**: Test rate limiting behavior

## Security Considerations

### API Key Security
- Store credentials in system keychain (macOS/Windows) or secure storage
- Encrypt sensitive data at rest
- Never log or transmit credentials in plain text
- Provide secure token revocation/regeneration

### Data Privacy
- Minimal data collection and storage
- Clear data deletion options
- No third-party data transmission
- Compliance with privacy best practices

## Risk Mitigation

### Technical Risks
- **API Rate Limits**: Implement robust queuing and backoff strategies
- **API Changes**: Version pinning and change monitoring
- **Performance Issues**: Caching, pagination, and background processing
- **Cross-platform Compatibility**: Extensive testing on all target platforms

### User Experience Risks
- **Complex Setup**: Step-by-step wizard with validation
- **Error Recovery**: Clear error messages and recovery options
- **Data Loss**: Backup mechanisms and transaction rollbacks

## Success Metrics

### Technical Metrics
- 90% unit test coverage achieved
- API error rate < 1%
- Application startup time < 5 seconds
- Memory usage < 100MB baseline

### User Experience Metrics
- Successful authentication rate > 95%
- Average scrobbling time < 2 seconds per track
- User retention after first successful scrobble > 80%

## Deliverables

### Code Deliverables
1. Complete React web application with Node.js backend
2. Node.js backend with Express API
3. JSON file storage system with data models
4. Comprehensive test suite (90% coverage)
5. Build and distribution configuration
6. Up-to-date README.md with setup instructions

### Documentation Deliverables
1. User installation and setup guide
2. Developer documentation and API reference
3. Security and privacy documentation
4. Testing and deployment documentation

## Timeline Summary
- **Day 1**: Project setup, authentication, API integration, JSON file storage
- **Day 2**: Collection browser, scrobbling engine, UI polish, documentation, testing

**Total Development Time: 2 days with Claude Code + Cursor**

This plan ensures a robust, well-tested application that meets all PRD requirements while maintaining high code quality and user experience standards.