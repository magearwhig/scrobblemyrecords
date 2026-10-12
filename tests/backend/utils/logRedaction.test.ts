import { logger } from '../../../src/backend/utils/logger';
import {
  REDACTED_MARKER,
  redactSensitiveText,
} from '../../../src/shared/utils/logRedaction';
import { REDACTION_SAMPLES } from '../../fixtures/logRedactionSamples';

describe('redactSensitiveText', () => {
  it.each(REDACTION_SAMPLES)('redacts $name', ({ input, secret }) => {
    const output = redactSensitiveText(input);
    expect(output).not.toContain(secret);
    expect(output).toContain(REDACTED_MARKER);
  });

  it('keeps the label so the redacted value type is visible', () => {
    expect(redactSensitiveText('https://x.test/a?token=abc')).toContain(
      'https:'
    );
    expect(redactSensitiveText('Discogs token=abc')).toBe(
      'Discogs token=[REDACTED]'
    );
  });

  it('keeps the host, path and other parameters of a URL with a token', () => {
    expect(redactSensitiveText('GET https://x.test/a/b?token=abc&page=2')).toBe(
      'GET https://x.test/a/b?token=[REDACTED]&page=2'
    );
  });

  it('leaves non-sensitive text unchanged', () => {
    const text = 'Synced 42 releases for user mwood';
    expect(redactSensitiveText(text)).toBe(text);
  });

  it('is stable across repeated calls (global regex state)', () => {
    const input = '?token=one';
    expect(redactSensitiveText(input)).toBe(redactSensitiveText(input));
  });
});

describe('backend logger redaction', () => {
  it.each(REDACTION_SAMPLES)(
    'redacts $name in messages and data',
    ({ input, secret }) => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      logger.error(input);
      logger.error('context', input);
      const output = spy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).not.toContain(secret);
      expect(output).toContain(REDACTED_MARKER);
    }
  );
});
