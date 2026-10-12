/**
 * Shared sample inputs for logger redaction tests. Both the backend and the
 * renderer logger tests run these so the two loggers cannot drift (H9).
 * Each `secret` must not appear in the redacted output.
 */
export interface RedactionSample {
  name: string;
  input: string;
  secret: string;
}

export const REDACTION_SAMPLES: RedactionSample[] = [
  {
    name: 'Bearer authorization header',
    input: 'Authorization: Bearer abc123secretvalue',
    secret: 'abc123secretvalue',
  },
  {
    name: 'OAuth header parameters',
    input:
      'Authorization: OAuth oauth_consumer_key="ck", oauth_token="tok-secret-1", oauth_signature="sig-secret-2"',
    secret: 'tok-secret-1',
  },
  {
    // How an OAuth header looks after a logger JSON.stringify()s an object
    name: 'OAuth header inside a serialized object',
    input: JSON.stringify({
      headers: { Authorization: 'OAuth oauth_token="tok-json-secret"' },
    }),
    secret: 'tok-json-secret',
  },
  {
    name: 'OAuth header signature',
    input:
      'Authorization: OAuth oauth_token="x", oauth_signature="sig-secret-2"',
    secret: 'sig-secret-2',
  },
  {
    name: 'JSON api_key field',
    input: '{"api_key": "lastfm-key-value"}',
    secret: 'lastfm-key-value',
  },
  {
    name: 'JSON sessionKey field',
    input: '{"sessionKey": "session-secret"}',
    secret: 'session-secret',
  },
  {
    name: 'URL with token query param',
    input: 'GET https://api.discogs.com/users/me?token=discogs-tok-xyz&page=2',
    secret: 'discogs-tok-xyz',
  },
  {
    name: 'URL with oauth_token query param',
    input:
      'Redirect to https://discogs.com/oauth/authorize?oauth_token=req-tok-789',
    secret: 'req-tok-789',
  },
  {
    name: 'URL with api_key query param',
    input: 'https://ws.audioscrobbler.com/2.0/?method=x&api_key=lf-key-456',
    secret: 'lf-key-456',
  },
  {
    name: 'Discogs token header',
    input: 'Discogs token=personal-token-123',
    secret: 'personal-token-123',
  },
  {
    name: 'bare 32-char hex token',
    input: 'session 0123456789abcdef0123456789abcdef established',
    secret: '0123456789abcdef',
  },
];
