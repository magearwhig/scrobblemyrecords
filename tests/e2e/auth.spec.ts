import { test, expect } from '@playwright/test';

test.describe('Authentication Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the home page before each test
    await page.goto('/');
  });

  test('should show authentication required message when not authenticated', async ({
    page,
  }) => {
    // Check that the authentication required message is displayed
    await expect(
      page.getByText(/Please authenticate with Discogs/)
    ).toBeVisible();
    await expect(
      page.getByText(/Please authenticate with Last.fm/)
    ).toBeVisible();

    // Verify that authentication buttons are present
    await expect(
      page.getByRole('button', { name: /Authenticate with Discogs/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Authenticate with Last.fm/i })
    ).toBeVisible();
  });

  test('should navigate to setup page when setup button is clicked', async ({
    page,
  }) => {
    // Click the setup button
    await page.getByRole('button', { name: /Setup/i }).click();

    // Verify we're on the setup page
    await expect(page).toHaveURL(/.*#setup/);
    await expect(page.getByText(/Setup/i)).toBeVisible();
  });

  test('should show authentication status correctly', async ({ page }) => {
    // Check that authentication status indicators are present
    await expect(
      page.getByText(/Discogs Authentication Status/i)
    ).toBeVisible();
    await expect(
      page.getByText(/Last.fm Authentication Status/i)
    ).toBeVisible();

    // Verify that status shows as not authenticated
    await expect(page.getByText(/Not authenticated/i)).toBeVisible();
  });

  test('should handle authentication error states', async ({ page }) => {
    // Mock authentication failure by intercepting API calls
    await page.route('**/api/v1/auth/discogs/test', async route => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({ error: 'Authentication failed' }),
      });
    });

    await page.route('**/api/v1/auth/lastfm/test', async route => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({ error: 'Authentication failed' }),
      });
    });

    // Navigate to setup page
    await page.getByRole('button', { name: /Setup/i }).click();

    // Try to authenticate (this should fail due to our mock)
    await page
      .getByRole('button', { name: /Test Discogs Connection/i })
      .click();

    // Verify error message is displayed
    await expect(page.getByText(/Authentication failed/i)).toBeVisible();
  });

  test('should allow clearing authentication', async ({ page }) => {
    // Navigate to setup page
    await page.getByRole('button', { name: /Setup/i }).click();

    // Check that clear authentication button is present
    await expect(
      page.getByRole('button', { name: /Clear Authentication/i })
    ).toBeVisible();

    // Click clear authentication
    await page.getByRole('button', { name: /Clear Authentication/i }).click();

    // Verify confirmation dialog or success message
    await expect(page.getByText(/Authentication cleared/i)).toBeVisible();
  });

  test('should show proper loading states during authentication', async ({
    page,
  }) => {
    // Mock slow authentication response
    await page.route('**/api/v1/auth/discogs/test', async route => {
      // Delay the response to simulate loading
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      });
    });

    // Navigate to setup page
    await page.getByRole('button', { name: /Setup/i }).click();

    // Click test connection button
    await page
      .getByRole('button', { name: /Test Discogs Connection/i })
      .click();

    // Verify loading state is shown
    await expect(page.getByText(/Testing connection/i)).toBeVisible();
    await expect(page.getByText(/Loading/i)).toBeVisible();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network error
    await page.route('**/api/v1/auth/discogs/test', async route => {
      await route.abort('failed');
    });

    // Navigate to setup page
    await page.getByRole('button', { name: /Setup/i }).click();

    // Try to authenticate
    await page
      .getByRole('button', { name: /Test Discogs Connection/i })
      .click();

    // Verify error message is displayed
    await expect(page.getByText(/Unable to connect to server/i)).toBeVisible();
  });

  test('should validate input fields in setup form', async ({ page }) => {
    // Navigate to setup page
    await page.getByRole('button', { name: /Setup/i }).click();

    // Try to submit empty form
    await page.getByRole('button', { name: /Save Settings/i }).click();

    // Verify validation messages
    await expect(
      page.getByText(/Please enter a valid Discogs token/i)
    ).toBeVisible();
  });

  test('should show authentication success states', async ({ page }) => {
    // Mock successful authentication
    await page.route('**/api/v1/auth/discogs/test', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          username: 'testuser',
          authenticated: true,
        }),
      });
    });

    await page.route('**/api/v1/auth/lastfm/test', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          username: 'testuser',
          authenticated: true,
        }),
      });
    });

    // Navigate to setup page
    await page.getByRole('button', { name: /Setup/i }).click();

    // Test connections
    await page
      .getByRole('button', { name: /Test Discogs Connection/i })
      .click();
    await page
      .getByRole('button', { name: /Test Last.fm Connection/i })
      .click();

    // Verify success messages
    await expect(page.getByText(/Connection successful/i)).toBeVisible();
    await expect(page.getByText(/testuser/i)).toBeVisible();
  });

  test('should handle OAuth flow initiation', async ({ page }) => {
    // Mock OAuth URL response
    await page.route('**/api/v1/auth/discogs/auth-url', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: { authUrl: 'https://discogs.com/oauth/authorize?token=test' },
        }),
      });
    });

    // Navigate to setup page
    await page.getByRole('button', { name: /Setup/i }).click();

    // Click OAuth button
    await page.getByRole('button', { name: /Get OAuth URL/i }).click();

    // Verify OAuth URL is displayed or opened
    await expect(
      page.getByText(/https:\/\/discogs\.com\/oauth\/authorize/i)
    ).toBeVisible();
  });

  test('should handle Last.fm OAuth callback', async ({ page }) => {
    // Mock Last.fm OAuth callback
    await page.route('**/api/v1/auth/lastfm/callback', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: { username: 'testuser' },
        }),
      });
    });

    // Navigate to setup page
    await page.getByRole('button', { name: /Setup/i }).click();

    // Simulate OAuth callback
    await page.goto('/?token=test_token');

    // Verify user is authenticated
    await expect(page.getByText(/testuser/i)).toBeVisible();
  });

  test('should persist authentication state', async ({ page }) => {
    // Mock authenticated state
    await page.addInitScript(() => {
      localStorage.setItem(
        'authStatus',
        JSON.stringify({
          discogs: { authenticated: true, username: 'testuser' },
          lastfm: { authenticated: true, username: 'testuser' },
        })
      );
    });

    // Reload page
    await page.reload();

    // Verify authenticated state is maintained
    await expect(page.getByText(/testuser/i)).toBeVisible();
    await expect(page.getByText(/Authenticated/i)).toBeVisible();
  });
});
