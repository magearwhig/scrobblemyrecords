import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  WISHLIST_PRIORITIES_FILE,
  WishlistPriorityService,
} from '../../../src/backend/services/wishlistPriorityService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  EnrichedWishlistItem,
  LocalWantItem,
  WishlistPrioritySnapshot,
} from '../../../src/shared/types';

jest.mock('../../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const want = (
  id: number,
  masterId: number,
  title: string,
  artist = 'Artist'
): EnrichedWishlistItem => ({
  id,
  masterId,
  releaseId: id * 10,
  artist,
  title,
  dateAdded: '2026-01-01T00:00:00Z',
  vinylStatus: 'has_vinyl',
  vinylVersions: [],
});

const local = (
  id: string,
  album: string,
  o: Partial<LocalWantItem> = {}
): LocalWantItem => ({
  id,
  artist: 'Artist',
  album,
  playCount: 0,
  lastPlayed: 0,
  addedAt: 0,
  source: 'discovery',
  vinylStatus: 'unknown',
  notified: false,
  ...o,
});

const titles = (snapshot: WishlistPrioritySnapshot) =>
  snapshot.ranked.map(r => r.title);

describe('WishlistPriorityService', () => {
  let dir: string;
  let storage: FileStorage;
  let wants: EnrichedWishlistItem[];
  let localWants: LocalWantItem[];
  let service: WishlistPriorityService;

  const stored = async () =>
    (
      await storage.readJSON<{ orderedKeys: string[] }>(
        WISHLIST_PRIORITIES_FILE
      )
    )?.orderedKeys;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'priorities-'));
    storage = new FileStorage(dir);
    wants = [
      want(1, 100, 'Alpha'),
      want(2, 200, 'Bravo'),
      want(3, 300, 'Charlie'),
      want(4, 400, 'Delta'),
    ];
    localWants = [];
    service = new WishlistPriorityService(storage, {
      getWishlistItems: async () => wants,
      getLocalWantList: async () => localWants,
    });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('starts with everything unranked, by artist then title', async () => {
    wants = [
      want(1, 100, 'Zed', 'beta'),
      want(2, 200, 'Late', 'Alpha'),
      want(3, 300, 'Early', 'alpha'),
    ];
    const snapshot = await service.getSnapshot();
    expect(snapshot.ranked).toEqual([]);
    expect(snapshot.unranked.map(r => r.title)).toEqual([
      'Early',
      'Late',
      'Zed',
    ]);
  });

  it('gives pressings of one master one row, and wants without a master their own', async () => {
    wants = [
      want(1, 100, 'Alpha'),
      want(2, 100, 'Alpha'),
      want(3, 0, 'No Master'),
    ];
    const { unranked } = await service.getSnapshot();
    expect(unranked.map(r => [r.key, r.wantIds])).toEqual([
      ['master:100', [1, 2]],
      ['release:30', [3]],
    ]);
  });

  it('moves a record from the bottom to the top and ranks in order', async () => {
    await service.applyChange({
      action: 'move',
      key: 'master:100',
      position: 1,
    });
    await service.applyChange({
      action: 'move',
      key: 'master:200',
      position: 2,
    });
    await service.applyChange({
      action: 'move',
      key: 'master:300',
      position: 3,
    });
    const snapshot = await service.applyChange({
      action: 'move',
      key: 'master:300',
      position: 1,
    });
    expect(titles(snapshot)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(snapshot.ranked.map(r => r.rank)).toEqual([1, 2, 3]);
    expect(snapshot.unranked.map(r => r.title)).toEqual(['Delta']);
    expect(await stored()).toEqual(['master:300', 'master:100', 'master:200']);
  });

  it('moves down and treats a position past the end as last', async () => {
    await service.applyChange({
      action: 'move',
      key: 'master:100',
      position: 1,
    });
    await service.applyChange({
      action: 'move',
      key: 'master:200',
      position: 2,
    });
    await service.applyChange({
      action: 'move',
      key: 'master:300',
      position: 3,
    });
    expect(
      titles(
        await service.applyChange({
          action: 'move',
          key: 'master:100',
          position: 2,
        })
      )
    ).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(
      titles(
        await service.applyChange({
          action: 'move',
          key: 'master:200',
          position: 99,
        })
      )
    ).toEqual(['Alpha', 'Charlie', 'Bravo']);
  });

  it('unranks without touching the want', async () => {
    await service.applyChange({
      action: 'move',
      key: 'master:100',
      position: 1,
    });
    const snapshot = await service.applyChange({
      action: 'unrank',
      key: 'master:100',
    });
    expect(snapshot.ranked).toEqual([]);
    expect(snapshot.unranked).toHaveLength(4);
    expect(await stored()).toEqual([]);
  });

  it('runs changes made at the same moment one after another', async () => {
    await Promise.all([
      service.applyChange({ action: 'move', key: 'master:100', position: 1 }),
      service.applyChange({ action: 'move', key: 'master:200', position: 1 }),
      service.applyChange({ action: 'move', key: 'master:300', position: 1 }),
    ]);
    expect(await stored()).toEqual(['master:300', 'master:200', 'master:100']);
  });

  it('rejects a record that is not on the wishlist', async () => {
    await expect(
      service.applyChange({ action: 'move', key: 'master:999', position: 1 })
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await stored()).toBeUndefined();
  });

  describe('when wants change', () => {
    beforeEach(async () => {
      for (const [i, key] of [
        'master:100',
        'master:200',
        'master:300',
      ].entries()) {
        await service.applyChange({ action: 'move', key, position: i + 1 });
      }
    });

    it('closes up around a record that left, and restores it when it returns', async () => {
      const bravo = wants[1];
      wants = wants.filter(w => w !== bravo);
      const without = await service.getSnapshot();
      expect(titles(without)).toEqual(['Alpha', 'Charlie']);
      expect(without.ranked.map(r => r.rank)).toEqual([1, 2]);

      wants = [...wants, bravo];
      expect(titles(await service.getSnapshot())).toEqual([
        'Alpha',
        'Bravo',
        'Charlie',
      ]);
    });

    it('counts positions among records that exist and keeps absent ones stored', async () => {
      const bravo = wants[1];
      wants = wants.filter(w => w !== bravo);
      const moved = await service.applyChange({
        action: 'move',
        key: 'master:300',
        position: 1,
      });
      expect(titles(moved)).toEqual(['Charlie', 'Alpha']);
      expect(await stored()).toContain('master:200');

      wants = [...wants, bravo];
      expect(titles(await service.getSnapshot())).toEqual([
        'Charlie',
        'Alpha',
        'Bravo',
      ]);
    });

    it('keeps the rank when one of several pressings leaves', async () => {
      wants = [...wants, want(5, 100, 'Alpha')];
      expect((await service.getSnapshot()).ranked[0].wantIds).toEqual([1, 5]);
      wants = wants.filter(w => w.id !== 1);
      const { ranked } = await service.getSnapshot();
      expect(ranked[0].title).toBe('Alpha');
      expect(ranked[0].wantIds).toEqual([5]);
    });

    it('starts a new want unranked', async () => {
      wants = [...wants, want(6, 600, 'Echo')];
      const { ranked, unranked } = await service.getSnapshot();
      expect(ranked).toHaveLength(3);
      expect(unranked.map(r => r.title)).toContain('Echo');
    });

    it('moves a want without a master to its master when it gains one', async () => {
      wants = [want(7, 0, 'Foxtrot')];
      await service.applyChange({
        action: 'move',
        key: 'release:70',
        position: 1,
      });
      wants = [want(7, 700, 'Foxtrot')];
      const { ranked } = await service.getSnapshot();
      expect(ranked.map(r => r.key)).toEqual(['master:700']);
    });
  });

  it('keeps a rank that came through an alias after the original want leaves', async () => {
    wants = [want(7, 0, 'Foxtrot')];
    await service.applyChange({
      action: 'move',
      key: 'release:70',
      position: 1,
    });

    // Gains a master, and a second pressing joins it
    wants = [want(7, 700, 'Foxtrot'), want(8, 700, 'Foxtrot')];
    await service.getSnapshot();
    expect(await stored()).toEqual(['master:700']);

    wants = [want(8, 700, 'Foxtrot')];
    expect((await service.getSnapshot()).ranked[0].key).toBe('master:700');
  });

  it('keeps stored keys of absent records when rewriting aliases', async () => {
    wants = [want(7, 700, 'Foxtrot')];
    await storage.writeJSON(WISHLIST_PRIORITIES_FILE, {
      schemaVersion: 1,
      orderedKeys: ['master:1', 'release:70', 'master:700'],
    });
    await service.getSnapshot();
    expect(await stored()).toEqual(['master:1', 'master:700']);
  });

  it('does not rewrite the file when nothing changed', async () => {
    await service.applyChange({
      action: 'move',
      key: 'master:100',
      position: 1,
    });
    const write = jest.spyOn(storage, 'writeJSONWithBackup');
    await service.getSnapshot();
    expect(write).not.toHaveBeenCalled();
  });

  describe('local wants', () => {
    it('ranks a local want by its own key', async () => {
      localWants = [local('a', 'Golf')];
      const snapshot = await service.applyChange({
        action: 'move',
        key: 'local:a',
        position: 1,
      });
      expect(snapshot.ranked[0]).toMatchObject({
        key: 'local:a',
        monitored: true,
        localIds: ['a'],
        wantIds: [],
      });
    });

    it('never merges on a guessed master id', async () => {
      localWants = [local('a', 'Golf', { masterId: 100 })];
      const { unranked } = await service.getSnapshot();
      expect(unranked.map(r => r.key)).toEqual(
        expect.arrayContaining(['local:a', 'master:100'])
      );
    });

    it('joins a Discogs want with the same name, which takes over the rank', async () => {
      localWants = [local('a', 'Alpha ')];
      const { unranked } = await service.getSnapshot();
      expect(unranked.map(r => r.key)).not.toContain('local:a');
      expect(unranked.find(r => r.key === 'master:100')).toMatchObject({
        monitored: true,
        localIds: ['a'],
      });
    });

    it('keeps the higher position when both were ranked', async () => {
      localWants = [local('a', 'Hotel')];
      await service.applyChange({
        action: 'move',
        key: 'local:a',
        position: 1,
      });
      await service.applyChange({
        action: 'move',
        key: 'master:200',
        position: 2,
      });
      await service.applyChange({
        action: 'move',
        key: 'master:100',
        position: 3,
      });

      // Now wanted on Discogs under the same name
      wants = [...wants, want(9, 900, 'Hotel')];
      await storage.writeJSON(WISHLIST_PRIORITIES_FILE, {
        schemaVersion: 1,
        orderedKeys: ['local:a', 'master:200', 'master:900', 'master:100'],
      });
      const { ranked } = await service.getSnapshot();
      expect(ranked.map(r => r.key)).toEqual([
        'master:900',
        'master:200',
        'master:100',
      ]);

      // Moving it clears both stored keys
      await service.applyChange({
        action: 'move',
        key: 'master:900',
        position: 3,
      });
      expect(await stored()).toEqual([
        'master:200',
        'master:100',
        'master:900',
      ]);
    });
  });

  describe('a damaged file', () => {
    it.each([
      ['not JSON', '{ nope'],
      ['the wrong shape', '{"schemaVersion":1,"orderedKeys":"x"}'],
    ])('refuses to read or save over %s', async (_label, content) => {
      await fs.mkdir(path.join(dir, 'wishlist'), { recursive: true });
      const file = path.join(dir, WISHLIST_PRIORITIES_FILE);
      await fs.writeFile(file, content);

      await expect(service.getSnapshot()).rejects.toMatchObject({
        code: 'corrupt',
      });
      await expect(
        service.applyChange({ action: 'move', key: 'master:100', position: 1 })
      ).rejects.toMatchObject({ code: 'corrupt' });
      expect(await fs.readFile(file, 'utf-8')).toBe(content);
    });

    it('keeps working after a failed change', async () => {
      await expect(
        service.applyChange({ action: 'move', key: 'nope', position: 1 })
      ).rejects.toBeDefined();
      const snapshot = await service.applyChange({
        action: 'move',
        key: 'master:100',
        position: 1,
      });
      expect(titles(snapshot)).toEqual(['Alpha']);
    });
  });
});
