import crypto from 'crypto';

/**
 * Validation utility for encryption key security
 */

interface KeyValidationResult {
  isValid: boolean;
  error?: string;
  suggestions?: string[];
}

export class EncryptionKeyValidator {
  // Minimum key length in characters (32 bytes = 64 hex chars)
  private static readonly MIN_KEY_LENGTH = 32;

  // Known weak patterns to reject
  private static readonly WEAK_PATTERNS = [
    'default-encryption-key-change-me',
    'test-key',
    'development-key',
    'demo-key',
    'example-key',
    '12345',
    'password',
    'secret',
    'key123',
    'abcdef',
    'qwerty',
    'admin',
    'root',
  ];

  // Patterns that indicate weak keys
  private static readonly WEAK_REGEX_PATTERNS = [
    /^(.)\1{8,}$/, // Repeated characters (e.g., aaaaaaaa)
    /^(..)\1{4,}$/, // Repeated pairs (e.g., abababab)
    /^(012|123|234|345|456|567|678|789|890)+$/, // Sequential numbers
    /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+$/i, // Sequential letters
    /^[0-9]+$/, // Only numbers
    /^[a-zA-Z]+$/, // Only letters
  ];

  /**
   * Validates encryption key strength and security
   */
  static validateEncryptionKey(key: string): KeyValidationResult {
    if (!key || typeof key !== 'string') {
      return {
        isValid: false,
        error: 'Encryption key must be a non-empty string',
        suggestions: [
          "Generate a secure key using: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
          'Set ENCRYPTION_KEY environment variable with the generated key',
        ],
      };
    }

    // Check minimum length
    if (key.length < this.MIN_KEY_LENGTH) {
      return {
        isValid: false,
        error: `Encryption key must be at least ${this.MIN_KEY_LENGTH} characters long (got ${key.length})`,
        suggestions: [
          'Use a key of at least 32 characters for AES-256 security',
          "Generate using: crypto.randomBytes(32).toString('hex')",
          'Or use a passphrase of at least 32 strong characters',
        ],
      };
    }

    // Check against known weak keys
    const lowerKey = key.toLowerCase();
    for (const weakKey of this.WEAK_PATTERNS) {
      if (lowerKey.includes(weakKey.toLowerCase())) {
        return {
          isValid: false,
          error: `Encryption key contains known weak pattern: "${weakKey}"`,
          suggestions: [
            'Never use default, test, or example keys in production',
            'Generate a cryptographically secure random key',
            "Use: crypto.randomBytes(32).toString('hex')",
          ],
        };
      }
    }

    // Check against weak patterns
    for (const pattern of this.WEAK_REGEX_PATTERNS) {
      if (pattern.test(key)) {
        return {
          isValid: false,
          error:
            'Encryption key uses a weak pattern (repeated characters, sequential, or limited character set)',
          suggestions: [
            'Use a cryptographically random key with mixed characters',
            "Generate using: crypto.randomBytes(32).toString('hex')",
            'Ensure key has good entropy and randomness',
          ],
        };
      }
    }

    // Check entropy (adjusted for hex strings and passphrases)
    const uniqueChars = new Set(key).size;
    const isHexString = /^[0-9a-fA-F]+$/.test(key);

    // For hex strings, expect at least 8 different characters (decent distribution of 0-9, a-f)
    // For regular strings, expect at least 30% character diversity
    const minUniqueChars = isHexString
      ? Math.min(8, key.length / 4)
      : key.length * 0.3;

    if (uniqueChars < minUniqueChars) {
      return {
        isValid: false,
        error:
          'Encryption key has insufficient entropy (too many repeated characters)',
        suggestions: [
          'Use a key with better character distribution',
          "Generate a random hex key: crypto.randomBytes(32).toString('hex')",
          'Or use a strong passphrase with mixed characters and symbols',
        ],
      };
    }

    return {
      isValid: true,
    };
  }

  /**
   * Generates a cryptographically secure encryption key
   */
  static generateSecureKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validates key and throws descriptive error if invalid
   */
  static validateAndThrow(key: string, context = 'Application'): void {
    const result = this.validateEncryptionKey(key);

    if (!result.isValid) {
      const error = new Error(`${context} startup failed: ${result.error}`);

      // Add helpful information without exposing the actual key
      let message = `\n\n🔐 ENCRYPTION KEY SECURITY ERROR\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `❌ ${result.error}\n\n`;

      if (result.suggestions && result.suggestions.length > 0) {
        message += `💡 How to fix this:\n`;
        result.suggestions.forEach((suggestion, i) => {
          message += `   ${i + 1}. ${suggestion}\n`;
        });
        message += `\n`;
      }

      message += `🔧 Quick fix:\n`;
      message += `   1. Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\n`;
      message += `   2. Copy the output and set ENCRYPTION_KEY environment variable\n`;
      message += `   3. Add to your .env file: ENCRYPTION_KEY=<generated_key>\n\n`;
      message += `⚠️  Never commit encryption keys to version control!\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      console.error(message);
      throw error;
    }
  }
}

/**
 * Convenience function for key validation
 */
export const validateEncryptionKey = (key: string) =>
  EncryptionKeyValidator.validateEncryptionKey(key);

/**
 * Convenience function for secure key generation
 */
export const generateSecureKey = () =>
  EncryptionKeyValidator.generateSecureKey();
