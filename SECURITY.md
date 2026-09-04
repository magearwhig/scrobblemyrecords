# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly by opening a GitHub issue. For sensitive findings, please reach out privately before public disclosure.

## Architecture and Security Model

RecordScrobbles is designed as a **single-user, localhost application**. The threat model assumes the app runs on a trusted local machine. Nonetheless, the project applies defense-in-depth practices.

### Security Controls

- **HTTP hardening**: `helmet()` middleware enabled for secure headers
- **CORS**: Configured to allow only known frontend origins
- **Rate limiting**: `express-rate-limit` on all API endpoints (300 req/15min per IP)
- **Request size limits**: `express.json({ limit: '1mb' })` to prevent payload abuse
- **Credential encryption**: All stored API tokens and secrets are encrypted at rest using AES encryption
- **No cookies/sessions**: Reduces CSRF attack surface
- **Input validation**: Path traversal protection in FileStorage, username/session ID validation utilities
- **Secure logging**: `createLogger()` auto-redacts sensitive data (tokens, API keys, secrets) from all log output
- **Startup validation**: Required environment variables (encryption key, API credentials) are validated before the server accepts requests

### Environment Variables

The following environment variables must be configured (see `.env.example`):

| Variable | Purpose | Security Notes |
|----------|---------|---------------|
| `ENCRYPTION_KEY` | AES encryption key for stored credentials | **Required**. Use a strong, random value (32+ characters) |
| `DISCOGS_CLIENT_ID` | Discogs API OAuth client ID | Required for Discogs integration |
| `DISCOGS_CLIENT_SECRET` | Discogs API OAuth client secret | Keep confidential |
| `LASTFM_API_KEY` | Last.fm API key | Required for scrobbling |
| `LASTFM_SECRET` | Last.fm API shared secret | Keep confidential |

### Network Exposure and Authentication

This application has no user accounts. Access control depends entirely on who
can reach the port, so the server treats its bind address as a security
decision:

| Bind address | `API_TOKEN` | Behaviour |
|---|---|---|
| Loopback (`127.0.0.1`, `::1`) | unset | Starts with no authentication. The OS is the boundary. |
| Loopback | set | Token enforced. |
| Non-loopback (`0.0.0.0`, `::`, a LAN address) | unset | **Refuses to start.** |
| Any, with `REQUIRE_AUTH=true` | unset | **Refuses to start.** |

Set `REQUIRE_AUTH=true` when a reverse proxy publishes a loopback-bound
process — the bind address alone cannot reveal that exposure.

To expose the app on a LAN (e.g. the Raspberry Pi setup in the README):

```bash
API_TOKEN=$(openssl rand -hex 32)
```

Clients then send `Authorization: Bearer <token>` on every API request. Two
routes stay reachable without it, because a browser arriving by OAuth redirect
cannot send a header:

- `GET /health` — status only, no configuration detail
- `GET /api/v1/auth/discogs/callback` and `GET /api/v1/auth/lastfm/callback`

Those callbacks are not unprotected: each must match a single-use, 10-minute
transaction created by the authenticated request that started the sign-in.

**The token travels in plaintext.** This app speaks HTTP, and possession of a
bearer token alone grants full API access. A token makes LAN exposure
defensible; it does not make it safe on an untrusted network. Put TLS or an
authenticated reverse proxy in front of anything beyond a trusted home LAN, and
do not expose this app directly to the internet.

### Other Best Practices for Self-Hosting

1. **Strong encryption key**: Generate a random key (`openssl rand -hex 32`) for `ENCRYPTION_KEY`
2. **Strong API token**: Likewise for `API_TOKEN`; a minimum of 16 characters is enforced
3. **Keep dependencies updated**: Run `npm audit` regularly

### Data Storage

- All user data is stored in local JSON files under `data/` (gitignored)
- Credentials are encrypted before writing to disk
- Data files use schema versioning with automatic migrations
- Critical data writes use backup files (`.bak`) to prevent corruption

## Dependency Management

- `npm audit` is run as part of the CI pipeline
- Dependencies are reviewed before version bumps
- The project uses `package-lock.json` for reproducible builds
