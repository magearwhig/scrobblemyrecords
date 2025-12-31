import {
  OllamaService,
  DEFAULT_OLLAMA_SETTINGS,
  OllamaSettings,
} from '../../src/backend/services/ollamaService';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('OllamaService', () => {
  let service: OllamaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OllamaService();
  });

  describe('DEFAULT_OLLAMA_SETTINGS', () => {
    it('should have sensible defaults', () => {
      // Assert
      expect(DEFAULT_OLLAMA_SETTINGS.enabled).toBe(false);
      expect(DEFAULT_OLLAMA_SETTINGS.baseUrl).toBe('http://localhost:11434');
      expect(DEFAULT_OLLAMA_SETTINGS.model).toBe('mistral');
      expect(DEFAULT_OLLAMA_SETTINGS.timeout).toBe(60000);
    });
  });

  describe('constructor', () => {
    it('should use default settings when none provided', () => {
      // Act
      const service = new OllamaService();

      // Assert
      expect(service.getSettings()).toEqual(DEFAULT_OLLAMA_SETTINGS);
    });

    it('should merge provided settings with defaults', () => {
      // Arrange
      const customSettings: Partial<OllamaSettings> = {
        enabled: true,
        model: 'llama2',
      };

      // Act
      const service = new OllamaService(customSettings);

      // Assert
      const settings = service.getSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.model).toBe('llama2');
      expect(settings.baseUrl).toBe(DEFAULT_OLLAMA_SETTINGS.baseUrl);
    });
  });

  describe('updateSettings', () => {
    it('should update settings while preserving others', () => {
      // Arrange
      service = new OllamaService({ model: 'original' });

      // Act
      service.updateSettings({ timeout: 30000 });

      // Assert
      const settings = service.getSettings();
      expect(settings.model).toBe('original');
      expect(settings.timeout).toBe(30000);
    });
  });

  describe('getSettings', () => {
    it('should return a copy of settings', () => {
      // Act
      const settings1 = service.getSettings();
      const settings2 = service.getSettings();

      // Assert
      expect(settings1).toEqual(settings2);
      expect(settings1).not.toBe(settings2); // Different objects
    });
  });

  describe('checkConnection', () => {
    it('should return connected true when Ollama responds successfully', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      // Act
      const result = await service.checkConnection();

      // Assert
      expect(result.connected).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return connected false when Ollama returns error status', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      // Act
      const result = await service.checkConnection();

      // Assert
      expect(result.connected).toBe(false);
      expect(result.error).toContain('500');
    });

    it('should return helpful error when ECONNREFUSED', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      // Act
      const result = await service.checkConnection();

      // Assert
      expect(result.connected).toBe(false);
      expect(result.error).toContain('Ollama is not running');
      expect(result.error).toContain('ollama serve');
    });

    it('should return generic error for other failures', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act
      const result = await service.checkConnection();

      // Assert
      expect(result.connected).toBe(false);
      expect(result.error).toContain('Failed to connect');
    });
  });

  describe('getAvailableModels', () => {
    it('should return list of available models', async () => {
      // Arrange
      const mockModels = [
        { name: 'mistral:latest', size: 4000000000, modified_at: '2024-01-01' },
        { name: 'llama2:7b', size: 3500000000, modifiedAt: '2024-01-02' },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: mockModels }),
      });

      // Act
      const models = await service.getAvailableModels();

      // Assert
      expect(models).toHaveLength(2);
      expect(models[0].name).toBe('mistral:latest');
      expect(models[0].size).toBe(4000000000);
      expect(models[1].name).toBe('llama2:7b');
    });

    it('should return empty array when no models', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      // Act
      const models = await service.getAvailableModels();

      // Assert
      expect(models).toEqual([]);
    });

    it('should throw on error response', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      // Act & Assert
      await expect(service.getAvailableModels()).rejects.toThrow(
        'Failed to get models'
      );
    });
  });

  describe('generate', () => {
    it('should call generate endpoint with correct parameters', async () => {
      // Arrange
      const mockResponse = {
        model: 'mistral',
        response: 'Generated text',
        done: true,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      // Act
      const result = await service.generate('Test prompt');

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result.response).toBe('Generated text');
    });

    it('should pass context when provided', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: 'test', done: true }),
      });
      const context = [1, 2, 3];

      // Act
      await service.generate('Test', context);

      // Assert
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.context).toEqual(context);
    });

    it('should throw on error response', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Model not found',
      });

      // Act & Assert
      await expect(service.generate('Test')).rejects.toThrow(
        'Ollama error: Model not found'
      );
    });
  });

  describe('chat', () => {
    it('should call chat endpoint with messages', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: 'AI response' },
        }),
      });
      const messages = [
        { role: 'system' as const, content: 'You are helpful' },
        { role: 'user' as const, content: 'Hello' },
      ];

      // Act
      const result = await service.chat(messages);

      // Assert
      expect(result).toBe('AI response');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should return empty string when no content', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ message: {} }),
      });

      // Act
      const result = await service.chat([]);

      // Assert
      expect(result).toBe('');
    });

    it('should throw on error response', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Chat error',
      });

      // Act & Assert
      await expect(service.chat([])).rejects.toThrow('Ollama chat error');
    });

    it('should use JSON mode when jsonMode option is true', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: '{"test": "json"}' },
        }),
      });
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      // Act
      await service.chat(messages, { jsonMode: true });

      // Assert
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.format).toBe('json');
      expect(body.options.temperature).toBe(0.3); // Lower for JSON mode
    });

    it('should use default temperature 0.7 when not in JSON mode', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: 'response' },
        }),
      });
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      // Act
      await service.chat(messages);

      // Assert
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.format).toBeUndefined();
      expect(body.options.temperature).toBe(0.7);
    });

    it('should allow custom temperature override', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: 'response' },
        }),
      });
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      // Act
      await service.chat(messages, { temperature: 0.5 });

      // Assert
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.options.temperature).toBe(0.5);
    });

    it('should allow custom topP override', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: 'response' },
        }),
      });
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      // Act
      await service.chat(messages, { topP: 0.8 });

      // Assert
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.options.top_p).toBe(0.8);
    });
  });

  describe('pullModel', () => {
    it('should call pull endpoint', async () => {
      // Arrange
      mockFetch.mockResolvedValue({ ok: true });

      // Act
      await service.pullModel('llama2');

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/pull',
        expect.objectContaining({
          method: 'POST',
        })
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.name).toBe('llama2');
    });

    it('should throw on error response', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Model not available',
      });

      // Act & Assert
      await expect(service.pullModel('nonexistent')).rejects.toThrow(
        'Failed to pull model'
      );
    });
  });

  describe('isModelAvailable', () => {
    it('should return true when model is available', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'mistral:latest', size: 0, modified_at: '' }],
        }),
      });

      // Act
      const available = await service.isModelAvailable('mistral');

      // Assert
      expect(available).toBe(true);
    });

    it('should return true for exact match', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama2:7b', size: 0, modified_at: '' }],
        }),
      });

      // Act
      const available = await service.isModelAvailable('llama2:7b');

      // Assert
      expect(available).toBe(true);
    });

    it('should return false when model not available', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'mistral:latest', size: 0, modified_at: '' }],
        }),
      });

      // Act
      const available = await service.isModelAvailable('gpt-4');

      // Assert
      expect(available).toBe(false);
    });

    it('should return false on error', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act
      const available = await service.isModelAvailable('mistral');

      // Assert
      expect(available).toBe(false);
    });
  });

  describe('formatModelSize', () => {
    it('should format bytes under 1 GB as MB', () => {
      // Arrange
      const bytes = 500 * 1024 * 1024; // 500 MB

      // Act
      const formatted = OllamaService.formatModelSize(bytes);

      // Assert
      expect(formatted).toBe('500.0 MB');
    });

    it('should format bytes over 1 GB as GB', () => {
      // Arrange
      const bytes = 4.5 * 1024 * 1024 * 1024; // 4.5 GB

      // Act
      const formatted = OllamaService.formatModelSize(bytes);

      // Assert
      expect(formatted).toBe('4.5 GB');
    });

    it('should handle small sizes', () => {
      // Arrange
      const bytes = 10 * 1024 * 1024; // 10 MB

      // Act
      const formatted = OllamaService.formatModelSize(bytes);

      // Assert
      expect(formatted).toBe('10.0 MB');
    });
  });
});
