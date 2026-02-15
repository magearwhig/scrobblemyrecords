import {
  safeJsonParse,
  JsonParseResult,
} from '../../../src/shared/utils/safeJsonParse';

describe('safeJsonParse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('valid JSON', () => {
    it('parses a simple object', () => {
      const result = safeJsonParse<{ name: string }>('{"name":"Radiohead"}');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: 'Radiohead' });
      }
    });

    it('parses an array', () => {
      const result = safeJsonParse<string[]>('["a","b","c"]');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['a', 'b', 'c']);
      }
    });

    it('parses a number', () => {
      const result = safeJsonParse<number>('42');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });

    it('parses a string', () => {
      const result = safeJsonParse<string>('"hello"');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('hello');
      }
    });

    it('parses a boolean', () => {
      const result = safeJsonParse<boolean>('true');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('parses null', () => {
      const result = safeJsonParse<null>('null');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('parses a deeply nested object', () => {
      const json = '{"a":{"b":{"c":{"d":1}}}}';
      const result = safeJsonParse<{ a: { b: { c: { d: number } } } }>(json);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.a.b.c.d).toBe(1);
      }
    });

    it('parses an array of objects', () => {
      const json = '[{"id":1,"name":"one"},{"id":2,"name":"two"}]';
      const result = safeJsonParse<Array<{ id: number; name: string }>>(json);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBe('one');
      }
    });

    it('parses JSON with unicode characters', () => {
      const result = safeJsonParse<{ name: string }>(
        '{"name":"Sigur R\\u00f3s"}'
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Sigur R\u00f3s');
      }
    });

    it('parses an empty object', () => {
      const result = safeJsonParse<Record<string, never>>('{}');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({});
      }
    });

    it('parses an empty array', () => {
      const result = safeJsonParse<never[]>('[]');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe('invalid JSON', () => {
    it('returns error for empty string', () => {
      const result = safeJsonParse('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });

    it('returns error for malformed JSON', () => {
      const result = safeJsonParse('{bad json}');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });

    it('returns error for trailing comma', () => {
      const result = safeJsonParse('{"a":1,}');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });

    it('returns error for single quotes', () => {
      const result = safeJsonParse("{'key':'value'}");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });

    it('returns error for undefined-like string', () => {
      const result = safeJsonParse('undefined');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });

    it('returns error for incomplete JSON', () => {
      const result = safeJsonParse('{"name":');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });

    it('wraps non-Error thrown values in an Error', () => {
      // JSON.parse always throws SyntaxError, but the code handles non-Error
      // throws too. We verify the error path returns an Error instance.
      const result = safeJsonParse('invalid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBeTruthy();
      }
    });
  });

  describe('type assertion', () => {
    it('allows type narrowing with success check', () => {
      interface Album {
        title: string;
        year: number;
      }
      const result: JsonParseResult<Album> = safeJsonParse<Album>(
        '{"title":"OK Computer","year":1997}'
      );

      if (result.success) {
        // TypeScript should allow accessing .data with correct type
        expect(result.data.title).toBe('OK Computer');
        expect(result.data.year).toBe(1997);
      } else {
        throw new Error('Expected parsing to succeed');
      }
    });

    it('allows type narrowing with failure check', () => {
      const result: JsonParseResult<string> = safeJsonParse<string>('bad');

      if (!result.success) {
        // TypeScript should allow accessing .error
        expect(result.error.message).toBeTruthy();
      } else {
        throw new Error('Expected parsing to fail');
      }
    });
  });
});
