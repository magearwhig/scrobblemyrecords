/**
 * Shared sensitive-data redaction used by both the backend and renderer
 * loggers. Keeping a single implementation prevents the two copies from
 * drifting apart (see tech-debt H9).
 */

/** Replacement marker inserted in place of redacted values. */
export const REDACTED_MARKER = '[REDACTED]';

/**
 * Patterns for detecting sensitive data. All patterns are global so that
 * `String.prototype.replace` redacts every occurrence.
 */
export const SENSITIVE_PATTERNS: readonly RegExp[] = [
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

  // OAuth header parameters (e.g. `Authorization: OAuth oauth_token="..."`).
  // Also matches the `\"` quotes produced when a logged object is serialized
  // with JSON.stringify.
  /oauth_(token|token_secret|verifier|signature)=\\?"[^"\\]*\\?"/gi,

  // API signatures
  /oauth_signature=[^&\s]*/gi,
  /api_sig=[^&\s]*/gi,

  // Discogs tokens (start with specific format)
  /Discogs\s+token=[^\s,]*/gi,

  // Generic long hex strings (likely tokens/hashes)
  /[a-fA-F0-9]{32,}/g,

  // Query parameters with sensitive names. Only the value is redacted, so a
  // logged URL keeps its host, path and other parameters.
  /[?&](api_key|token|session_key|oauth_token|oauth_verifier|oauth_signature)=[^&\s]*/gi,
];

/**
 * Builds the replacement for a matched secret. Keeps the leading label (up to
 * the first `:` or `=`, capped at 20 chars) so logs still show what kind of
 * value was redacted. A match with no label (e.g. a bare hex token) is
 * replaced entirely so no part of the secret leaks.
 */
function redactMatch(match: string): string {
  const colonIndex = match.indexOf(':');
  const equalIndex = match.indexOf('=');
  const splitIndex =
    colonIndex >= 0
      ? equalIndex >= 0
        ? Math.min(colonIndex, equalIndex)
        : colonIndex
      : equalIndex;
  const prefix =
    splitIndex >= 0 ? match.substring(0, Math.min(20, splitIndex + 1)) : '';
  return `${prefix}${REDACTED_MARKER}`;
}

/**
 * Redacts all known sensitive values from a string.
 */
export function redactSensitiveText(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, redactMatch);
  }
  return result;
}
