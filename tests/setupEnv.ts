/**
 * Jest `setupFiles` hook for the backend project.
 *
 * This runs before `setupFilesAfterEnv` and before any test module is imported,
 * which matters because src/server.ts creates directories and starts migrations,
 * cleanup and auto-backup at import time. DATA_DIR has to be pointed somewhere
 * safe before that happens, or the suite mutates the developer's real data/.
 *
 * The directory is created under the OS temp dir — outside the repository — and
 * is unique per test file, so parallel Jest workers can never collide. Cleanup
 * happens in tests/setup.ts, which captures this exact path in an afterAll.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.NODE_ENV = 'test';

process.env.DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), 'recordscrobbles-jest-')
);
