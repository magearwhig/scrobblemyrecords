import { createLogger } from '../utils/logger';

const logger = createLogger('OllamaService');

export interface OllamaSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeout: number; // milliseconds
}

export interface OllamaModel {
  name: string;
  size: number; // bytes
  modifiedAt: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /**
   * Force JSON output format. When true, Ollama will guarantee valid JSON.
   * Use lower temperature (0.3) for more deterministic structured output.
   */
  jsonMode?: boolean;
  /**
   * Temperature for response generation. Lower = more deterministic.
   * Default: 0.7 for creative, 0.3 for JSON mode
   */
  temperature?: number;
  /**
   * Top-p sampling. Default: 0.9
   */
  topP?: number;
}

export interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
  context?: number[];
  totalDuration?: number;
  loadDuration?: number;
  promptEvalCount?: number;
  evalCount?: number;
}

export const DEFAULT_OLLAMA_SETTINGS: OllamaSettings = {
  enabled: false,
  baseUrl: 'http://localhost:11434',
  model: 'mistral',
  timeout: 60000, // 60 seconds (first call may take longer due to model loading)
};

/**
 * Service for interacting with a local Ollama instance for AI-powered suggestions.
 * Ollama runs locally and is completely free - no API keys required.
 */
export class OllamaService {
  private settings: OllamaSettings;

  constructor(settings?: Partial<OllamaSettings>) {
    this.settings = { ...DEFAULT_OLLAMA_SETTINGS, ...settings };
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<OllamaSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Get current settings
   */
  getSettings(): OllamaSettings {
    return { ...this.settings };
  }

  /**
   * Check if Ollama is running and accessible
   */
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.settings.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout for connection check
      });

      if (!response.ok) {
        return {
          connected: false,
          error: `Ollama returned status ${response.status}`,
        };
      }

      return { connected: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('ECONNREFUSED')) {
        return {
          connected: false,
          error:
            'Ollama is not running. Start it with "ollama serve" or install from https://ollama.com',
        };
      }

      return {
        connected: false,
        error: `Failed to connect to Ollama: ${errorMessage}`,
      };
    }
  }

  /**
   * Get list of available models
   */
  async getAvailableModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.settings.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Failed to get models: ${response.statusText}`);
      }

      const data = await response.json();
      return (data.models || []).map((model: any) => ({
        name: model.name,
        size: model.size || 0,
        modifiedAt: model.modified_at || model.modifiedAt || '',
      }));
    } catch (error) {
      logger.error('Error fetching models', error);
      throw error;
    }
  }

  /**
   * Generate a completion using Ollama
   */
  async generate(prompt: string, context?: number[]): Promise<OllamaResponse> {
    try {
      const response = await fetch(`${this.settings.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.settings.model,
          prompt,
          stream: false,
          context,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          },
        }),
        signal: AbortSignal.timeout(this.settings.timeout),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama error: ${error}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('Error generating completion', error);
      throw error;
    }
  }

  /**
   * Chat with the model using a conversation history
   * @param messages - The conversation messages
   * @param options - Optional settings for JSON mode and temperature
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    try {
      const jsonMode = options?.jsonMode ?? false;
      // Use lower temperature for JSON mode to get more deterministic output
      const temperature = options?.temperature ?? (jsonMode ? 0.3 : 0.7);
      const topP = options?.topP ?? 0.9;

      const requestBody: Record<string, unknown> = {
        model: this.settings.model,
        messages,
        stream: false,
        options: {
          temperature,
          top_p: topP,
        },
      };

      // Add format: "json" for guaranteed valid JSON output
      if (jsonMode) {
        requestBody.format = 'json';
      }

      const response = await fetch(`${this.settings.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.settings.timeout),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama chat error: ${error}`);
      }

      const data = await response.json();
      return data.message?.content || '';
    } catch (error) {
      logger.error('Error in chat', error);
      throw error;
    }
  }

  /**
   * Pull a model (download if not present)
   */
  async pullModel(modelName: string): Promise<void> {
    try {
      const response = await fetch(`${this.settings.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modelName,
          stream: false,
        }),
        signal: AbortSignal.timeout(300000), // 5 minutes for model download
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to pull model: ${error}`);
      }
    } catch (error) {
      logger.error('Error pulling model', error);
      throw error;
    }
  }

  /**
   * Check if a specific model is available
   */
  async isModelAvailable(modelName: string): Promise<boolean> {
    try {
      const models = await this.getAvailableModels();
      return models.some(
        m => m.name === modelName || m.name.startsWith(`${modelName}:`)
      );
    } catch {
      return false;
    }
  }

  /**
   * Format bytes to human readable string
   */
  static formatModelSize(bytes: number): string {
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}
