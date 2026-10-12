import { logger } from '../../../src/renderer/utils/logger';
import { REDACTED_MARKER } from '../../../src/shared/utils/logRedaction';
import { REDACTION_SAMPLES } from '../../fixtures/logRedactionSamples';

describe('renderer logger redaction', () => {
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
