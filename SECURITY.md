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

### Best Practices for Self-Hosting

1. **Bind to localhost**: The server should bind to `127.0.0.1`, not `0.0.0.0`
2. **Strong encryption key**: Generate a random key (`openssl rand -hex 32`) for `ENCRYPTION_KEY`
3. **Keep dependencies updated**: Run `npm audit` regularly
4. **Do not expose to the internet**: This app has no user authentication -- it is designed for local use only

### Data Storage

- All user data is stored in local JSON files under `data/` (gitignored)
- Credentials are encrypted before writing to disk
- Data files use schema versioning with automatic migrations
- Critical data writes use backup files (`.bak`) to prevent corruption

## Dependency Management

- `npm audit` is run as part of the CI pipeline
- Dependencies are reviewed before version bumps
- The project uses `package-lock.json` for reproducible builds
