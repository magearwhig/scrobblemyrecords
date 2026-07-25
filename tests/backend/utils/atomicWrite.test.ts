import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import * as atomicWriteModule from '../../../src/backend/utils/atomicWrite';
import {
  activeTempPathCount,
  atomicWriteFile,
  atomicWriteFileSync,
  isTempFileName,
  TEMP_FILE_PREFIX,
  tempPathFor,
} from '../../../src/backend/utils/atomicWrite';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

/**
 * These tests assert the *invariants* of atomic replacement. They deliberately
 * do not claim to prove crash-safety: killing a process mid-fsync isn't
 * reproducible from inside Jest. What is testable, and what actually matters
 * for the bug being fixed, is that the destination is never observable in a
 * partial state and that no temp files survive either success or failure.
 */
describe('atomicWrite', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const listing = () => fs.readdir(dir);
  const tempFiles = async () =>
    (await listing()).filter(name => isTempFileName(name));

  describe('tempPathFor', () => {
    it('places the temp file in the destination directory', () => {
      const target = path.join(dir, 'nested', 'file.json');
      expect(path.dirname(tempPathFor(target))).toBe(path.dirname(target));
    });

    it('uses the reserved prefix', () => {
      const temp = path.basename(tempPathFor(path.join(dir, 'file.json')));
      expect(temp.startsWith(TEMP_FILE_PREFIX)).toBe(true);
      expect(isTempFileName(temp)).toBe(true);
    });

    it('never produces the same name twice', () => {
      const target = path.join(dir, 'file.json');
      const names = new Set(
        Array.from({ length: 500 }, () => tempPathFor(target))
      );
      expect(names.size).toBe(500);
    });
  });

  describe('atomicWriteFile', () => {
    it('writes contents to the destination', async () => {
      const target = path.join(dir, 'file.json');
      await atomicWriteFile(target, '{"a":1}');
      expect(await fs.readFile(target, 'utf-8')).toBe('{"a":1}');
    });

    it('leaves no temp file behind on success', async () => {
      await atomicWriteFile(path.join(dir, 'file.json'), '{"a":1}');
      expect(await tempFiles()).toEqual([]);
    });

    it('replaces existing content rather than appending', async () => {
      const target = path.join(dir, 'file.json');
      await atomicWriteFile(target, 'a-much-longer-original-value');
      await atomicWriteFile(target, 'short');
      expect(await fs.readFile(target, 'utf-8')).toBe('short');
    });

    it('preserves the mode of the file it replaces', async () => {
      const target = path.join(dir, 'file.json');
      await fs.writeFile(target, 'original');
      await fs.chmod(target, 0o640);

      await atomicWriteFile(target, 'replacement');

      const stats = await fs.stat(target);
      expect(stats.mode & 0o777).toBe(0o640);
    });

    it('creates new files with owner-only permissions', async () => {
      const target = path.join(dir, 'new.json');
      await atomicWriteFile(target, 'x');
      const stats = await fs.stat(target);
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('cleans up the temp file when the write fails', async () => {
      // A directory as the destination makes rename fail (EISDIR/ENOTEMPTY)
      // after the temp file has already been created.
      const target = path.join(dir, 'a-directory');
      await fs.mkdir(target);
      await fs.writeFile(path.join(target, 'occupant'), 'x');

      await expect(atomicWriteFile(target, 'contents')).rejects.toThrow();
      expect(await tempFiles()).toEqual([]);
    });

    it('never leaves the destination partially written under concurrency', async () => {
      const target = path.join(dir, 'contended.json');
      const writers = Array.from({ length: 40 }, (_, i) =>
        atomicWriteFile(
          target,
          JSON.stringify({ writer: i, pad: 'x'.repeat(i * 500) })
        )
      );
      await Promise.all(writers);

      // Whichever writer's rename landed last, the file must be complete and
      // parseable — never a truncated mix of two writers' contents.
      const parsed = JSON.parse(await fs.readFile(target, 'utf-8'));
      expect(typeof parsed.writer).toBe('number');
      expect(parsed.pad).toHaveLength(parsed.writer * 500);
      expect(await tempFiles()).toEqual([]);
    });

    it('a concurrent reader only ever sees complete content', async () => {
      const target = path.join(dir, 'read-during-write.json');
      const small = JSON.stringify({ size: 'small' });
      const large = JSON.stringify({ size: 'large', pad: 'y'.repeat(200_000) });

      await atomicWriteFile(target, small);

      const observed: string[] = [];
      const reads = (async () => {
        for (let i = 0; i < 200; i++) {
          const raw = await fs.readFile(target, 'utf-8');
          observed.push(JSON.parse(raw).size); // throws if ever torn
        }
      })();

      const writes = (async () => {
        for (let i = 0; i < 20; i++) {
          await atomicWriteFile(target, i % 2 === 0 ? large : small);
        }
      })();

      await Promise.all([reads, writes]);
      expect(observed.every(size => size === 'small' || size === 'large')).toBe(
        true
      );
    });
  });

  describe('hardening (regressions found in review)', () => {
    it('preserves mode even under a restrictive umask', async () => {
      // open(path, flags, mode) filters mode through the umask, so mode
      // preservation only worked by luck under the default 0o022. chmod does
      // not, which is why the implementation calls it explicitly.
      const previous = process.umask(0o077);
      try {
        const target = path.join(dir, 'umask.json');
        await fs.writeFile(target, 'original');
        await fs.chmod(target, 0o644);

        await atomicWriteFile(target, 'replacement');

        expect((await fs.stat(target)).mode & 0o777).toBe(0o644);
      } finally {
        process.umask(previous);
      }
    });

    it('preserves mode under a restrictive umask in the sync path too', async () => {
      const previous = process.umask(0o077);
      try {
        const target = path.join(dir, 'umask-sync.json');
        await fs.writeFile(target, 'original');
        await fs.chmod(target, 0o644);

        atomicWriteFileSync(target, 'replacement');

        expect((await fs.stat(target)).mode & 0o777).toBe(0o644);
      } finally {
        process.umask(previous);
      }
    });

    it('leaves other files alone when it cannot create its temp file', async () => {
      // Cleanup must only ever unlink a temp this call successfully created.
      // A read-only directory makes the exclusive open fail, standing in for
      // the EEXIST name-collision case — that exact case needs a forced UUID
      // collision, and Node's builtin exports are not mockable here.
      const readOnlyDir = path.join(dir, 'readonly');
      await fs.mkdir(readOnlyDir);
      const bystander = path.join(readOnlyDir, `${TEMP_FILE_PREFIX}bystander`);
      await fs.writeFile(bystander, 'not-mine');
      await fs.chmod(readOnlyDir, 0o500);

      try {
        await expect(
          atomicWriteFile(path.join(readOnlyDir, 'target.json'), 'mine')
        ).rejects.toThrow();

        expect(await fs.readFile(bystander, 'utf-8')).toBe('not-mine');
      } finally {
        await fs.chmod(readOnlyDir, 0o700);
      }
    });

    it('tracks writes as in flight and releases them on completion', async () => {
      // The stale-temp sweep consults this set so it can never unlink a write
      // that is still running.
      expect(activeTempPathCount()).toBe(0);

      let settled = false;
      const write = atomicWriteFile(
        path.join(dir, 'inflight.json'),
        JSON.stringify({ pad: 'q'.repeat(500_000) })
      ).finally(() => {
        settled = true;
      });

      // Poll rather than sampling once: the call spends its first turns in
      // stat() before the temp file exists at all.
      let peak = 0;
      while (!settled) {
        peak = Math.max(peak, activeTempPathCount());
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      await write;

      expect(peak).toBe(1);
      expect(activeTempPathCount()).toBe(0);
    });

    it('releases in-flight tracking even when the write fails', async () => {
      const target = path.join(dir, 'fail-dir');
      await fs.mkdir(target);
      await fs.writeFile(path.join(target, 'occupant'), 'x');

      await expect(atomicWriteFile(target, 'contents')).rejects.toThrow();
      expect(activeTempPathCount()).toBe(0);
    });
  });

  describe('durability option', () => {
    it('stays atomic when fsync is skipped', async () => {
      const target = path.join(dir, 'nondurable.json');
      const writers = Array.from({ length: 30 }, (_, i) =>
        atomicWriteFile(
          target,
          JSON.stringify({ writer: i, pad: 'z'.repeat(i * 400) }),
          { durable: false }
        )
      );
      await Promise.all(writers);

      const parsed = JSON.parse(await fs.readFile(target, 'utf-8'));
      expect(parsed.pad).toHaveLength(parsed.writer * 400);
      expect(await tempFiles()).toEqual([]);
    });

    it('writes correct contents with and without fsync', async () => {
      const a = path.join(dir, 'a.json');
      const b = path.join(dir, 'b.json');
      await atomicWriteFile(a, 'durable', { durable: true });
      await atomicWriteFile(b, 'fast', { durable: false });

      expect(await fs.readFile(a, 'utf-8')).toBe('durable');
      expect(await fs.readFile(b, 'utf-8')).toBe('fast');
    });

    it('skipping fsync is materially faster', async () => {
      const measure = async (durable: boolean) => {
        const target = path.join(dir, `perf-${durable}.json`);
        const payload = JSON.stringify({ pad: 'x'.repeat(20_000) });
        const start = process.hrtime.bigint();
        for (let i = 0; i < 15; i++) {
          await atomicWriteFile(target, payload, { durable });
        }
        return Number(process.hrtime.bigint() - start) / 1e6;
      };

      const durableMs = await measure(true);
      const fastMs = await measure(false);

      // Loose assertion — this documents the trade-off that motivated the
      // regenerable-cache list without being flaky on fast or slow disks.
      expect(fastMs).toBeLessThan(durableMs);
    });
  });

  describe('atomicWriteFileSync', () => {
    it('writes contents to the destination', () => {
      const target = path.join(dir, 'sync.json');
      atomicWriteFileSync(target, '{"sync":true}');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      expect(require('fs').readFileSync(target, 'utf-8')).toBe('{"sync":true}');
    });

    it('leaves no temp file behind on success', async () => {
      atomicWriteFileSync(path.join(dir, 'sync.json'), 'x');
      expect(await tempFiles()).toEqual([]);
    });

    it('cleans up the temp file when the write fails', async () => {
      const target = path.join(dir, 'sync-dir');
      await fs.mkdir(target);
      await fs.writeFile(path.join(target, 'occupant'), 'x');

      expect(() => atomicWriteFileSync(target, 'contents')).toThrow();
      expect(await tempFiles()).toEqual([]);
    });
  });

  describe('FileStorage integration', () => {
    let storage: FileStorage;

    beforeEach(async () => {
      storage = new FileStorage(dir);
      await storage.ensureDataDir();
    });

    it('hides temp files from listFiles', async () => {
      await fs.writeFile(
        path.join(dir, 'collections', `${TEMP_FILE_PREFIX}in-flight.json`),
        '{"partial"'
      );
      await storage.writeJSON('collections/real.json', { ok: true });

      expect(await storage.listFiles('collections')).toEqual(['real.json']);
    });

    it('writeJSON leaves no temp files behind', async () => {
      await storage.writeJSON('settings/a.json', { a: 1 });
      await storage.writeJSON('settings/b.json', { b: 2 });

      const settingsDir = await fs.readdir(path.join(dir, 'settings'));
      expect(settingsDir.filter(isTempFileName)).toEqual([]);
    });

    it('gives concurrent backups of one file distinct destinations', async () => {
      await storage.writeJSON('settings/contended.json', { v: 1 });

      // Same-millisecond concurrency: a timestamp-only backup name would
      // collide here and the copies would corrupt each other.
      const paths = await Promise.all(
        Array.from({ length: 25 }, () =>
          storage.createBackup('settings/contended.json')
        )
      );

      const unique = new Set(paths.filter(Boolean) as string[]);
      expect(unique.size).toBe(25);

      // Only MAX_BACKUPS survive — createBackup rotates old ones away — so
      // check the files that are still there, not every path returned.
      const survivors = (await fs.readdir(path.join(dir, 'settings'))).filter(
        name => name.endsWith('.bak')
      );
      expect(survivors.length).toBeGreaterThan(0);

      for (const name of survivors) {
        const raw = await fs.readFile(
          path.join(dir, 'settings', name),
          'utf-8'
        );
        expect(JSON.parse(raw)).toEqual({ v: 1 });
      }
    });

    it('writes regenerable caches non-durably and user data durably', async () => {
      // The classification is what makes the fsync trade-off safe, so assert it
      // explicitly rather than trusting the path list by inspection.
      const spy = jest.spyOn(atomicWriteModule, 'atomicWriteFile');
      const storageWithSpy = new FileStorage(dir);

      await storageWithSpy.writeJSON('images/album-covers.json', { a: 1 });
      await storageWithSpy.writeJSON('sellers/inventory-cache/s1.json', {
        a: 1,
      });
      await storageWithSpy.writeJSON('settings/user-settings.json', { a: 1 });
      await storageWithSpy.writeJSON('mappings/album-mappings.json', { a: 1 });

      const durabilityOf = (n: number) => spy.mock.calls[n][2]?.durable;
      expect(durabilityOf(0)).toBe(false); // regenerable image cache
      expect(durabilityOf(1)).toBe(false); // regenerable inventory cache
      expect(durabilityOf(2)).toBe(true); // credentials — irreplaceable
      expect(durabilityOf(3)).toBe(true); // user mappings — irreplaceable

      spy.mockRestore();
    });

    it('lets an explicit option override the path classification', async () => {
      const spy = jest.spyOn(atomicWriteModule, 'atomicWriteFile');
      const storageWithSpy = new FileStorage(dir);

      await storageWithSpy.writeJSON(
        'images/album-covers.json',
        { a: 1 },
        { durable: true }
      );

      expect(spy.mock.calls[0][2]?.durable).toBe(true);
      spy.mockRestore();
    });

    it('writeJSONWithBackup keeps the destination readable throughout', async () => {
      await storage.writeJSON('settings/s.json', { version: 0 });

      for (let i = 1; i <= 5; i++) {
        await storage.writeJSONWithBackup('settings/s.json', { version: i });
        expect(await storage.readJSON('settings/s.json')).toEqual({
          version: i,
        });
      }
    });
  });
});
