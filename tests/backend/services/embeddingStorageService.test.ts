import { EmbeddingStorageService } from '../../../src/backend/services/embeddingStorageService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  RecordEmbeddingEntry,
  RecordEmbeddingStore,
} from '../../../src/shared/types';
import { createMockRecordEmbeddingEntry } from '../../fixtures/embeddingFixtures';

describe('EmbeddingStorageService', () => {
  let service: EmbeddingStorageService;
  let mockReadJSON: jest.Mock;
  let mockWriteJSONWithBackup: jest.Mock;

  const makeStore = (
    entries: RecordEmbeddingEntry[] = []
  ): RecordEmbeddingStore => ({
    schemaVersion: 1,
    embeddings: Object.fromEntries(
      entries.map(e => [String(e.discogsReleaseId), e])
    ),
  });

  beforeEach(() => {
    mockReadJSON = jest.fn().mockResolvedValue(null);
    mockWriteJSONWithBackup = jest.fn().mockResolvedValue(undefined);
    const mockStorage = {
      readJSON: mockReadJSON,
      writeJSONWithBackup: mockWriteJSONWithBackup,
    } as unknown as FileStorage;
    service = new EmbeddingStorageService(mockStorage);
  });

  describe('getStore / empty initialization', () => {
    it('should return a default empty store when no file exists', async () => {
      // Arrange — mockReadJSON returns null (default from beforeEach)

      // Act
      const store = await service.getStore();

      // Assert
      expect(store.schemaVersion).toBe(1);
      expect(store.embeddings).toEqual({});
    });

    it('should return the stored data when file exists', async () => {
      // Arrange
      const entry = createMockRecordEmbeddingEntry();
      const storedStore = makeStore([entry]);
      mockReadJSON.mockResolvedValueOnce(storedStore);

      // Act
      const store = await service.getStore();

      // Assert
      expect(store.embeddings['12345']).toBeDefined();
      expect(store.embeddings['12345'].discogsReleaseId).toBe(12345);
    });
  });

  describe('getEmbedding', () => {
    it('should return the entry for an existing release ID', async () => {
      // Arrange
      const entry = createMockRecordEmbeddingEntry({ discogsReleaseId: 99 });
      mockReadJSON.mockResolvedValueOnce(makeStore([entry]));

      // Act
      const result = await service.getEmbedding(99);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.discogsReleaseId).toBe(99);
      expect(result!.embedding).toBe(entry.embedding);
    });

    it('should return null for a missing release ID', async () => {
      // Arrange
      mockReadJSON.mockResolvedValueOnce(makeStore([]));

      // Act
      const result = await service.getEmbedding(9999);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when store is empty', async () => {
      // Arrange — mockReadJSON returns null by default (empty store path)

      // Act
      const result = await service.getEmbedding(1);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('setEmbedding', () => {
    it('should store an entry and call writeJSONWithBackup', async () => {
      // Arrange
      mockReadJSON.mockResolvedValueOnce(makeStore([]));
      const entry = createMockRecordEmbeddingEntry({ discogsReleaseId: 42 });

      // Act
      await service.setEmbedding(entry);

      // Assert
      expect(mockWriteJSONWithBackup).toHaveBeenCalledTimes(1);
      const [, writtenStore] = mockWriteJSONWithBackup.mock.calls[0] as [
        string,
        RecordEmbeddingStore,
      ];
      expect(writtenStore.embeddings['42']).toBeDefined();
      expect(writtenStore.embeddings['42'].discogsReleaseId).toBe(42);
    });

    it('should overwrite an existing entry for the same release ID', async () => {
      // Arrange
      const oldEntry = createMockRecordEmbeddingEntry({
        discogsReleaseId: 42,
        textProfile: 'old profile',
      });
      mockReadJSON.mockResolvedValueOnce(makeStore([oldEntry]));
      const newEntry = createMockRecordEmbeddingEntry({
        discogsReleaseId: 42,
        textProfile: 'new profile',
      });

      // Act
      await service.setEmbedding(newEntry);

      // Assert
      const [, writtenStore] = mockWriteJSONWithBackup.mock.calls[0] as [
        string,
        RecordEmbeddingStore,
      ];
      expect(writtenStore.embeddings['42'].textProfile).toBe('new profile');
    });

    it('should write to the correct data file path', async () => {
      // Arrange
      mockReadJSON.mockResolvedValueOnce(makeStore([]));
      const entry = createMockRecordEmbeddingEntry();

      // Act
      await service.setEmbedding(entry);

      // Assert
      const [filePath] = mockWriteJSONWithBackup.mock.calls[0] as [
        string,
        RecordEmbeddingStore,
      ];
      expect(filePath).toBe('embeddings/record-embeddings.json');
    });
  });

  describe('bulkSetEmbeddings', () => {
    it('should store multiple entries in a single write call', async () => {
      // Arrange
      mockReadJSON.mockResolvedValueOnce(makeStore([]));
      const entries = [
        createMockRecordEmbeddingEntry({ discogsReleaseId: 1 }),
        createMockRecordEmbeddingEntry({ discogsReleaseId: 2 }),
        createMockRecordEmbeddingEntry({ discogsReleaseId: 3 }),
      ];

      // Act
      await service.bulkSetEmbeddings(entries);

      // Assert
      expect(mockWriteJSONWithBackup).toHaveBeenCalledTimes(1);
      const [, writtenStore] = mockWriteJSONWithBackup.mock.calls[0] as [
        string,
        RecordEmbeddingStore,
      ];
      expect(Object.keys(writtenStore.embeddings)).toHaveLength(3);
      expect(writtenStore.embeddings['1']).toBeDefined();
      expect(writtenStore.embeddings['2']).toBeDefined();
      expect(writtenStore.embeddings['3']).toBeDefined();
    });

    it('should handle an empty bulk set with a single write call', async () => {
      // Arrange
      mockReadJSON.mockResolvedValueOnce(makeStore([]));

      // Act
      await service.bulkSetEmbeddings([]);

      // Assert — always persists even with empty entries
      expect(mockWriteJSONWithBackup).toHaveBeenCalledTimes(1);
      const [, writtenStore] = mockWriteJSONWithBackup.mock.calls[0] as [
        string,
        RecordEmbeddingStore,
      ];
      expect(Object.keys(writtenStore.embeddings)).toHaveLength(0);
    });
  });

  describe('deleteEmbedding', () => {
    it('should remove an existing entry and write the updated store', async () => {
      // Arrange
      const entry = createMockRecordEmbeddingEntry({ discogsReleaseId: 55 });
      mockReadJSON.mockResolvedValueOnce(makeStore([entry]));

      // Act
      await service.deleteEmbedding(55);

      // Assert
      expect(mockWriteJSONWithBackup).toHaveBeenCalledTimes(1);
      const [, writtenStore] = mockWriteJSONWithBackup.mock.calls[0] as [
        string,
        RecordEmbeddingStore,
      ];
      expect(writtenStore.embeddings['55']).toBeUndefined();
    });

    it('should not call writeJSONWithBackup when entry does not exist', async () => {
      // Arrange
      mockReadJSON.mockResolvedValueOnce(makeStore([]));

      // Act
      await service.deleteEmbedding(9999);

      // Assert
      expect(mockWriteJSONWithBackup).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return zeros when store is empty', async () => {
      // Arrange
      mockReadJSON.mockResolvedValueOnce(makeStore([]));

      // Act
      const stats = await service.getStats();

      // Assert
      expect(stats.totalRecords).toBe(0);
      expect(stats.embeddedRecords).toBe(0);
      expect(stats.staleRecords).toBe(0);
      expect(stats.lastRebuildAt).toBeNull();
      expect(stats.averageEmbeddingAge).toBeNull();
      expect(stats.isRebuilding).toBe(false);
    });

    it('should count total records and embedded records correctly', async () => {
      // Arrange
      const entries = [
        createMockRecordEmbeddingEntry({
          discogsReleaseId: 1,
          lastEnrichedAt: Date.now() - 1000,
        }),
        createMockRecordEmbeddingEntry({
          discogsReleaseId: 2,
          lastEnrichedAt: Date.now() - 2000,
        }),
      ];
      mockReadJSON.mockResolvedValueOnce(makeStore(entries));

      // Act
      const stats = await service.getStats();

      // Assert
      expect(stats.totalRecords).toBe(2);
      expect(stats.embeddedRecords).toBe(2);
    });

    it('should identify stale records (older than 30 days)', async () => {
      // Arrange
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      const entries = [
        createMockRecordEmbeddingEntry({
          discogsReleaseId: 1,
          lastEnrichedAt: thirtyOneDaysAgo,
        }),
        createMockRecordEmbeddingEntry({
          discogsReleaseId: 2,
          lastEnrichedAt: Date.now() - 1000,
        }),
      ];
      mockReadJSON.mockResolvedValueOnce(makeStore(entries));

      // Act
      const stats = await service.getStats();

      // Assert
      expect(stats.staleRecords).toBe(1);
    });

    it('should set lastRebuildAt to the most recent enrichment timestamp', async () => {
      // Arrange
      const olderTs = Date.now() - 5000;
      const newerTs = Date.now() - 1000;
      const entries = [
        createMockRecordEmbeddingEntry({
          discogsReleaseId: 1,
          lastEnrichedAt: olderTs,
        }),
        createMockRecordEmbeddingEntry({
          discogsReleaseId: 2,
          lastEnrichedAt: newerTs,
        }),
      ];
      mockReadJSON.mockResolvedValueOnce(makeStore(entries));

      // Act
      const stats = await service.getStats();

      // Assert
      expect(stats.lastRebuildAt).toBe(newerTs);
    });

    it('should compute a positive averageEmbeddingAge when entries exist', async () => {
      // Arrange
      const entry = createMockRecordEmbeddingEntry({
        lastEnrichedAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
      });
      mockReadJSON.mockResolvedValueOnce(makeStore([entry]));

      // Act
      const stats = await service.getStats();

      // Assert
      expect(stats.averageEmbeddingAge).not.toBeNull();
      expect(stats.averageEmbeddingAge!).toBeGreaterThan(0);
    });
  });

  describe('getAllEmbeddings', () => {
    it('should return all entries as an array', async () => {
      // Arrange
      const entries = [
        createMockRecordEmbeddingEntry({ discogsReleaseId: 1 }),
        createMockRecordEmbeddingEntry({ discogsReleaseId: 2 }),
      ];
      mockReadJSON.mockResolvedValueOnce(makeStore(entries));

      // Act
      const result = await service.getAllEmbeddings();

      // Assert
      expect(result).toHaveLength(2);
      const ids = result.map(e => e.discogsReleaseId).sort((a, b) => a - b);
      expect(ids).toEqual([1, 2]);
    });

    it('should return an empty array when store is empty', async () => {
      // Arrange
      mockReadJSON.mockResolvedValueOnce(makeStore([]));

      // Act
      const result = await service.getAllEmbeddings();

      // Assert
      expect(result).toEqual([]);
    });
  });
});
