import * as path from 'path';

/**
 * Resolve the application data directory to an absolute path.
 *
 * Every module that touches persistent storage must go through this function
 * rather than joining `process.cwd()` with 'data' itself. Centralizing it is
 * what makes the test-mode guard below effective: a guard placed at a single
 * call site executes too late, because imported modules initialize before the
 * importing module's body runs.
 *
 * In test mode this refuses to resolve to the repository's real `data/`
 * directory. Jest's `setupFiles` hook (tests/setupEnv.ts) points DATA_DIR at a
 * fresh temp directory before any test module is imported; if that ever stops
 * happening, tests fail loudly here instead of silently mutating real data.
 */
export function resolveDataDir(): string {
  const resolved = path.resolve(process.env.DATA_DIR || './data');

  if (process.env.NODE_ENV === 'test') {
    const realDataDir = path.resolve(process.cwd(), 'data');

    if (!process.env.DATA_DIR) {
      throw new Error(
        'DATA_DIR is not set in the test environment. Tests must never use the ' +
          'real data directory. Ensure tests/setupEnv.ts is registered as a ' +
          "Jest `setupFiles` entry for this project, and don't delete DATA_DIR " +
          'inside a test.'
      );
    }

    if (resolved === realDataDir) {
      throw new Error(
        `DATA_DIR resolves to the real data directory (${realDataDir}) in the ` +
          'test environment. Point it at a temp directory instead.'
      );
    }
  }

  return resolved;
}
