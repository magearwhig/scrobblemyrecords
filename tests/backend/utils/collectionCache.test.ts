import {
  getAllCachedCollectionItems,
  readCollectionCacheSnapshot,
} from '../../../src/backend/utils/collectionCache';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { CollectionItem } from '../../../src/shared/types';

jest.mock('../../../src/backend/utils/fileStorage');

const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

function createCollectionItem(id: number): CollectionItem {
  return {
    id,
    date_added: '2024-01-15T10:30:00Z',
    rating: 0,
    release: {
      id,
      title: `Album ${id}`,
      artist: 'Test Artist',
      year: 2020,
      format: ['LP'],
      label: ['Test Records'],
      cover_image: `https://example.com/cover-${id}.jpg`,
    },
  } as CollectionItem;
}

function createPage(items: CollectionItem[]) {
  return { data: items, timestamp: Date.now() };
}

describe('getAllCachedCollectionItems', () => {
  let mockFileStorage: jest.Mocked<FileStorage>;

  beforeEach(() => {
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);
  });

  describe('empty cache', () => {
    it('returns an empty array when no pages are cached', async () => {
      // Arrange
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);

      // Act
      const result = await getAllCachedCollectionItems(
        'testuser',
        mockFileStorage
      );

      // Assert
      expect(result).toEqual([]);
      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(1);
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith(
        'collections/testuser-page-1.json'
      );
    });

    it('returns an empty array when page exists but has no data property', async () => {
      // Arrange
      mockFileStorage.readJSON = jest.fn().mockResolvedValue({});

      // Act
      const result = await getAllCachedCollectionItems(
        'testuser',
        mockFileStorage
      );

      // Assert
      expect(result).toEqual([]);
    });

    it('returns an empty array when page data is empty', async () => {
      // Arrange
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(createPage([]));

      // Act
      const result = await getAllCachedCollectionItems(
        'testuser',
        mockFileStorage
      );

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('single page', () => {
    it('returns all items from a single page', async () => {
      // Arrange
      const items = [createCollectionItem(1), createCollectionItem(2)];
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(createPage(items))
        .mockResolvedValueOnce(null);

      // Act
      const result = await getAllCachedCollectionItems(
        'testuser',
        mockFileStorage
      );

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    it('reads the correct cache key format', async () => {
      // Arrange
      const items = [createCollectionItem(1)];
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(createPage(items))
        .mockResolvedValueOnce(null);

      // Act
      await getAllCachedCollectionItems('testuser', mockFileStorage);

      // Assert
      expect(mockFileStorage.readJSON).toHaveBeenNthCalledWith(
        1,
        'collections/testuser-page-1.json'
      );
      expect(mockFileStorage.readJSON).toHaveBeenNthCalledWith(
        2,
        'collections/testuser-page-2.json'
      );
    });
  });

  describe('multiple pages', () => {
    it('concatenates items across multiple pages', async () => {
      // Arrange
      const page1Items = [createCollectionItem(1), createCollectionItem(2)];
      const page2Items = [createCollectionItem(3), createCollectionItem(4)];
      const page3Items = [createCollectionItem(5)];
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(createPage(page1Items))
        .mockResolvedValueOnce(createPage(page2Items))
        .mockResolvedValueOnce(createPage(page3Items))
        .mockResolvedValueOnce(null);

      // Act
      const result = await getAllCachedCollectionItems(
        'testuser',
        mockFileStorage
      );

      // Assert
      expect(result).toHaveLength(5);
      expect(result.map(i => i.id)).toEqual([1, 2, 3, 4, 5]);
    });

    it('stops reading when a page returns null', async () => {
      // Arrange
      const page1Items = [createCollectionItem(1)];
      const page2Items = [createCollectionItem(2)];
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(createPage(page1Items))
        .mockResolvedValueOnce(createPage(page2Items))
        .mockResolvedValueOnce(null);

      // Act
      const result = await getAllCachedCollectionItems(
        'testuser',
        mockFileStorage
      );

      // Assert
      expect(result).toHaveLength(2);
      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(3);
    });

    it('stops reading when a page has empty data array', async () => {
      // Arrange
      const page1Items = [createCollectionItem(1)];
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(createPage(page1Items))
        .mockResolvedValueOnce(createPage([]));

      // Act
      const result = await getAllCachedCollectionItems(
        'testuser',
        mockFileStorage
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(2);
    });

    it('reads pages with correct sequential keys', async () => {
      // Arrange
      const makeItems = (id: number) => [createCollectionItem(id)];
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(createPage(makeItems(1)))
        .mockResolvedValueOnce(createPage(makeItems(2)))
        .mockResolvedValueOnce(createPage(makeItems(3)))
        .mockResolvedValueOnce(null);

      // Act
      await getAllCachedCollectionItems('testuser', mockFileStorage);

      // Assert
      expect(mockFileStorage.readJSON).toHaveBeenNthCalledWith(
        1,
        'collections/testuser-page-1.json'
      );
      expect(mockFileStorage.readJSON).toHaveBeenNthCalledWith(
        2,
        'collections/testuser-page-2.json'
      );
      expect(mockFileStorage.readJSON).toHaveBeenNthCalledWith(
        3,
        'collections/testuser-page-3.json'
      );
      expect(mockFileStorage.readJSON).toHaveBeenNthCalledWith(
        4,
        'collections/testuser-page-4.json'
      );
    });
  });

  describe('username handling', () => {
    it('uses the correct username in cache keys', async () => {
      // Arrange
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);

      // Act
      await getAllCachedCollectionItems('djspinmaster', mockFileStorage);

      // Assert
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith(
        'collections/djspinmaster-page-1.json'
      );
    });

    it('works with different usernames without collision', async () => {
      // Arrange
      const userAItems = [createCollectionItem(10)];
      const userBItems = [createCollectionItem(20)];

      const mockA = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
      mockA.readJSON = jest
        .fn()
        .mockResolvedValueOnce(createPage(userAItems))
        .mockResolvedValueOnce(null);

      const mockB = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
      mockB.readJSON = jest
        .fn()
        .mockResolvedValueOnce(createPage(userBItems))
        .mockResolvedValueOnce(null);

      // Act
      const [resultA, resultB] = await Promise.all([
        getAllCachedCollectionItems('userA', mockA),
        getAllCachedCollectionItems('userB', mockB),
      ]);

      // Assert
      expect(resultA[0].id).toBe(10);
      expect(resultB[0].id).toBe(20);
      expect(mockA.readJSON).toHaveBeenCalledWith(
        'collections/userA-page-1.json'
      );
      expect(mockB.readJSON).toHaveBeenCalledWith(
        'collections/userB-page-1.json'
      );
    });
  });
});

describe('readCollectionCacheSnapshot', () => {
  let mockFileStorage: jest.Mocked<FileStorage>;
  let files: Record<string, unknown>;

  const page = (
    ids: number[],
    timestamp: number,
    pagination: { pages: number; items: number } | undefined
  ) => ({
    success: true,
    data: ids.map(createCollectionItem),
    ...(pagination ? { pagination } : {}),
    timestamp,
  });

  beforeEach(() => {
    files = {};
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockFileStorage.readJSON = jest.fn(
      async (path: string) => (files[path] ?? null) as never
    );
  });

  it('reports a complete cache with the oldest and newest page times', async () => {
    // Arrange
    const pagination = { pages: 2, items: 3 };
    files['collections/u-page-1.json'] = page(
      [1, 2],
      Date.parse('2026-10-21T04:00:16.349Z'),
      pagination
    );
    files['collections/u-page-2.json'] = page(
      [3],
      Date.parse('2026-10-21T03:56:40.000Z'),
      pagination
    );

    // Act
    const { items, info } = await readCollectionCacheSnapshot(
      'u',
      mockFileStorage
    );

    // Assert
    expect(items.map(i => i.id)).toEqual([1, 2, 3]);
    expect(info).toEqual({
      status: 'complete',
      pagesExpected: 2,
      pagesRead: 2,
      itemsExpected: 3,
      itemsRead: 3,
      oldestPageAt: '2026-10-21T03:56:40Z',
      newestPageAt: '2026-10-21T04:00:16Z',
    });
  });

  it('reports partial and stops at a missing middle page', async () => {
    const pagination = { pages: 3, items: 3 };
    files['collections/u-page-1.json'] = page([1], 1000, pagination);
    files['collections/u-page-3.json'] = page([3], 3000, pagination);

    const { items, info } = await readCollectionCacheSnapshot(
      'u',
      mockFileStorage
    );

    expect(items.map(i => i.id)).toEqual([1]);
    expect(info).toMatchObject({
      status: 'partial',
      pagesExpected: 3,
      pagesRead: 1,
      itemsRead: 1,
    });
  });

  it('reports partial when the item count differs', async () => {
    files['collections/u-page-1.json'] = page([1, 2], 1000, {
      pages: 1,
      items: 4,
    });

    const { info } = await readCollectionCacheSnapshot('u', mockFileStorage);

    expect(info.status).toBe('partial');
  });

  it('reports partial when a page with data has no pagination', async () => {
    files['collections/u-page-1.json'] = page([1], 1000, {
      pages: 2,
      items: 2,
    });
    files['collections/u-page-2.json'] = page([2], 1000, undefined);

    const { info } = await readCollectionCacheSnapshot('u', mockFileStorage);

    expect(info.status).toBe('partial');
    expect(info.pagesRead).toBe(2);
  });

  it('reports missing when there is no page 1', async () => {
    const { items, info } = await readCollectionCacheSnapshot(
      'u',
      mockFileStorage
    );

    expect(items).toEqual([]);
    expect(info).toEqual({
      status: 'missing',
      pagesExpected: null,
      pagesRead: 0,
      itemsExpected: null,
      itemsRead: 0,
      oldestPageAt: null,
      newestPageAt: null,
    });
  });

  it('reports an empty collection as complete', async () => {
    files['collections/u-page-1.json'] = page([], 1000, { pages: 1, items: 0 });

    const { info } = await readCollectionCacheSnapshot('u', mockFileStorage);

    expect(info).toEqual({
      status: 'complete',
      pagesExpected: 1,
      pagesRead: 1,
      itemsExpected: 0,
      itemsRead: 0,
      oldestPageAt: '1970-01-01T00:00:01Z',
      newestPageAt: '1970-01-01T00:00:01Z',
    });
  });

  it('reports partial when page 1 is empty but items are expected', async () => {
    files['collections/u-page-1.json'] = page([], 1000, { pages: 2, items: 9 });

    const { info } = await readCollectionCacheSnapshot('u', mockFileStorage);

    expect(info.status).toBe('partial');
    expect(info.pagesRead).toBe(1);
  });
});
