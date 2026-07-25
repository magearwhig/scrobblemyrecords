import * as dns from 'dns';
import * as net from 'net';

/**
 * SSRF protection for fetches of user-supplied URLs.
 *
 * The website monitoring feature fetches arbitrary URLs the user provides and,
 * in the preview case, hands the response body straight back to the caller.
 * Without this guard that is a read primitive against anything the server can
 * reach: other services on localhost, the LAN, and cloud instance metadata at
 * 169.254.169.254.
 *
 * Two enforcement points are needed, because they cover different cases:
 *
 *  1. {@link assertPublicUrl} rejects URLs whose host is already an IP literal.
 *     Node skips DNS entirely for those, so a lookup hook never sees them.
 *  2. {@link createGuardedLookup} validates addresses at the moment of
 *     connection. Checking DNS separately and then connecting would leave a
 *     rebinding window where the name resolves to a public address for the
 *     check and a private one for the connection.
 *
 * This does not apply to Ollama, which deliberately talks to localhost and does
 * not route through the guarded fetch helper.
 */

/** Parsed CIDR block, pre-split for cheap comparison. */
interface CidrBlock {
  base: bigint;
  mask: bigint;
  bits: number;
}

function ipv4ToBigInt(address: string): bigint {
  return address
    .split('.')
    .reduce((acc, octet) => (acc << 8n) | BigInt(Number(octet)), 0n);
}

function ipv6ToBigInt(address: string): bigint {
  // Expand '::' and any embedded IPv4 tail into 8 hextets.
  let normalized = address;
  const embeddedIpv4 = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (embeddedIpv4) {
    const asInt = ipv4ToBigInt(embeddedIpv4[1]);
    const high = (asInt >> 16n).toString(16);
    const low = (asInt & 0xffffn).toString(16);
    normalized = normalized.replace(/\d+\.\d+\.\d+\.\d+$/, `${high}:${low}`);
  }

  const [head, tail] = normalized.split('::');
  const headParts = head ? head.split(':').filter(Boolean) : [];
  const tailParts = tail ? tail.split(':').filter(Boolean) : [];
  const fill = 8 - headParts.length - tailParts.length;
  const parts = [
    ...headParts,
    ...Array(normalized.includes('::') ? fill : 0).fill('0'),
    ...tailParts,
  ];

  return parts.reduce((acc, part) => (acc << 16n) | BigInt(`0x${part}`), 0n);
}

function parseCidr(cidr: string, bits: number): CidrBlock {
  const [address, prefixText] = cidr.split('/');
  const prefix = Number(prefixText);
  const toBigInt = bits === 32 ? ipv4ToBigInt : ipv6ToBigInt;
  const mask =
    prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(bits - prefix);
  return { base: toBigInt(address) & mask, mask, bits };
}

/**
 * IPv4 ranges that must never be fetched.
 *
 * 169.254.0.0/16 covers cloud instance metadata (169.254.169.254) as well as
 * ordinary link-local. 100.64.0.0/10 is carrier-grade NAT, which is a private
 * network from the server's point of view.
 */
const BLOCKED_IPV4 = [
  '0.0.0.0/8', // "this network" — includes 0.0.0.0
  '10.0.0.0/8', // private
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local + cloud metadata
  '172.16.0.0/12', // private
  '192.0.0.0/24', // IETF protocol assignments
  '192.0.2.0/24', // documentation (TEST-NET-1)
  '192.88.99.0/24', // 6to4 relay anycast
  '192.168.0.0/16', // private
  '198.18.0.0/15', // benchmarking
  '198.51.100.0/24', // documentation (TEST-NET-2)
  '203.0.113.0/24', // documentation (TEST-NET-3)
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved — includes 255.255.255.255
].map(cidr => parseCidr(cidr, 32));

/**
 * IPv6 ranges that must never be fetched.
 *
 * The IPv4-bearing ranges (::ffff:0:0/96 v4-mapped, 64:ff9b::/96 NAT64,
 * 2002::/16 6to4) are handled separately: their embedded IPv4 address is
 * extracted and re-checked against the IPv4 list, so ::ffff:127.0.0.1 is
 * blocked for the same reason 127.0.0.1 is.
 */
const BLOCKED_IPV6 = [
  '::/128', // unspecified
  '::1/128', // loopback
  '100::/64', // discard-only
  '2001:db8::/32', // documentation
  'fc00::/7', // unique local (ULA)
  'fe80::/10', // link-local
  'ff00::/8', // multicast
].map(cidr => parseCidr(cidr, 128));

/** Ranges that wrap an IPv4 address, with the bit offset of that address. */
const IPV4_BEARING_IPV6 = [
  { cidr: parseCidr('::ffff:0:0/96', 128), shift: 0n }, // IPv4-mapped
  { cidr: parseCidr('64:ff9b::/96', 128), shift: 0n }, // NAT64
  { cidr: parseCidr('2002::/16', 128), shift: 80n }, // 6to4
];

function isInBlock(value: bigint, block: CidrBlock): boolean {
  return (value & block.mask) === block.base;
}

/**
 * True if this address must not be connected to.
 *
 * Accepts a bare address, not a hostname — callers resolve first.
 */
export function isBlockedAddress(address: string): boolean {
  const cleaned = address.replace(/^\[|\]$/g, '').split('%')[0]; // strip brackets + zone id
  const family = net.isIP(cleaned);

  if (family === 4) {
    const value = ipv4ToBigInt(cleaned);
    return BLOCKED_IPV4.some(block => isInBlock(value, block));
  }

  if (family === 6) {
    const value = ipv6ToBigInt(cleaned);

    // Unwrap embedded IPv4 first — ::ffff:127.0.0.1 is loopback.
    for (const { cidr, shift } of IPV4_BEARING_IPV6) {
      if (isInBlock(value, cidr)) {
        const embedded = (value >> shift) & 0xffffffffn;
        return BLOCKED_IPV4.some(block =>
          isInBlock(embedded, { ...block, bits: 32 })
        );
      }
    }

    return BLOCKED_IPV6.some(block => isInBlock(value, block));
  }

  // Not an IP address at all — nothing to authorize.
  return true;
}

export class BlockedAddressError extends Error {
  constructor(target: string) {
    super(
      `Refusing to fetch ${target}: it resolves to a private, loopback, ` +
        'link-local, or otherwise non-public address.'
    );
    this.name = 'BlockedAddressError';
  }
}

/**
 * Validate a user-supplied URL and return it parsed.
 *
 * Parsing through WHATWG URL is load-bearing: it canonicalizes obfuscated
 * literals, so http://2130706433/, http://0177.0.0.1/, http://0x7f000001/ and
 * http://127.1/ all arrive here as 127.0.0.1 and are blocked by the same rule.
 *
 * @throws if the URL is malformed, is not http(s), carries credentials, or
 *         points at a blocked IP literal.
 */
export function assertPublicUrl(
  rawUrl: string,
  isBlocked: (address: string) => boolean = isBlockedAddress
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must use http or https');
  }

  // Credentials in a URL are a redirect-laundering trick and have no
  // legitimate use for a page we are scraping.
  if (parsed.username || parsed.password) {
    throw new Error('URL must not contain credentials');
  }

  // An IP literal never reaches the DNS lookup hook, so check it here.
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname) && isBlocked(hostname)) {
    throw new BlockedAddressError(parsed.hostname);
  }

  return parsed;
}

/** Matches the shape http.request accepts for its `lookup` option. */
export type GuardedLookup = net.LookupFunction;

/**
 * A DNS lookup that refuses to hand back a blocked address.
 *
 * Passed as http.request's `lookup` option so the address we validate is the
 * address actually connected to — there is no window in which the name could
 * resolve differently for the check and for the connection.
 */
export function createGuardedLookup(
  isBlocked: (address: string) => boolean = isBlockedAddress
): GuardedLookup {
  return ((
    hostname: string,
    options: dns.LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family?: number
    ) => void
  ) => {
    // Always resolve every address, even when the caller asked for one: a
    // hostname that resolves to both a public and a private address must be
    // rejected, not silently narrowed to whichever came first.
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) {
        callback(err, []);
        return;
      }

      const resolved = Array.isArray(addresses) ? addresses : [addresses];
      const blocked = resolved.filter(entry => isBlocked(entry.address));

      if (blocked.length > 0) {
        callback(new BlockedAddressError(hostname), []);
        return;
      }

      if (options.all) {
        callback(null, resolved);
      } else {
        callback(null, resolved[0].address, resolved[0].family);
      }
    });
  }) as GuardedLookup;
}

/**
 * The validation surface the fetch helper depends on.
 *
 * Injected rather than imported directly so transport behaviour (redirects,
 * timeouts, byte caps) can be tested against a local server on 127.0.0.1,
 * which the real guard necessarily blocks.
 */
export interface SsrfGuard {
  assertPublicUrl(rawUrl: string): URL;
  createLookup(): GuardedLookup;
}

export const defaultSsrfGuard: SsrfGuard = {
  assertPublicUrl: raw => assertPublicUrl(raw),
  createLookup: () => createGuardedLookup(),
};

/**
 * A guard that keeps every URL-level rule (scheme, credentials, parsing) but
 * permits private addresses.
 *
 * For tests that need to reach a local HTTP server on 127.0.0.1. It relaxes the
 * address blocklist and nothing else, so protocol and credential validation are
 * still exercised rather than accidentally bypassed.
 */
export function createPermissiveSsrfGuard(): SsrfGuard {
  const allowAll = () => false;
  return {
    assertPublicUrl: raw => assertPublicUrl(raw, allowAll),
    createLookup: () => createGuardedLookup(allowAll),
  };
}
