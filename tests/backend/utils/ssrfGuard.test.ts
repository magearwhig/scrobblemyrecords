import {
  assertPublicUrl,
  BlockedAddressError,
  createGuardedLookup,
  isBlockedAddress,
} from '../../../src/backend/utils/ssrfGuard';

describe('ssrfGuard', () => {
  describe('isBlockedAddress — IPv4', () => {
    const blocked = [
      ['0.0.0.0', 'unspecified'],
      ['0.1.2.3', 'this-network'],
      ['10.0.0.1', 'private class A'],
      ['10.255.255.254', 'private class A upper'],
      ['100.64.0.1', 'carrier-grade NAT'],
      ['127.0.0.1', 'loopback'],
      ['127.255.255.254', 'loopback upper'],
      ['169.254.169.254', 'cloud instance metadata'],
      ['169.254.1.1', 'link-local'],
      ['172.16.0.1', 'private class B lower'],
      ['172.31.255.254', 'private class B upper'],
      ['192.0.0.1', 'IETF protocol assignments'],
      ['192.0.2.1', 'TEST-NET-1'],
      ['192.88.99.1', '6to4 relay anycast'],
      ['192.168.1.1', 'private class C'],
      ['198.18.0.1', 'benchmarking'],
      ['198.51.100.1', 'TEST-NET-2'],
      ['203.0.113.1', 'TEST-NET-3'],
      ['224.0.0.1', 'multicast'],
      ['255.255.255.255', 'broadcast'],
    ] as const;

    it.each(blocked)('blocks %s (%s)', address => {
      expect(isBlockedAddress(address)).toBe(true);
    });

    const allowed = [
      '8.8.8.8',
      '1.1.1.1',
      '93.184.216.34',
      '172.15.255.255', // just below the private class B range
      '172.32.0.1', // just above it
      '100.63.255.255', // just below CGNAT
      '100.128.0.1', // just above CGNAT
      '223.255.255.255', // just below multicast
    ];

    it.each(allowed)('allows public address %s', address => {
      expect(isBlockedAddress(address)).toBe(false);
    });
  });

  describe('isBlockedAddress — IPv6', () => {
    const blocked = [
      ['::', 'unspecified'],
      ['::1', 'loopback'],
      ['fc00::1', 'unique local lower'],
      ['fdff::1', 'unique local upper'],
      ['fe80::1', 'link-local'],
      ['ff02::1', 'multicast'],
      ['2001:db8::1', 'documentation'],
      ['100::1', 'discard-only'],
      ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
      ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
      ['::ffff:192.168.1.1', 'IPv4-mapped private'],
      ['64:ff9b::127.0.0.1', 'NAT64 loopback'],
      ['2002:7f00:1::', '6to4 wrapping 127.0.0.1'],
      ['2002:a00:1::', '6to4 wrapping 10.0.0.1'],
    ] as const;

    it.each(blocked)('blocks %s (%s)', address => {
      expect(isBlockedAddress(address)).toBe(true);
    });

    it('allows a public IPv6 address', () => {
      expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
    });

    it('allows IPv4-mapped public addresses', () => {
      expect(isBlockedAddress('::ffff:8.8.8.8')).toBe(false);
    });

    it('strips brackets and zone identifiers', () => {
      expect(isBlockedAddress('[::1]')).toBe(true);
      expect(isBlockedAddress('fe80::1%eth0')).toBe(true);
    });
  });

  describe('isBlockedAddress — non-addresses', () => {
    it.each(['not-an-ip', '', 'example.com', '999.999.999.999'])(
      'blocks unparseable input %p rather than defaulting open',
      value => {
        expect(isBlockedAddress(value)).toBe(true);
      }
    );
  });

  describe('assertPublicUrl', () => {
    it('accepts an ordinary public URL', () => {
      expect(assertPublicUrl('https://example.com/page').hostname).toBe(
        'example.com'
      );
    });

    it('rejects malformed URLs', () => {
      expect(() => assertPublicUrl('not a url')).toThrow('Invalid URL');
    });

    it.each(['file:///etc/passwd', 'ftp://example.com', 'gopher://x'])(
      'rejects non-http(s) scheme %s',
      url => {
        expect(() => assertPublicUrl(url)).toThrow('http or https');
      }
    );

    it('rejects embedded credentials', () => {
      expect(() => assertPublicUrl('http://user:pass@example.com/')).toThrow(
        'must not contain credentials'
      );
    });

    describe('obfuscated IPv4 literals', () => {
      // WHATWG URL canonicalizes all of these to 127.0.0.1, which is exactly
      // why parsing through it before checking is load-bearing.
      const obfuscated = [
        'http://127.0.0.1/',
        'http://2130706433/', // decimal
        'http://0177.0.0.1/', // octal
        'http://0x7f000001/', // hex
        'http://127.1/', // short form
      ];

      it.each(obfuscated)('rejects %s', url => {
        expect(() => assertPublicUrl(url)).toThrow(BlockedAddressError);
      });
    });

    it.each([
      'http://169.254.169.254/latest/meta-data/',
      'http://192.168.1.1/admin',
      'http://10.0.0.1/',
      'http://[::1]:8080/',
      'http://[::ffff:127.0.0.1]/',
    ])('rejects %s', url => {
      expect(() => assertPublicUrl(url)).toThrow(BlockedAddressError);
    });

    it('allows non-standard ports on public hosts', () => {
      expect(assertPublicUrl('http://example.com:8080/x').port).toBe('8080');
    });

    it('does not resolve DNS names at this stage', () => {
      // Hostnames are authorized at connection time by the guarded lookup;
      // rejecting them here would block every legitimate site.
      expect(() => assertPublicUrl('http://localhost/')).not.toThrow();
    });
  });

  describe('createGuardedLookup', () => {
    const run = (
      lookup: ReturnType<typeof createGuardedLookup>,
      hostname: string,
      options: Record<string, unknown> = { all: true }
    ) =>
      new Promise<{ err: Error | null; addresses: unknown }>(resolve => {
        (lookup as unknown as (h: string, o: unknown, c: unknown) => void)(
          hostname,
          options,
          (err: Error | null, addresses: unknown) => resolve({ err, addresses })
        );
      });

    it('rejects a hostname resolving to a blocked address', async () => {
      const { err } = await run(createGuardedLookup(), 'localhost');
      expect(err).toBeInstanceOf(BlockedAddressError);
    });

    it('rejects when ANY resolved address is blocked, not just the first', async () => {
      // A name resolving to both a public and a private address is the
      // signature of a rebinding attack. Filtering down to the public address
      // would still let a later connection attempt reach the private one, so
      // the whole hostname is refused.
      let call = 0;
      const blockSecondAddressOnly = () => call++ === 1;

      const { err } = await run(
        createGuardedLookup(blockSecondAddressOnly),
        'localhost' // resolves to at least 127.0.0.1 and often ::1
      );

      expect(err).toBeInstanceOf(BlockedAddressError);
    });

    it('passes through addresses when none are blocked', async () => {
      const { err, addresses } = await run(
        createGuardedLookup(() => false),
        'localhost'
      );
      expect(err).toBeNull();
      expect(Array.isArray(addresses)).toBe(true);
      expect((addresses as unknown[]).length).toBeGreaterThan(0);
    });

    it('returns a bare address when the caller did not ask for all', async () => {
      const { err, addresses } = await run(
        createGuardedLookup(() => false),
        'localhost',
        {}
      );
      expect(err).toBeNull();
      expect(typeof addresses).toBe('string');
    });

    it('propagates resolution failures', async () => {
      const { err } = await run(
        createGuardedLookup(() => false),
        'this-host-does-not-exist.invalid'
      );
      expect(err).toBeTruthy();
      expect(err).not.toBeInstanceOf(BlockedAddressError);
    });
  });
});
