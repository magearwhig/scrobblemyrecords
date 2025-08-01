import express, { Request, Response } from 'express';

import { AuthService } from '../services/authService';
import { DiscogsService } from '../services/discogsService';
import { LastFmService } from '../services/lastfmService';
import { FileStorage } from '../utils/fileStorage';

const router = express.Router();

// Initialize services
const fileStorage = new FileStorage();
const authService = new AuthService(fileStorage);
const discogsService = new DiscogsService(fileStorage, authService);
const lastfmService = new LastFmService(fileStorage, authService);

// Check authentication status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const settings = await authService.getUserSettings();

    res.json({
      success: true,
      data: {
        discogs: {
          authenticated: !!settings.discogs.token,
          username: settings.discogs.username,
        },
        lastfm: {
          authenticated: !!(
            settings.lastfm.apiKey && settings.lastfm.sessionKey
          ),
          username: settings.lastfm.username,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Discogs OAuth authentication - Get auth URL
router.get('/discogs/auth-url', async (req: Request, res: Response) => {
  try {
    const authUrl = await discogsService.getAuthUrl();

    res.json({
      success: true,
      data: { authUrl },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get Discogs auth URL',
    });
  }
});

// Discogs OAuth callback
router.get('/discogs/callback', async (req: Request, res: Response) => {
  try {
    console.log('Discogs callback received:', req.query);
    const { oauth_token, oauth_verifier } = req.query;

    if (!oauth_token || !oauth_verifier) {
      console.log('Missing parameters in callback');
      return res.status(400).send(`
        <html><body>
          <h2>Authentication Error</h2>
          <p>Missing required parameters. Got: ${JSON.stringify(req.query)}</p>
          <script>window.close();</script>
        </body></html>
      `);
    }

    console.log('Processing callback with:', { oauth_token, oauth_verifier });
    const result = await discogsService.handleCallback(
      oauth_token as string,
      oauth_verifier as string
    );
    console.log('Callback result:', result);

    res.send(`
      <html><body>
        <h2>Discogs Authentication Successful!</h2>
        <p>Welcome ${result.username}! You can close this window.</p>
        <script>
          localStorage.setItem('discogs_auth_success', 'true');
          window.close();
        </script>
      </body></html>
    `);
  } catch (error) {
    console.error('Discogs callback error:', error);
    res.status(500).send(`
      <html><body>
        <h2>Authentication Error</h2>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <script>window.close();</script>
      </body></html>
    `);
  }
});

// Discogs authentication - Personal Access Token (legacy)
router.post('/discogs/token', async (req: Request, res: Response) => {
  try {
    const { token, username } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    // Validate token format
    if (!token.startsWith('Discogs token=')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token format. Should start with "Discogs token="',
      });
    }

    await authService.setDiscogsToken(token, username);

    res.json({
      success: true,
      data: { message: 'Discogs token saved successfully' },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test Discogs connection
router.get('/discogs/test', async (req: Request, res: Response) => {
  try {
    const profile = await discogsService.getUserProfile();

    res.json({
      success: true,
      data: {
        username: profile.username,
        id: profile.id,
        resource_url: profile.resource_url,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    });
  }
});

// Last.fm authentication - Get auth URL
router.get('/lastfm/auth-url', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.query;

    // Use provided API key or fall back to environment variable
    const finalApiKey = (apiKey as string) || process.env.LASTFM_API_KEY;

    if (!finalApiKey) {
      return res.status(400).json({
        success: false,
        error:
          'API key is required (either provide one or set LASTFM_API_KEY environment variable)',
      });
    }

    // Save API key
    const settings = await authService.getUserSettings();
    settings.lastfm.apiKey = finalApiKey;
    await authService.saveUserSettings(settings);

    const authUrl = await lastfmService.getAuthUrl();

    res.json({
      success: true,
      data: { authUrl },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Last.fm authentication - Handle callback (GET from Last.fm redirect)
router.get('/lastfm/callback', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send(`
        <html><body>
          <h2>Last.fm Authentication Error</h2>
          <p>Missing token parameter. Got: ${JSON.stringify(req.query)}</p>
          <script>window.close();</script>
        </body></html>
      `);
    }

    console.log('Last.fm callback received token:', token);
    const { sessionKey, username } = await lastfmService.getSession(
      token as string
    );

    // Get existing settings to preserve API key
    const settings = await authService.getUserSettings();
    await authService.setLastFmCredentials(
      settings.lastfm.apiKey || '',
      sessionKey,
      username
    );

    res.send(`
      <html><body>
        <h2>Last.fm Authentication Successful!</h2>
        <p>Welcome ${username}! You can close this window.</p>
        <script>
          localStorage.setItem('lastfm_auth_success', 'true');
          window.close();
        </script>
      </body></html>
    `);
  } catch (error) {
    console.error('Last.fm callback error:', error);
    res.status(500).send(`
      <html><body>
        <h2>Last.fm Authentication Error</h2>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <script>window.close();</script>
      </body></html>
    `);
  }
});

// Last.fm authentication - Handle callback (legacy POST method)
router.post('/lastfm/callback', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    const { sessionKey, username } = await lastfmService.getSession(token);

    // Get existing settings to preserve API key
    const settings = await authService.getUserSettings();
    await authService.setLastFmCredentials(
      settings.lastfm.apiKey || '',
      sessionKey,
      username
    );

    res.json({
      success: true,
      data: {
        message: 'Last.fm authentication successful',
        username,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    });
  }
});

// Test Last.fm session creation (for debugging)
router.get(
  '/lastfm/test-session/:token',
  async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      console.log('Testing Last.fm session creation with token:', token);

      const { sessionKey, username } = await lastfmService.getSession(token);

      res.json({
        success: true,
        data: {
          sessionKey: sessionKey ? 'present' : 'missing',
          username,
        },
      });
    } catch (error) {
      console.error('Last.fm session test error:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Session creation failed',
      });
    }
  }
);

// Test Last.fm connection
router.get('/lastfm/test', async (req: Request, res: Response) => {
  try {
    const result = await lastfmService.testConnection();

    res.json({
      success: result.success,
      data: {
        message: result.message,
        userInfo: result.userInfo,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
    });
  }
});

// Get Last.fm session key (for debugging)
router.get('/lastfm/session-key', async (req: Request, res: Response) => {
  try {
    const credentials = await authService.getLastFmCredentials();

    if (!credentials.sessionKey) {
      return res.status(400).json({
        success: false,
        error: 'No Last.fm session key found. Please authenticate first.',
      });
    }

    res.json({
      success: true,
      data: {
        sessionKey: credentials.sessionKey,
        username: credentials.username,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to get session key',
    });
  }
});

// Get Last.fm recent scrobbles
router.get('/lastfm/recent-scrobbles', async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const scrobbles = await lastfmService.getRecentScrobbles(
      limit ? parseInt(limit as string) : 10
    );

    res.json({
      success: true,
      data: scrobbles,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get recent scrobbles',
    });
  }
});

// Get Last.fm top tracks
router.get('/lastfm/top-tracks', async (req: Request, res: Response) => {
  try {
    const { period, limit } = req.query;
    const tracks = await lastfmService.getTopTracks(
      (period as any) || '7day',
      limit ? parseInt(limit as string) : 10
    );

    res.json({
      success: true,
      data: tracks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to get top tracks',
    });
  }
});

// Get Last.fm top artists
router.get('/lastfm/top-artists', async (req: Request, res: Response) => {
  try {
    const { period, limit } = req.query;
    const artists = await lastfmService.getTopArtists(
      (period as any) || '7day',
      limit ? parseInt(limit as string) : 10
    );

    res.json({
      success: true,
      data: artists,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to get top artists',
    });
  }
});

// Clear all authentication data
router.post('/clear', async (req: Request, res: Response) => {
  try {
    await authService.clearTokens();

    res.json({
      success: true,
      data: { message: 'All authentication data cleared' },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
