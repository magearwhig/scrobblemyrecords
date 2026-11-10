import { defaultServerUrl } from '../../../src/renderer/services/serverUrl';

describe('defaultServerUrl', () => {
  const port = process.env.REACT_APP_BACKEND_PORT || '3001';

  it('uses the host the page was loaded from', () => {
    // jsdom serves the page from localhost
    expect(defaultServerUrl()).toBe(`http://localhost:${port}`);
  });
});
