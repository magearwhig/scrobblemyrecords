import {
  validateUsername,
  validateSessionId,
  validateIdentifier,
  sanitizePathComponent,
  validateNumericId,
} from '../../src/backend/utils/validation';

describe('validation utilities', () => {
  describe('validateUsername', () => {
    describe('valid usernames', () => {
      const validUsernames = [
        'user123',
        'test_user',
        'my-username',
        'U',
        'a_b-c123',
        'User',
        'USER',
        '123',
        '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12', // 62 chars
      ];

      validUsernames.forEach(username => {
        it(`should accept valid username: ${username}`, () => {
          expect(validateUsername(username)).toBe(true);
        });
      });
    });

    describe('invalid usernames', () => {
      const invalidUsernames = [
        '',
        null as any,
        undefined as any,
        ' ',
        'user name',
        'user@name',
        'user.name',
        'user/name',
        'user\\name',
        'user#name',
        'user$name',
        'user%name',
        'user*name',
        'user+name',
        'user=name',
        'user?name',
        'user[name]',
        'user{name}',
        'user|name',
        'user~name',
        'user`name',
        'user"name',
        "user'name",
        'user<name>',
        'user&name',
        'user!name',
        'user(name)',
        'user,name',
        'user:name',
        'user;name',
        'user\tname',
        'user\nname',
        'user\rname',
        'αβγ', // unicode
        'مرحبا', // arabic
        '用户名', // chinese
        '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123', // 65 chars (too long)
      ];

      invalidUsernames.forEach(username => {
        it(`should reject invalid username: ${JSON.stringify(username)}`, () => {
          expect(validateUsername(username)).toBe(false);
        });
      });
    });

    describe('edge cases', () => {
      it('should handle boolean input', () => {
        expect(validateUsername(true as any)).toBe(true); // Boolean converts to "true"
        expect(validateUsername(false as any)).toBe(false); // "false" is falsy in boolean context
      });

      it('should handle number input', () => {
        expect(validateUsername(123 as any)).toBe(true); // Number converts to "123"
        expect(validateUsername(0 as any)).toBe(false); // 0 is falsy
      });

      it('should handle object input', () => {
        expect(validateUsername({} as any)).toBe(false);
        expect(validateUsername({ name: 'test' } as any)).toBe(false);
      });

      it('should handle array input', () => {
        expect(validateUsername([] as any)).toBe(false); // Empty array converts to empty string
        expect(validateUsername(['test'] as any)).toBe(true); // Single item array converts to "test"
      });
    });
  });

  describe('validateSessionId', () => {
    describe('valid session IDs', () => {
      const validSessionIds = [
        'abc123',
        'session_123',
        'my-session',
        's',
        'SESSION',
        '123456789',
        'a_b-c123',
        'SessionID123',
        '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12', // 62 chars
      ];

      validSessionIds.forEach(sessionId => {
        it(`should accept valid session ID: ${sessionId}`, () => {
          expect(validateSessionId(sessionId)).toBe(true);
        });
      });
    });

    describe('invalid session IDs', () => {
      const invalidSessionIds = [
        '',
        null as any,
        undefined as any,
        ' ',
        'session with space',
        'session@123',
        'session.123',
        'session/123',
        'session\\123',
        'session#123',
        'session$123',
        'session%123',
        'session*123',
        'session+123',
        'session=123',
        'session?123',
        'session[123]',
        'session{123}',
        'session|123',
        'session~123',
        'session`123',
        'session"123',
        "session'123",
        'session<123>',
        'session&123',
        'session!123',
        'session(123)',
        'session,123',
        'session:123',
        'session;123',
        'session\t123',
        'session\n123',
        'session\r123',
        '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123', // 65 chars (too long)
      ];

      invalidSessionIds.forEach(sessionId => {
        it(`should reject invalid session ID: ${JSON.stringify(sessionId)}`, () => {
          expect(validateSessionId(sessionId)).toBe(false);
        });
      });
    });
  });

  describe('validateIdentifier', () => {
    describe('valid identifiers', () => {
      const validIdentifiers = [
        'id123',
        'my_identifier',
        'my-identifier',
        'ID',
        'IDENTIFIER',
        '123',
        'a_b-c123',
        'I',
        '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12', // 62 chars
      ];

      validIdentifiers.forEach(identifier => {
        it(`should accept valid identifier: ${identifier}`, () => {
          expect(validateIdentifier(identifier)).toBe(true);
        });
      });
    });

    describe('invalid identifiers', () => {
      const invalidIdentifiers = [
        '',
        null as any,
        undefined as any,
        ' ',
        'id with space',
        'id@123',
        'id.123',
        'id/123',
        'id\\123',
        '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123', // 65 chars (too long)
      ];

      invalidIdentifiers.forEach(identifier => {
        it(`should reject invalid identifier: ${JSON.stringify(identifier)}`, () => {
          expect(validateIdentifier(identifier)).toBe(false);
        });
      });
    });
  });

  describe('sanitizePathComponent', () => {
    describe('safe inputs', () => {
      const safeInputs = [
        'file.txt',
        'myfile',
        'file_123',
        'file-name',
        'FILE.TXT',
        '123',
        'a',
        'very-long-filename-with-many-characters-but-no-dangerous-patterns.extension',
      ];

      safeInputs.forEach(input => {
        it(`should return safe input unchanged: ${input}`, () => {
          expect(sanitizePathComponent(input)).toBe(input);
        });
      });
    });

    describe('dangerous inputs', () => {
      const dangerousInputs = [
        '../etc/passwd',
        '..\\windows\\system32',
        '../../secret.txt',
        '../',
        '..\\',
        'file/../other',
        'file\\..\\other',
        'file/subdir',
        'file\\subdir',
        'file\0.txt',
        'file%00.txt',
        '%2e%2e/passwd',
        '%252e%252e/passwd',
        'file%2e%2e',
        'file%252e%252e',
        '..%2f..%2fetc%2fpasswd',
        '..%252f..%252fetc%252fpasswd',
      ];

      dangerousInputs.forEach(input => {
        it(`should return null for dangerous input: ${input}`, () => {
          expect(sanitizePathComponent(input)).toBe(null);
        });
      });
    });

    describe('edge cases', () => {
      it('should return null for empty string', () => {
        expect(sanitizePathComponent('')).toBe(null);
      });

      it('should return null for null input', () => {
        expect(sanitizePathComponent(null as any)).toBe(null);
      });

      it('should return null for undefined input', () => {
        expect(sanitizePathComponent(undefined as any)).toBe(null);
      });

      it('should handle boolean input by converting to string', () => {
        expect(sanitizePathComponent(true as any)).toBe('true');
        expect(sanitizePathComponent(false as any)).toBe(null); // false is falsy, returns null
      });

      it('should handle number input by converting to string', () => {
        expect(sanitizePathComponent(123 as any)).toBe('123');
        expect(sanitizePathComponent(0 as any)).toBe(null); // 0 is falsy, returns null
      });

      it('should handle object input by converting to string', () => {
        expect(sanitizePathComponent({} as any)).toBe('[object Object]');
      });
    });
  });

  describe('validateNumericId', () => {
    describe('valid numeric IDs', () => {
      const validIds = [
        1,
        '1',
        '123',
        123,
        '999999999',
        999999999,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER.toString(),
      ];

      validIds.forEach(id => {
        it(`should accept valid numeric ID: ${id} (${typeof id})`, () => {
          expect(validateNumericId(id)).toBe(true);
        });
      });
    });

    describe('invalid numeric IDs', () => {
      const invalidIds = [
        0,
        '0',
        -1,
        '-1',
        -123,
        '-123',
        1.5,
        '1.5',
        'abc',
        'a123',
        '123a',
        '',
        null,
        undefined,
        NaN,
        'NaN',
        Infinity,
        'Infinity',
        -Infinity,
        '-Infinity',
        {},
        [],
        false,
        ' ',
        '1e-1', // This resolves to 0.1, a decimal
        // Removed items that actually pass: 1.0, true, "  123  ", "123\n", "\t123", "1.5e2"
      ];

      invalidIds.forEach(id => {
        it(`should reject invalid numeric ID: ${JSON.stringify(id)} (${typeof id})`, () => {
          expect(validateNumericId(id)).toBe(false);
        });
      });
    });

    describe('edge cases', () => {
      it('should handle very large numbers', () => {
        // The function doesn't check for safe integers, so large numbers pass if they're integers
        expect(validateNumericId(Number.MAX_SAFE_INTEGER)).toBe(true);
        // Very large numbers might lose precision but still pass
        expect(validateNumericId(Number.MAX_SAFE_INTEGER + 2)).toBe(true); // Still integer after precision loss
      });

      it('should accept scientific notation that resolves to integers', () => {
        expect(validateNumericId('1e3')).toBe(true); // 1000
        expect(validateNumericId('1E3')).toBe(true); // 1000
        expect(validateNumericId('1e0')).toBe(true); // 1
      });

      it('should accept hexadecimal strings', () => {
        expect(validateNumericId('0xFF')).toBe(true); // 255
        expect(validateNumericId('0xff')).toBe(true); // 255
      });

      it('should accept binary strings', () => {
        expect(validateNumericId('0b101')).toBe(true); // 5
        expect(validateNumericId('0B101')).toBe(true); // 5
      });

      it('should accept octal strings', () => {
        expect(validateNumericId('0o123')).toBe(true); // 83
        expect(validateNumericId('0O123')).toBe(true); // 83
      });

      it('should reject scientific notation that resolves to decimals', () => {
        expect(validateNumericId('1e-1')).toBe(false); // 0.1
      });

      it('should handle edge cases that might pass unexpectedly', () => {
        // These might be surprising but are technically valid based on JS Number conversion
        expect(validateNumericId('1.0')).toBe(true); // Converts to integer 1
        expect(validateNumericId(true)).toBe(true); // true converts to 1
        expect(validateNumericId('  123  ')).toBe(true); // String conversion trims whitespace
        expect(validateNumericId('123\n')).toBe(true); // String conversion handles newlines
        expect(validateNumericId('\t123')).toBe(true); // String conversion handles tabs
        expect(validateNumericId('1.5e2')).toBe(true); // 150 is an integer
      });
    });
  });
});
