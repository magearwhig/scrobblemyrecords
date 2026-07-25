import * as http from 'http';
import type { AddressInfo } from 'net';

import { OllamaService } from '../../../src/backend/services/ollamaService';

/**
 * Regression guard for the SSRF work.
 *
 * OllamaService deliberately talks to a local model server (default
 * http://localhost:11434). The SSRF blocklist added for website monitoring
 * blocks exactly that kind of address, so this pins that Ollama is NOT routed
 * through the guard and keeps working. If someone later "helpfully" applies the
 * guard globally, this test fails instead of the feature silently breaking.
 */
describe('OllamaService localhost access', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(done => {
    server = http.createServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'mistral' }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    // Bind to loopback specifically — the address the SSRF guard blocks.
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll(done => {
    server.close(() => done());
  });

  it('connects to a loopback model server', async () => {
    const service = new OllamaService({ baseUrl });

    await expect(service.checkConnection()).resolves.toEqual(
      expect.objectContaining({ connected: true })
    );
  });

  it('reports a clear error when the local server is absent', async () => {
    // Port 1 is reserved and nothing listens there; this must fail as a
    // connection error, not as an SSRF rejection.
    const service = new OllamaService({ baseUrl: 'http://127.0.0.1:1' });

    const result = await service.checkConnection();

    expect(result.connected).toBe(false);
    expect(result.error).not.toMatch(/private|loopback|non-public/i);
  });
});
