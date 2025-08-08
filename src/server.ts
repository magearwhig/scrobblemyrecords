import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';

import authRoutes from './backend/routes/auth';
import createCollectionRouter from './backend/routes/collection';
import createScrobbleRouter from './backend/routes/scrobble';
import { AuthService } from './backend/services/authService';
import { DiscogsService } from './backend/services/discogsService';
import { LastFmService } from './backend/services/lastfmService';
import { FileStorage } from './backend/utils/fileStorage';

dotenv.config();

const app = express();
const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || '3001',
  10
);

// Initialize file storage
const fileStorage = new FileStorage();

// Security middleware
app.use(helmet());

// CORS configuration for both web and Electron
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      // Allow file:// protocol for Electron
      if (origin && origin.startsWith('file://')) return callback(null, true);

      // Allow localhost origins
      if (
        origin &&
        (origin.includes('localhost') || origin.includes('127.0.0.1'))
      ) {
        return callback(null, true);
      }

      // Check environment-specific frontend URL
      if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize services
const authService = new AuthService(fileStorage);
const lastfmService = new LastFmService(fileStorage, authService);
const discogsService = new DiscogsService(fileStorage, authService);

// API routes
app.use('/api/v1/auth', authRoutes);
app.use(
  '/api/v1/collection',
  createCollectionRouter(fileStorage, authService, discogsService)
);
app.use(
  '/api/v1/scrobble',
  createScrobbleRouter(fileStorage, authService, lastfmService)
);

// API info endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    message: 'Discogs to Last.fm Scrobbler API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      collection: '/api/v1/collection',
      scrobble: '/api/v1/scrobble',
    },
  });
});

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Error:', err);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message,
    });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

async function startServer() {
  try {
    // Initialize data directories
    await fileStorage.ensureDataDir();
    console.log('✅ Data directories initialized');

    // Only start server if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      const server = app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/health`);
        console.log(`🔧 Server bound to: 0.0.0.0:${PORT}`);
      });

      server.on('error', error => {
        console.error('❌ Server error:', error);
      });
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Initialize the server
startServer();

export default app;
