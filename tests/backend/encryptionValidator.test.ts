import {
  EncryptionKeyValidator,
  validateEncryptionKey,
  generateSecureKey,
} from '../../src/backend/utils/encryptionValidator';

describe('EncryptionKeyValidator', () => {
  describe('validateEncryptionKey', () => {
    describe('valid keys', () => {
      it('should accept a valid 64-character random key', () => {
        const key =
          'a9b8c7d6e5f4a9b8c7d6e5f4a9b8c7d6e5f4a9b8c7d6e5f4a9b8c7d6e5f4a9b8';
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept a valid 128-character random key', () => {
        const key =
          'f3a8b7c2d9e1f3a8b7c2d9e1f3a8b7c2d9e1f3a8b7c2d9e1f3a8b7c2d9e1f3a8f3a8b7c2d9e1f3a8b7c2d9e1f3a8b7c2d9e1f3a8b7c2d9e1f3a8b7c2d9e1f3a8';
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(true);
      });

      it('should accept a strong passphrase', () => {
        const key = 'My$uper$ecureP@ssphrase2024!WithRandomness#567';
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(true);
      });

      it('should accept generated secure keys', () => {
        const key = generateSecureKey();
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(true);
      });
    });

    describe('invalid keys - missing/empty', () => {
      it('should reject empty string', () => {
        const result = EncryptionKeyValidator.validateEncryptionKey('');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('must be a non-empty string');
        expect(result.suggestions).toBeDefined();
      });

      it('should reject null', () => {
        const result = EncryptionKeyValidator.validateEncryptionKey(
          null as any
        );
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('must be a non-empty string');
      });

      it('should reject undefined', () => {
        const result = EncryptionKeyValidator.validateEncryptionKey(
          undefined as any
        );
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('must be a non-empty string');
      });

      it('should reject non-string types', () => {
        const result = EncryptionKeyValidator.validateEncryptionKey(123 as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('must be a non-empty string');
      });
    });

    describe('invalid keys - too short', () => {
      it('should reject keys shorter than 32 characters', () => {
        const key = 'a'.repeat(31);
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('at least 32 characters');
        expect(result.error).toContain('(got 31)');
      });

      it('should reject very short keys', () => {
        const key = 'short';
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('at least 32 characters');
        expect(result.error).toContain('(got 5)');
      });
    });

    describe('invalid keys - weak patterns', () => {
      const weakPatterns = [
        'default-encryption-key-change-me-12345678901234567890',
        'this-is-a-test-key-for-development-use-only-123456789',
        'my-super-secret-password-123456789012345',
        'demo-key-for-example-purposes-only-1234567890123456',
        'example-key-please-replace-in-production-1234567890',
      ];

      weakPatterns.forEach(key => {
        it(`should reject weak pattern: ${key.substring(0, 30)}...`, () => {
          const result = EncryptionKeyValidator.validateEncryptionKey(key);
          expect(result.isValid).toBe(false);
          expect(result.error).toContain('known weak pattern');
          expect(result.suggestions).toBeDefined();
          expect(result.suggestions![0]).toContain('Never use default');
        });
      });
    });

    describe('invalid keys - repeated characters', () => {
      it('should reject all same character', () => {
        const key = 'a'.repeat(32);
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('weak pattern');
        expect(result.error).toContain('repeated characters');
      });

      it('should reject repeated pairs', () => {
        const key = 'ab'.repeat(16);
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('weak pattern');
      });

      it('should reject repeated longer patterns', () => {
        const key = 'abcd'.repeat(8);
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('weak pattern');
      });
    });

    describe('invalid keys - sequential patterns', () => {
      it('should reject sequential numbers', () => {
        const key = '0123456789'.repeat(4);
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('weak pattern');
      });

      it('should reject sequential alphabet', () => {
        const key = 'abcdefghijklmnopqrstuvwxyzabcdef';
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('weak pattern');
      });
    });

    describe('invalid keys - limited character sets', () => {
      it('should reject keys with only numbers', () => {
        const key = '12345678901234567890123456789012';
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('weak pattern');
      });

      it('should reject keys with only letters', () => {
        const key = 'abcdefghijklmnopqrstuvwxyzabcdef';
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('weak pattern');
      });
    });

    describe('invalid keys - insufficient entropy', () => {
      it('should reject keys with very low entropy', () => {
        // A key with mostly repeated characters
        const key = 'aaaabbbbaaaabbbbaaaabbbbaaaabbbb';
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('weak pattern');
      });

      it('should accept hex strings with good entropy', () => {
        // Hex strings have lower character diversity but should still pass
        const key =
          '9f8e7d6c5b4a394857264815037f9e8d7c6b5a495847362514039f8e7d6c5b4a';
        const result = EncryptionKeyValidator.validateEncryptionKey(key);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('generateSecureKey', () => {
    it('should generate a key of correct length', () => {
      const key = EncryptionKeyValidator.generateSecureKey();
      expect(key).toHaveLength(64); // 32 bytes = 64 hex characters
    });

    it('should generate different keys each time', () => {
      const key1 = EncryptionKeyValidator.generateSecureKey();
      const key2 = EncryptionKeyValidator.generateSecureKey();
      expect(key1).not.toBe(key2);
    });

    it('should generate hex strings', () => {
      const key = EncryptionKeyValidator.generateSecureKey();
      expect(key).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate keys that pass validation', () => {
      const key = EncryptionKeyValidator.generateSecureKey();
      const result = EncryptionKeyValidator.validateEncryptionKey(key);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateAndThrow', () => {
    it('should not throw for valid keys', () => {
      const validKey = generateSecureKey();
      expect(() => {
        EncryptionKeyValidator.validateAndThrow(validKey, 'TestContext');
      }).not.toThrow();
    });

    it('should throw with descriptive error for invalid keys', () => {
      expect(() => {
        EncryptionKeyValidator.validateAndThrow('short', 'TestContext');
      }).toThrow(/TestContext startup failed/);
    });

    it('should include helpful guidance in error', () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        EncryptionKeyValidator.validateAndThrow('weak-key', 'TestContext');
      } catch (error) {
        // Should have thrown
      }

      expect(consoleSpy).toHaveBeenCalled();
      const errorMessage = consoleSpy.mock.calls[0][0];
      expect(errorMessage).toContain('🔐 ENCRYPTION KEY SECURITY ERROR');
      expect(errorMessage).toContain('💡 How to fix this:');
      expect(errorMessage).toContain('🔧 Quick fix:');
      expect(errorMessage).toContain('node -e');

      consoleSpy.mockRestore();
    });

    it('should throw for empty string', () => {
      expect(() => {
        EncryptionKeyValidator.validateAndThrow('', 'TestContext');
      }).toThrow(/must be a non-empty string/);
    });

    it('should include context in error message', () => {
      expect(() => {
        EncryptionKeyValidator.validateAndThrow('bad', 'MyService');
      }).toThrow(/MyService startup failed/);
    });
  });

  describe('convenience functions', () => {
    it('validateEncryptionKey function should work', () => {
      const key = generateSecureKey();
      const result = validateEncryptionKey(key);
      expect(result.isValid).toBe(true);
    });

    it('generateSecureKey function should work', () => {
      const key = generateSecureKey();
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]+$/);
    });
  });
});
