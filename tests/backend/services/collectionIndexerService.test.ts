import {
  CollectionIndexerService,
  RecordInput,
} from '../../../src/backend/services/collectionIndexerService';
import { EmbeddingStorageService } from '../../../src/backend/services/embeddingStorageService';
import { OllamaEmbedderService } from '../../../src/backend/services/ollamaEmbedderService';
import {
  createMockEmbedding,
  createMockRelease,
} from '../../fixtures/embeddingFixtures';

jest.mock('../../../src/backend/services/ollamaEmbedderService');
jest.mock('../../../src/backend/services/embeddingStorageService');

const MockedOllamaEmbedderService = OllamaEmbedderService as jest.MockedClass<
  typeof OllamaEmbedderService
>;
const MockedEmbeddingStorageService =
  EmbeddingStorageService as jest.MockedClass<typeof EmbeddingStorageService>;

describe('CollectionIndexerService', () => {
  let service: CollectionIndexerService;
  let mockOllama: jest.Mocked<OllamaEmbedderService>;
  let mockEmbeddingStorage: jest.Mocked<EmbeddingStorageService>;

  const mockVec = createMockEmbedding(768);

  function makeRecords(
    count: number,
    textProfile = 'Artist: Test\nAlbum: Test Album'
  ): RecordInput[] {
    return Array.from({ length: count }, (_, i) => ({
      release: createMockRelease({
        id: 100 + i,
        artist: `Artist ${i}`,
        title: `Album ${i}`,
      }),
      textProfile,
    }));
  }

  beforeEach(() => {
    mockOllama = new MockedOllamaEmbedderService(
      {} as never
    ) as jest.Mocked<OllamaEmbedderService>;
    mockEmbeddingStorage = new MockedEmbeddingStorageService(
      {} as never
    ) as jest.Mocked<EmbeddingStorageService>;

    mockOllama.embed = jest.fn().mockResolvedValue(mockVec);
    // setEmbedding is used per record in rebuildAll; bulkSetEmbeddings is optional
    mockEmbeddingStorage.setEmbedding = jest.fn().mockResolvedValue(undefined);
    mockEmbeddingStorage.bulkSetEmbeddings = jest
      .fn()
      .mockResolvedValue(undefined);
    mockEmbeddingStorage.getEmbedding = jest.fn().mockResolvedValue(null);

    service = new CollectionIndexerService(mockOllama, mockEmbeddingStorage);
  });

  describe('rebuildAll', () => {
    it('should embed and store all records returning correct counts', async () => {
      // Arrange
      const records = makeRecords(3);

      // Act
      const result = await service.rebuildAll(records);

      // Assert
      expect(result.embedded).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should call embed for each record in the collection', async () => {
      // Arrange
      const records = makeRecords(2);

      // Act
      await service.rebuildAll(records);

      // Assert — embed was called for each non-skipped record
      expect(mockOllama.embed).toHaveBeenCalledTimes(2);
    });

    it('should report progress via the onProgress callback', async () => {
      // Arrange
      const records = makeRecords(2);
      const progressCalls: Array<{ current: number; total: number }> = [];

      // Act
      await service.rebuildAll(records, p => {
        progressCalls.push({ current: p.current, total: p.total });
      });

      // Assert — at minimum the final progress ping is always called
      expect(progressCalls.length).toBeGreaterThan(0);
      const lastCall = progressCalls[progressCalls.length - 1];
      expect(lastCall.total).toBe(2);
    });

    it('should reject a concurrent rebuild attempt with an error', async () => {
      // Arrange — trigger a rebuild that won't finish immediately
      let resolveEmbed!: (v: number[]) => void;
      const blockingPromise = new Promise<number[]>(res => {
        resolveEmbed = res;
      });
      mockOllama.embed.mockReturnValueOnce(blockingPromise);

      const records = makeRecords(1);

      // Start first rebuild (won't complete yet)
      const firstRebuild = service.rebuildAll(records);

      // Act — try a second concurrent rebuild
      await expect(service.rebuildAll(records)).rejects.toThrow(
        'A collection rebuild is already in progress'
      );

      // Cleanup: resolve the blocking promise so first rebuild finishes
      resolveEmbed(mockVec);
      await firstRebuild;
    });

    it('should skip records with empty text profiles', async () => {
      // Arrange
      const records: RecordInput[] = [
        {
          release: createMockRelease({ id: 1 }),
          textProfile: '   ', // whitespace only — should be skipped
        },
        {
          release: createMockRelease({ id: 2 }),
          textProfile: 'Artist: Real Artist\nAlbum: Real Album',
        },
      ];

      // Act
      const result = await service.rebuildAll(records);

      // Assert
      expect(result.skipped).toBe(1);
      expect(result.embedded).toBe(1);
    });

    it('should skip records where Ollama returns a zero vector', async () => {
      // Arrange
      const zeroVec = new Array(768).fill(0);
      mockOllama.embed.mockResolvedValue(zeroVec);
      const records = makeRecords(2);

      // Act
      const result = await service.rebuildAll(records);

      // Assert
      expect(result.skipped).toBe(2);
      expect(result.embedded).toBe(0);
    });

    it('should count individual record failures without aborting the batch', async () => {
      // Arrange — first record fails, second succeeds
      mockOllama.embed
        .mockRejectedValueOnce(new Error('Ollama offline'))
        .mockResolvedValueOnce(mockVec);
      const records = makeRecords(2);

      // Act
      const result = await service.rebuildAll(records);

      // Assert
      expect(result.failed).toBe(1);
      expect(result.embedded).toBe(1);
    });

    it('should handle an empty collection gracefully', async () => {
      // Act
      const result = await service.rebuildAll([]);

      // Assert
      expect(result.embedded).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should set isRebuilding to false after completion', async () => {
      // Arrange
      const records = makeRecords(1);

      // Act
      await service.rebuildAll(records);

      // Assert
      expect(service.isRebuilding()).toBe(false);
    });

    it('should set isRebuilding to false even when records fail', async () => {
      // Arrange
      mockOllama.embed.mockRejectedValue(new Error('Ollama down'));
      const records = makeRecords(2);

      // Act
      await service.rebuildAll(records);

      // Assert
      expect(service.isRebuilding()).toBe(false);
    });

    it('should process cancellation between records', async () => {
      // Arrange — first embed blocks so we can request cancellation
      let resolveFirst!: (v: number[]) => void;
      const firstEmbedPromise = new Promise<number[]>(res => {
        resolveFirst = res;
      });

      mockOllama.embed
        .mockReturnValueOnce(firstEmbedPromise)
        .mockResolvedValue(mockVec);

      const records = makeRecords(4);
      const rebuildPromise = service.rebuildAll(records);

      // Request cancellation while rebuild is running
      service.cancelRebuild();

      // Let the first embed complete so the worker can check the cancel flag
      resolveFirst(mockVec);

      const result = await rebuildPromise;

      // Assert — with concurrency=2 workers and cancellation set, fewer than 4 records processed
      expect(result.embedded + result.skipped + result.failed).toBeLessThan(4);
    });
  });

  describe('indexSingle', () => {
    it('should embed and store a single record', async () => {
      // Arrange
      const textProfile = 'Artist: Pink Floyd\nAlbum: The Wall';

      // Act
      await service.indexSingle(123, textProfile);

      // Assert
      expect(mockOllama.embed).toHaveBeenCalledWith(textProfile);
      expect(mockEmbeddingStorage.setEmbedding).toHaveBeenCalledTimes(1);
      const [entry] = mockEmbeddingStorage.setEmbedding.mock.calls[0];
      expect(entry.discogsReleaseId).toBe(123);
    });

    it('should throw for an empty text profile', async () => {
      await expect(service.indexSingle(42, '')).rejects.toThrow(
        'Cannot index release 42: text profile is empty'
      );
    });

    it('should throw for a whitespace-only text profile', async () => {
      await expect(service.indexSingle(42, '   ')).rejects.toThrow(
        'Cannot index release 42: text profile is empty'
      );
    });

    it('should throw when Ollama returns a zero vector', async () => {
      // Arrange
      mockOllama.embed.mockResolvedValue(new Array(768).fill(0));

      // Act & Assert
      await expect(
        service.indexSingle(42, 'Some profile text')
      ).rejects.toThrow('Ollama returned a zero vector for release 42');
    });

    it('should store the correct embeddingModel', async () => {
      // Arrange
      const textProfile = 'Artist: Test\nAlbum: Test';

      // Act
      await service.indexSingle(99, textProfile, 'custom-model');

      // Assert
      const [entry] = mockEmbeddingStorage.setEmbedding.mock.calls[0];
      expect(entry.embeddingModel).toBe('custom-model');
    });

    it('should store the text profile in the entry', async () => {
      // Arrange
      const textProfile = 'Artist: Test\nAlbum: Test';

      // Act
      await service.indexSingle(77, textProfile);

      // Assert
      const [entry] = mockEmbeddingStorage.setEmbedding.mock.calls[0];
      expect(entry.textProfile).toBe(textProfile);
    });
  });

  describe('indexIncremental', () => {
    it('should skip records whose text profile is unchanged', async () => {
      // Arrange
      const textProfile = 'Artist: Test\nAlbum: Test';
      const existingEntry = {
        discogsReleaseId: 100,
        textProfile,
        embedding: 'abc',
        embeddingModel: 'nomic-embed-text',
        lastEnrichedAt: Date.now(),
      };
      mockEmbeddingStorage.getEmbedding.mockResolvedValue(existingEntry);

      const records: RecordInput[] = [
        {
          release: createMockRelease({ id: 100 }),
          textProfile,
        },
      ];

      // Act
      const result = await service.indexIncremental(records);

      // Assert
      expect(result.skipped).toBe(1);
      expect(result.embedded).toBe(0);
      expect(mockOllama.embed).not.toHaveBeenCalled();
    });

    it('should embed records whose text profile has changed', async () => {
      // Arrange
      const oldProfile = 'Artist: Test\nAlbum: Old Album';
      const newProfile = 'Artist: Test\nAlbum: New Album';
      mockEmbeddingStorage.getEmbedding.mockResolvedValue({
        discogsReleaseId: 100,
        textProfile: oldProfile,
        embedding: 'abc',
        embeddingModel: 'nomic-embed-text',
        lastEnrichedAt: Date.now(),
      });

      const records: RecordInput[] = [
        {
          release: createMockRelease({ id: 100 }),
          textProfile: newProfile,
        },
      ];

      // Act
      const result = await service.indexIncremental(records);

      // Assert
      expect(result.embedded).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('should embed records that have no existing embedding', async () => {
      // Arrange
      mockEmbeddingStorage.getEmbedding.mockResolvedValue(null);
      const records = makeRecords(1);

      // Act
      const result = await service.indexIncremental(records);

      // Assert
      expect(result.embedded).toBe(1);
    });

    it('should skip records with empty text profiles', async () => {
      // Arrange
      const records: RecordInput[] = [
        {
          release: createMockRelease({ id: 1 }),
          textProfile: '',
        },
      ];

      // Act
      const result = await service.indexIncremental(records);

      // Assert
      expect(result.skipped).toBe(1);
      expect(result.embedded).toBe(0);
    });
  });

  describe('isRebuilding / cancelRebuild', () => {
    it('should return false when no rebuild is running', () => {
      expect(service.isRebuilding()).toBe(false);
    });

    it('cancelRebuild should be a no-op when no rebuild is running', () => {
      expect(() => service.cancelRebuild()).not.toThrow();
    });
  });
});
