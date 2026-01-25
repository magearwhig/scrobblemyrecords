import fs from 'fs';
import path from 'path';

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';

// Load environment variables before any other imports
dotenv.config();

import artistMappingRoutes from './backend/routes/artistMapping';
import { createAuthRouter } from './backend/routes/auth';
import createBackupRouter from './backend/routes/backup';
import createCollectionRouter from './backend/routes/collection';
import createDiscardPileRouter from './backend/routes/discardPile';
import createImagesRouter from './backend/routes/images';
import createReleasesRouter from './backend/routes/releases';
import createScrobbleRouter from './backend/routes/scrobble';
import createSellersRouter from './backend/routes/sellers';
import createStatsRouter from './backend/routes/stats';
import createSuggestionsRouter from './backend/routes/suggestions';
import createWishlistRouter from './backend/routes/wishlist';
import { AnalyticsService } from './backend/services/analyticsService';
import { AuthService } from './backend/services/authService';
import { BackupService } from './backend/services/backupService';
import { CleanupService } from './backend/services/cleanupService';
import { DiscardPileService } from './backend/services/discardPileService';
import { DiscogsService } from './backend/services/discogsService';
import { HiddenItemService } from './backend/services/hiddenItemService';
import { HiddenReleasesService } from './backend/services/hiddenReleasesService';
import { ImageService } from './backend/services/imageService';
import { LastFmService } from './backend/services/lastfmService';
import { MappingService } from './backend/services/mappingService';
import { MigrationService } from './backend/services/migrationService';
import { MusicBrainzService } from './backend/services/musicbrainzService';
import { ReleaseTrackingService } from './backend/services/releaseTrackingService';
import { ScrobbleHistoryStorage } from './backend/services/scrobbleHistoryStorage';
import { ScrobbleHistorySyncService } from './backend/services/scrobbleHistorySyncService';
import { SellerMonitoringService } from './backend/services/sellerMonitoringService';
import { StatsService } from './backend/services/statsService';
import { SuggestionService } from './backend/services/suggestionService';
import { TrackMappingService } from './backend/services/trackMappingService';
import { WishlistService } from './backend/services/wishlistService';
import { FileStorage } from './backend/utils/fileStorage';
import { createLogger } from './backend/utils/logger';

const log = createLogger('Server');

// Server lock file to prevent multiple instances
const LOCK_FILE = path.join(process.cwd(), 'data', '.server.lock');

/**
 * Acquire a lock file to prevent multiple server instances.
 * Returns true if lock acquired, false if another instance is running.
 */
function acquireServerLock(): boolean {
  try {
    // Check if lock file exists
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = fs.readFileSync(LOCK_FILE, 'utf-8');
      const { pid, startTime } = JSON.parse(lockData);

      // Check if the process is still running
      try {
        process.kill(pid, 0); // Signal 0 just checks if process exists
        // Process exists - another instance is running
        log.error(
          `Another server instance is already running (PID: ${pid}, started: ${new Date(startTime).toISOString()})`
        );
        return false;
      } catch {
        // Process doesn't exist - stale lock file, remove it
        log.warn('Removing stale lock file from previous crashed instance');
        fs.unlinkSync(LOCK_FILE);
      }
    }

    // Create lock file with our PID
    fs.writeFileSync(
      LOCK_FILE,
      JSON.stringify({ pid: process.pid, startTime: Date.now() })
    );
    return true;
  } catch (error) {
    log.error('Failed to acquire server lock', error);
    return false;
  }
}

/**
 * Release the server lock file on shutdown.
 */
function releaseServerLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = fs.readFileSync(LOCK_FILE, 'utf-8');
      const { pid } = JSON.parse(lockData);
      // Only remove if it's our lock
      if (pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
        log.info('Server lock released');
      }
    }
  } catch (error) {
    log.warn('Failed to release server lock', error);
  }
}

const app = express();
const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || '3001',
  10
);
const HOST = process.env.HOST || '127.0.0.1';

// Initialize file storage
const fileStorage = new FileStorage();

// Security middleware
app.use(helmet());

// CORS configuration with strict origin allowlist
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, tests, etc.)
      if (!origin) {
        return callback(null, true);
      }

      // Strict allowlist of permitted origins
      const allowedOrigins = [
        'http://localhost:8080', // Development frontend
        'http://127.0.0.1:8080', // Alternative localhost
        'http://localhost:3000', // Test environment
        'http://127.0.0.1:3000', // Alternative test environment
        process.env.FRONTEND_URL, // Production frontend URL
      ].filter(Boolean); // Remove undefined entries

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // For tests, be more permissive
      if (process.env.NODE_ENV === 'test') {
        return callback(null, true);
      }

      // Log rejected CORS requests for security monitoring
      log.warn(`CORS request rejected from origin: ${origin || 'null'}`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200, // Some legacy browsers choke on 204
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JSON parsing error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON format',
      });
    }
    next(err);
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Initialize services
const authService = new AuthService(fileStorage);
const lastfmService = new LastFmService(fileStorage, authService);
const discogsService = new DiscogsService(fileStorage, authService);

// Initialize suggestion-related services
const historyStorage = new ScrobbleHistoryStorage(fileStorage);
const syncService = new ScrobbleHistorySyncService(
  fileStorage,
  authService,
  historyStorage
);
const mappingService = new MappingService(fileStorage);
const trackMappingService = new TrackMappingService(fileStorage);
const hiddenItemService = new HiddenItemService(fileStorage);
const hiddenReleasesService = new HiddenReleasesService(fileStorage);
const analyticsService = new AnalyticsService(historyStorage, lastfmService);
analyticsService.setMappingService(mappingService);
const suggestionService = new SuggestionService(
  analyticsService,
  historyStorage
);
const statsService = new StatsService(fileStorage, historyStorage);
statsService.setTrackMappingService(trackMappingService);
const imageService = new ImageService(fileStorage, lastfmService);
const wishlistService = new WishlistService(fileStorage, authService);
const sellerMonitoringService = new SellerMonitoringService(
  fileStorage,
  authService,
  wishlistService
);
const musicBrainzService = new MusicBrainzService();
const releaseTrackingService = new ReleaseTrackingService(
  fileStorage,
  discogsService,
  musicBrainzService,
  wishlistService,
  hiddenReleasesService
);
const backupService = new BackupService(fileStorage, 'data');
const discardPileService = new DiscardPileService(fileStorage);

// API routes
app.use(
  '/api/v1/auth',
  createAuthRouter(fileStorage, authService, discogsService, lastfmService)
);
app.use(
  '/api/v1/collection',
  createCollectionRouter(fileStorage, authService, discogsService)
);
app.use(
  '/api/v1/scrobble',
  createScrobbleRouter(
    fileStorage,
    authService,
    lastfmService,
    discogsService,
    syncService
  )
);
app.use('/api/v1/artist-mappings', artistMappingRoutes);
app.use(
  '/api/v1/stats',
  createStatsRouter(
    fileStorage,
    authService,
    statsService,
    historyStorage,
    wishlistService,
    sellerMonitoringService,
    analyticsService
  )
);
app.use(
  '/api/v1/images',
  createImagesRouter(fileStorage, authService, imageService)
);
app.use(
  '/api/v1/suggestions',
  createSuggestionsRouter(
    fileStorage,
    authService,
    discogsService,
    historyStorage,
    syncService,
    analyticsService,
    suggestionService,
    mappingService,
    trackMappingService,
    hiddenItemService,
    statsService
  )
);
app.use(
  '/api/v1/wishlist',
  createWishlistRouter(
    fileStorage,
    authService,
    wishlistService,
    sellerMonitoringService
  )
);
app.use(
  '/api/v1/sellers',
  createSellersRouter(fileStorage, authService, sellerMonitoringService)
);
app.use(
  '/api/v1/releases',
  createReleasesRouter(
    authService,
    releaseTrackingService,
    hiddenReleasesService
  )
);
app.use('/api/v1/backup', createBackupRouter(backupService));
app.use('/api/v1/discard-pile', createDiscardPileRouter(discardPileService));

// API info endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    message: 'Discogs to Last.fm Scrobbler API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      collection: '/api/v1/collection',
      scrobble: '/api/v1/scrobble',
      suggestions: '/api/v1/suggestions',
      stats: '/api/v1/stats',
      images: '/api/v1/images',
      wishlist: '/api/v1/wishlist',
      sellers: '/api/v1/sellers',
      releases: '/api/v1/releases',
      backup: '/api/v1/backup',
      discardPile: '/api/v1/discard-pile',
    },
  });
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    log.error('Request error', { message: err.message, path: req.path });
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
    log.info('Data directories initialized');

    // Acquire server lock - prevent multiple instances
    if (process.env.NODE_ENV !== 'test') {
      if (!acquireServerLock()) {
        log.error(
          'Cannot start server: another instance is already running. ' +
            'Stop the other instance or delete data/.server.lock if it crashed.'
        );
        process.exit(1);
      }
      log.info(`Server lock acquired (PID: ${process.pid})`);
    }

    // Run migrations asynchronously - don't block server startup
    // This ensures all data files have proper schema versioning
    const migrationService = new MigrationService(fileStorage);
    const cleanupService = new CleanupService(fileStorage);

    migrationService
      .migrateAllOnStartup((file, status) => {
        if (status === 'migrating') {
          log.info(`Migrating data file: ${file}`);
        }
      })
      .then(report => {
        if (report.errors.length > 0) {
          log.warn(`Migration completed with ${report.errors.length} errors`);
        }

        // Run cleanup after migrations complete - non-blocking
        // This removes stale cache data based on retention policies
        return cleanupService.runCleanup();
      })
      .then(cleanupReport => {
        if (cleanupReport && cleanupReport.errors.length > 0) {
          log.warn(
            `Cleanup completed with ${cleanupReport.errors.length} errors`
          );
        }

        // Check and run auto-backup if due - non-blocking
        return backupService.checkAndRunAutoBackup();
      })
      .catch(err => {
        log.error('Startup maintenance tasks failed:', err);
        // Don't crash server - maintenance tasks are best-effort on startup
      });

    // Only start server if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      const server = app.listen(PORT, HOST, () => {
        log.info(`Server running on ${HOST}:${PORT}`);
        log.info(`Health check: http://${HOST}:${PORT}/health`);
        log.info(`Server bound to: ${HOST}:${PORT} (localhost only)`);
        if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
          log.warn(
            `Server bound to ${HOST} - ensure this is intentional for security`
          );
        }
      });

      server.on('error', error => {
        log.error('Server error', error);
      });

      // Periodic auto-backup check every 6 hours (in addition to startup check)
      // This ensures backups happen even during long-running sessions
      const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
      setInterval(() => {
        backupService.checkAndRunAutoBackup().catch(err => {
          log.warn('Periodic auto-backup check failed:', err);
        });
      }, SIX_HOURS_MS);
    }
  } catch (error) {
    log.error('Failed to start server', error);
    releaseServerLock();
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on('SIGINT', () => {
  log.info('Received SIGINT, shutting down gracefully...');
  releaseServerLock();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('Received SIGTERM, shutting down gracefully...');
  releaseServerLock();
  process.exit(0);
});

process.on('exit', () => {
  releaseServerLock();
});

// Initialize the server
startServer();

export default app;
