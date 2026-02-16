import fs from 'fs';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

/**
 * Options for configuring a test Express application.
 */
interface CreateTestAppOptions {
  /**
   * The URL path prefix where the router will be mounted.
   * Example: '/api/v1/backup'
   */
  mountPath: string;

  /**
   * Factory function that creates and returns the Express router.
   * Receives the mock services and should return the router to mount.
   *
   * Example:
   *   (mocks) => createBackupRouter(mocks.backupService)
   */
  routerFactory: (mocks: Record<string, unknown>) => express.Router;

  /**
   * Object containing mock service instances to pass to the router factory.
   */
  mocks: Record<string, unknown>;

  /**
   * Whether to include helmet middleware. Defaults to true.
   * Some test scenarios may need this disabled.
   */
  useHelmet?: boolean;

  /**
   * Whether to include CORS middleware. Defaults to true.
   */
  useCors?: boolean;

  /**
   * Additional middleware to apply before mounting routes.
   * Useful for adding app.locals or custom request augmentation.
   */
  middleware?: express.RequestHandler[];
}

/**
 * Creates a properly configured Express app for route testing with supertest.
 *
 * This helper exists to prevent TCPSERVERWRAP handle leaks that cause ~43% of
 * test flakiness. It ensures every test app includes:
 * - `Connection: close` header on all responses (prevents keep-alive leaks)
 * - JSON body parsing
 * - Standard security middleware (helmet, cors)
 *
 * The returned app should be used directly with supertest — do NOT call
 * app.listen(). Supertest manages its own server lifecycle internally.
 *
 * @example
 * ```typescript
 * const { app } = createTestApp({
 *   mountPath: '/api/v1/backup',
 *   routerFactory: (mocks) => createBackupRouter(mocks.backupService as BackupService),
 *   mocks: { backupService: mockBackupService },
 * });
 *
 * const response = await request(app).get('/api/v1/backup/preview');
 * ```
 */
export function createTestApp(options: CreateTestAppOptions): {
  app: express.Application;
} {
  const {
    mountPath,
    routerFactory,
    mocks,
    useHelmet = true,
    useCors = true,
    middleware = [],
  } = options;

  const app = express();

  if (useHelmet) {
    app.use(helmet());
  }
  if (useCors) {
    app.use(cors());
  }

  app.use(express.json());

  // Prevent TCPSERVERWRAP leaks by closing connections after each response.
  // Without this, supertest's internal server keeps sockets alive via HTTP
  // keep-alive, and Jest detects them as open handles after tests complete.
  app.use(
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      res.set('Connection', 'close');
      next();
    }
  );

  // Apply any additional middleware (e.g., setting app.locals)
  for (const mw of middleware) {
    app.use(mw);
  }

  const router = routerFactory(mocks);
  app.use(mountPath, router);

  return { app };
}

/**
 * Creates a minimal Express app with Connection: close and JSON parsing.
 *
 * Use this when you need more control over middleware or route mounting
 * than createTestApp provides — for example, when a route file needs
 * to be mounted in a specific way or requires app.locals setup.
 *
 * @example
 * ```typescript
 * const app = createMinimalApp();
 * app.locals.discogsService = mockDiscogsService;
 * app.use('/api/v1/collection', createCollectionRouter(...));
 * ```
 */
export function createMinimalApp(): express.Application {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      res.set('Connection', 'close');
      next();
    }
  );
  return app;
}

/**
 * Generates a unique temporary directory path for file-system-based tests.
 *
 * Each call produces a path incorporating the test file name, PID, and a
 * timestamp so that parallel test workers never collide on the same directory.
 * The caller is responsible for creating and cleaning up the directory.
 *
 * @param testName - A short identifier for the test (e.g., 'artist-mapping')
 * @returns An absolute-ish path like './test-data-artist-mapping-12345-1708000000000'
 *
 * @example
 * ```typescript
 * const testDir = uniqueTestDir('artist-mapping');
 * fs.mkdirSync(testDir, { recursive: true });
 *
 * afterEach(() => {
 *   fs.rmSync(testDir, { recursive: true, force: true });
 * });
 * ```
 */
export function uniqueTestDir(testName: string): string {
  return `./test-data-${testName}-${process.pid}-${Date.now()}`;
}

/**
 * Safely cleans up a test directory, ignoring errors if it doesn't exist.
 *
 * @param dirPath - The directory path to remove recursively.
 */
export function cleanupTestDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Directory may not exist; that's fine.
  }
}

/**
 * Installs fake timers and returns a cleanup function that restores real timers.
 *
 * Prevents the common flakiness pattern where a test uses jest.useFakeTimers()
 * but forgets to call jest.useRealTimers(), breaking subsequent tests that
 * rely on real setTimeout/setInterval (e.g., supertest request timeouts).
 *
 * @example
 * ```typescript
 * describe('debounced search', () => {
 *   let restoreTimers: () => void;
 *
 *   beforeEach(() => {
 *     restoreTimers = useFakeTimers();
 *   });
 *
 *   afterEach(() => {
 *     restoreTimers();
 *   });
 *
 *   it('should debounce', () => {
 *     jest.advanceTimersByTime(300);
 *     // ...
 *   });
 * });
 * ```
 */
export function useFakeTimers(): () => void {
  jest.useFakeTimers();
  return () => {
    jest.useRealTimers();
  };
}
