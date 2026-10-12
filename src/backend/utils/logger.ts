/**
 * Secure logging utility with automatic sensitive data redaction
 */

import { redactSensitiveText } from '../../shared/utils/logRedaction';

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

  constructor(config?: Partial<LoggerConfig>) {
    const defaultConfig: LoggerConfig = {
      level:
        process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
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

    return redactSensitiveText(this.stringifyData(data));
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
