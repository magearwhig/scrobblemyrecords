/**
 * Frontend logger utility with automatic sensitive data redaction
 * Mirrors the backend logger pattern for consistency
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LoggerConfig {
  level: LogLevel;
  redactionEnabled: boolean;
  includeTimestamp: boolean;
}

class SecureLogger {
  private config: LoggerConfig;

  // Patterns for detecting sensitive data (same as backend)
  private readonly SENSITIVE_PATTERNS = [
    // OAuth headers and Authorization headers
    /Authorization:\s*OAuth[^,\s]*/gi,
    /Authorization:\s*Bearer\s+[^\s,]*/gi,
    /Authorization:\s*[^\s,]*/gi,

    // API keys and tokens
    /['"]\s*api_key\s*['"]\s*:\s*['"][^'"]+['"]/gi,
    /['"]\s*apiKey\s*['"]\s*:\s*['"][^'"]+['"]/gi,
    /['"]\s*session_key\s*['"]\s*:\s*['"][^'"]+['"]/gi,
    /['"]\s*sessionKey\s*['"]\s*:\s*['"][^'"]+['"]/gi,
    /['"]\s*token\s*['"]\s*:\s*['"][^'"]+['"]/gi,
    /['"]\s*oauth_token[^'"]*['"]\s*:\s*['"][^'"]+['"]/gi,
    /['"]\s*oauth_token_secret\s*['"]\s*:\s*['"][^'"]+['"]/gi,
    /['"]\s*oauth_verifier\s*['"]\s*:\s*['"][^'"]+['"]/gi,
    /['"]\s*api_sig\s*['"]\s*:\s*['"][^'"]+['"]/gi,

    // API signatures
    /oauth_signature=[^&\s]*/gi,
    /api_sig=[^&\s]*/gi,

    // Discogs tokens (start with specific format)
    /Discogs\s+token=[^\s,]*/gi,

    // Generic long hex strings (likely tokens/hashes)
    /[a-fA-F0-9]{32,}/g,

    // Query parameters with sensitive names
    /[?&](api_key|token|session_key|oauth_token|oauth_verifier|oauth_signature)=[^&\s]*/gi,

    // URLs with auth tokens embedded
    /https?:\/\/[^\s]*[?&](token|api_key|oauth_token)=[^&\s]*/gi,
  ];

  constructor(config?: Partial<LoggerConfig>) {
    // Determine if we're in production mode
    const isProduction = process.env.NODE_ENV === 'production';

    const defaultConfig: LoggerConfig = {
      level: isProduction ? LogLevel.WARN : LogLevel.DEBUG,
      redactionEnabled: true,
      includeTimestamp: true,
    };

    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Redacts sensitive information from a string
   */
  private redactSensitiveData(data: unknown): string {
    if (!this.config.redactionEnabled) {
      return this.stringifyData(data);
    }

    let text = this.stringifyData(data);

    // Apply all redaction patterns
    this.SENSITIVE_PATTERNS.forEach(pattern => {
      text = text.replace(pattern, match => {
        // Keep the beginning to show what type of data was redacted
        const colonIndex = match.indexOf(':');
        const equalIndex = match.indexOf('=');
        const splitIndex =
          colonIndex >= 0
            ? equalIndex >= 0
              ? Math.min(colonIndex, equalIndex)
              : colonIndex
            : equalIndex;
        const prefix = match.substring(
          0,
          Math.min(20, splitIndex >= 0 ? splitIndex + 1 : match.length)
        );
        return `${prefix}[REDACTED]`;
      });
    });

    return text;
  }

  /**
   * Converts data to string for logging
   */
  private stringifyData(data: unknown): string {
    if (typeof data === 'string') return data;
    if (data instanceof Error) return `${data.name}: ${data.message}`;

    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  /**
   * Formats log message with timestamp and level
   */
  private formatMessage(
    level: LogLevel,
    message: string,
    context?: string
  ): string {
    const timestamp = this.config.includeTimestamp
      ? new Date().toISOString()
      : '';

    const levelName = LogLevel[level];
    const contextStr = context ? `[${context}]` : '';

    return `${timestamp} ${levelName} ${contextStr} ${message}`.trim();
  }

  /**
   * Logs a message if it meets the minimum log level
   */
  private log(
    level: LogLevel,
    message: string,
    data?: unknown,
    context?: string
  ): void {
    if (level < this.config.level) return;

    const redactedMessage = this.redactSensitiveData(message);
    const redactedData = data ? this.redactSensitiveData(data) : '';

    const fullMessage = redactedData
      ? `${redactedMessage}\n${redactedData}`
      : redactedMessage;

    const formattedMessage = this.formatMessage(level, fullMessage, context);

    // Use appropriate console method based on level
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
    }
  }

  debug(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.DEBUG, message, data, context);
  }

  info(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.INFO, message, data, context);
  }

  warn(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.WARN, message, data, context);
  }

  error(message: string, data?: unknown, context?: string): void {
    this.log(LogLevel.ERROR, message, data, context);
  }

  /**
   * Creates a child logger with a specific context
   */
  child(context: string): ContextLogger {
    return new ContextLogger(this, context);
  }
}

/**
 * Context logger that automatically includes context in all log messages
 */
class ContextLogger {
  constructor(
    private parent: SecureLogger,
    private context: string
  ) {}

  debug(message: string, data?: unknown): void {
    this.parent.debug(message, data, this.context);
  }

  info(message: string, data?: unknown): void {
    this.parent.info(message, data, this.context);
  }

  warn(message: string, data?: unknown): void {
    this.parent.warn(message, data, this.context);
  }

  error(message: string, data?: unknown): void {
    this.parent.error(message, data, this.context);
  }
}

// Export a singleton instance
export const logger = new SecureLogger();

// Export factory for creating contextual loggers
export const createLogger = (context: string) => logger.child(context);
