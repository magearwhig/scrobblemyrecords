import { randomUUID } from 'crypto';
import * as fsSync from 'fs';
import type { FileHandle } from 'fs/promises';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Crash-safe file replacement: write to a temp file in the same directory,
 * fsync it, then atomically rename it over the destination.
 *
 * A bare fs.writeFile truncates the destination before writing, so a crash or
 * power loss mid-write leaves a truncated (invalid JSON) authoritative file.
 * With temp+rename, a reader sees either the complete old file or the complete
 * new one — never a partial one — because rename is atomic on POSIX filesystems.
 *
 * This also means concurrent writers cannot tear a file: the last rename to
 * execute wins, whole. Note "last to execute", not "last to be requested" — a
 * slower earlier write can still land on top of a faster later one. That is a
 * lost update, not corruption, and is a separate problem requiring read+write
 * to happen under one lock.
 *
 * Protection is in-process only. Two Node processes writing the same path still
 * race; the server lock file is what prevents that here.
 */

/**
 * Reserved prefix for in-flight temp files. Directory listings must filter this
 * namespace so consumers never pick up a partially written file.
 */
export const TEMP_FILE_PREFIX = '.tmp-';

export function isTempFileName(name: string): boolean {
  return name.startsWith(TEMP_FILE_PREFIX);
}

/**
 * Builds a temp path in the destination's OWN directory. Same directory means
 * same filesystem, which is what keeps the rename atomic and EXDEV-free.
 * PID + UUID makes the name unique across workers and within a millisecond.
 */
export function tempPathFor(fullPath: string): string {
  const dir = path.dirname(fullPath);
  const base = path.basename(fullPath);
  return path.join(
    dir,
    `${TEMP_FILE_PREFIX}${base}-${process.pid}-${randomUUID()}`
  );
}

/** Default mode for newly created files (owner read/write only). */
const DEFAULT_FILE_MODE = 0o600;

/**
 * Temp files this process currently has open for writing.
 *
 * The stale-temp sweep consults this so it can never unlink a write that is
 * still in flight — a writer blocked in fsync for longer than the sweep's age
 * threshold would otherwise have its temp deleted out from under it and fail
 * its rename with ENOENT. Temps left by a *previous* process cannot be in this
 * set, which is exactly the population the sweep is meant to collect.
 */
const activeTempPaths = new Set<string>();

export function isTempPathActive(fullPath: string): boolean {
  return activeTempPaths.has(fullPath);
}

/** How many writes this process currently has in flight. */
export function activeTempPathCount(): number {
  return activeTempPaths.size;
}

/**
 * Rename replaces the inode, so the destination's mode does not carry over the
 * way it would when truncating in place. Preserve it explicitly when replacing
 * an existing file.
 *
 * Masks with 0o7777 rather than 0o777 so setuid/setgid/sticky bits survive, and
 * only treats ENOENT as "no existing file" — any other stat error would mean
 * silently narrowing or widening a file whose real mode we failed to read.
 */
async function modeForReplacement(fullPath: string): Promise<number> {
  try {
    const stats = await fs.stat(fullPath);
    return stats.mode & 0o7777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_FILE_MODE;
    }
    throw error;
  }
}

function modeForReplacementSync(fullPath: string): number {
  try {
    return fsSync.statSync(fullPath).mode & 0o7777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_FILE_MODE;
    }
    throw error;
  }
}

function describeExdev(fullPath: string, error: unknown): unknown {
  if ((error as NodeJS.ErrnoException)?.code !== 'EXDEV') return error;
  // Deliberately no copy-and-unlink fallback: that reintroduces exactly the
  // torn-write window this function exists to close.
  return new Error(
    `Atomic write failed: temp file and destination (${fullPath}) are on ` +
      'different filesystems. Refusing to fall back to a non-atomic copy.'
  );
}

/**
 * Errors that mean "this platform or filesystem does not support fsyncing a
 * directory" rather than "the sync failed".
 *
 * Windows cannot open a directory as a file handle at all; some network and
 * virtualized filesystems reject the operation. These are safe to ignore. A
 * real I/O failure (EIO, ENOSPC, EROFS) is NOT — swallowing those would let a
 * durable write report success when the rename may not survive power loss.
 */
const DIRECTORY_SYNC_UNSUPPORTED = new Set([
  'EPERM',
  'EISDIR',
  'EINVAL',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EACCES',
  'ENOSYS',
]);

function rethrowIfRealSyncFailure(error: unknown): void {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (!code || !DIRECTORY_SYNC_UNSUPPORTED.has(code)) {
    throw error;
  }
}

/**
 * fsync a directory so entries created or renamed within it are durable.
 *
 * Syncing a file makes its contents durable; on Linux the directory must be
 * synced separately or power loss can revert the rename.
 */
export async function syncDirectory(dir: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(dir, 'r');
    await handle.sync();
  } catch (error) {
    rethrowIfRealSyncFailure(error);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export function syncDirectorySync(dir: string): void {
  let fd: number | undefined;
  try {
    fd = fsSync.openSync(dir, 'r');
    fsSync.fsyncSync(fd);
  } catch (error) {
    rethrowIfRealSyncFailure(error);
  } finally {
    if (fd !== undefined) {
      try {
        fsSync.closeSync(fd);
      } catch {
        // Already closed or invalid.
      }
    }
  }
}

export interface AtomicWriteOptions {
  /**
   * fsync the file and its directory before returning, so the write survives
   * power loss. Defaults to true.
   *
   * Setting this to false keeps the write atomic — a reader still never sees a
   * partial file, and a process crash still cannot truncate anything — but a
   * sudden power loss may lose the most recent write. That is the right trade
   * for caches that can be refetched, because fsync costs roughly 40x the rest
   * of the operation combined (~10ms vs ~0.24ms on APFS).
   */
  durable?: boolean;
}

/**
 * Atomically replace a file's contents, durably by default.
 *
 * @param fullPath - Absolute path of the file to replace.
 * @param contents - The complete new contents.
 * @param options - See {@link AtomicWriteOptions}.
 */
export async function atomicWriteFile(
  fullPath: string,
  contents: string,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const durable = options.durable ?? true;
  const tempPath = tempPathFor(fullPath);
  const mode = await modeForReplacement(fullPath);

  let handle: FileHandle | undefined;
  let owned = false;
  let renamed = false;

  try {
    // 'wx' fails rather than clobbering, so a colliding temp name can never
    // silently corrupt another writer's in-flight file.
    handle = await fs.open(tempPath, 'wx', mode);
    // Only now do we own this path. If the open failed with EEXIST the file is
    // someone else's, and the cleanup below must not touch it.
    owned = true;
    activeTempPaths.add(tempPath);

    // open()'s mode argument is filtered through the process umask, so it
    // cannot preserve a mode the umask would strip. chmod is not.
    await handle.chmod(mode);

    await handle.writeFile(contents, 'utf-8');
    if (durable) await handle.sync();
    await handle.close();
    handle = undefined;

    await fs.rename(tempPath, fullPath);
    renamed = true;
  } catch (error) {
    throw describeExdev(fullPath, error);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    if (owned) {
      if (!renamed) await fs.unlink(tempPath).catch(() => undefined);
      activeTempPaths.delete(tempPath);
    }
  }

  if (durable) await syncDirectory(path.dirname(fullPath));
}

/**
 * Synchronous counterpart to {@link atomicWriteFile}, for callers that are not
 * async and cannot be converted cheaply.
 */
export function atomicWriteFileSync(
  fullPath: string,
  contents: string,
  options: AtomicWriteOptions = {}
): void {
  const durable = options.durable ?? true;
  const tempPath = tempPathFor(fullPath);
  const mode = modeForReplacementSync(fullPath);

  let fd: number | undefined;
  let owned = false;
  let renamed = false;

  try {
    fd = fsSync.openSync(tempPath, 'wx', mode);
    // See atomicWriteFile: ownership starts at a successful exclusive open.
    owned = true;
    activeTempPaths.add(tempPath);

    // Defeat the umask, which filters openSync's mode argument.
    fsSync.fchmodSync(fd, mode);

    fsSync.writeFileSync(fd, contents, 'utf-8');
    if (durable) fsSync.fsyncSync(fd);
    fsSync.closeSync(fd);
    fd = undefined;

    fsSync.renameSync(tempPath, fullPath);
    renamed = true;
  } catch (error) {
    throw describeExdev(fullPath, error);
  } finally {
    if (fd !== undefined) {
      try {
        fsSync.closeSync(fd);
      } catch {
        // Already closed.
      }
    }
    if (owned) {
      if (!renamed) {
        try {
          fsSync.unlinkSync(tempPath);
        } catch {
          // Already gone.
        }
      }
      activeTempPaths.delete(tempPath);
    }
  }

  if (durable) syncDirectorySync(path.dirname(fullPath));
}
