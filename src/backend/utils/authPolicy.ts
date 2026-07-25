import * as net from 'net';

/**
 * Decides whether API authentication is required, based on how the server is
 * being exposed.
 *
 * The rule is "fail closed on exposure": binding to anything other than
 * loopback means other machines can reach the API, and this app has no user
 * accounts, so a token becomes mandatory rather than advisory.
 */

export interface AuthPolicy {
  /** Whether the token middleware should be installed. */
  authRequired: boolean;
  /** The configured token, when there is one. */
  token?: string;
  /** Why auth was required, for logging. */
  reason?: 'non-loopback-bind' | 'explicit-require-auth';
}

/**
 * True if this bind address reaches only the local machine.
 *
 * Anything else — 0.0.0.0, ::, a specific LAN address — is reachable from
 * elsewhere on the network. Unparseable values are treated as non-loopback,
 * because guessing "safe" on an address we do not understand is the wrong
 * direction to fail.
 */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().replace(/^\[|\]$/g, '');

  if (normalized === '') return false; // empty means "all interfaces"
  if (normalized === 'localhost') return true;

  const family = net.isIP(normalized);
  if (family === 4) return normalized.startsWith('127.');
  if (family === 6) return normalized === '::1';

  return false;
}

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

/**
 * Resolve the auth policy for a given bind host and environment.
 *
 * @throws AuthConfigurationError when auth is required but no usable token is
 *         configured. Callers should treat this as fatal — starting anyway
 *         would expose an unauthenticated API to the network.
 */
export function resolveAuthPolicy(
  host: string,
  env: NodeJS.ProcessEnv = process.env
): AuthPolicy {
  const token = env.API_TOKEN?.trim();
  // Case-insensitive so REQUIRE_AUTH=TRUE does not silently do nothing.
  const explicitlyRequired = env.REQUIRE_AUTH?.trim().toLowerCase() === 'true';
  const exposed = !isLoopbackHost(host);

  // REQUIRE_AUTH exists because a reverse proxy can publish a loopback-bound
  // process to the internet; the bind address alone cannot detect that.
  const authRequired = exposed || explicitlyRequired;

  // A configured token is validated wherever it is used, including on loopback:
  // that server may still be published by a proxy, and a weak token there is
  // exactly as weak as anywhere else.
  if (token) assertUsableToken(token);

  if (!authRequired) {
    // Loopback with a token set: honour it anyway rather than ignoring config.
    return token
      ? { authRequired: true, token, reason: 'explicit-require-auth' }
      : { authRequired: false };
  }

  const reason: AuthPolicy['reason'] = exposed
    ? 'non-loopback-bind'
    : 'explicit-require-auth';

  if (!token) {
    const trigger = exposed
      ? `HOST is set to '${host}', which is reachable from other machines`
      : 'REQUIRE_AUTH=true is set';

    throw new AuthConfigurationError(
      `Refusing to start without authentication: ${trigger}, but API_TOKEN is not set.\n\n` +
        'This application has no user accounts. Exposed without a token, anyone who can\n' +
        'reach the port could read your collection, change settings, and clear credentials.\n\n' +
        'Generate a token and set it:\n' +
        '  API_TOKEN=$(openssl rand -hex 32)\n\n' +
        'Clients must then send it as:  Authorization: Bearer <token>\n\n' +
        'To run without a token, bind to loopback instead (HOST=127.0.0.1).\n' +
        'Note that the token travels in plaintext over HTTP — put TLS or an\n' +
        'authenticated reverse proxy in front of anything beyond a trusted LAN.'
    );
  }

  return { authRequired: true, token, reason };
}

/** Minimum token length worth calling a secret. */
const MIN_TOKEN_LENGTH = 16;

function assertUsableToken(token: string): void {
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new AuthConfigurationError(
      `API_TOKEN is too short to be useful (minimum ${MIN_TOKEN_LENGTH} characters).\n` +
        'Generate a strong one with:  API_TOKEN=$(openssl rand -hex 32)'
    );
  }
}
