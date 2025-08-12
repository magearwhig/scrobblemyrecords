import { test, expect } from '@playwright/test';

test.describe('Complete User Workflow', () => {
  test('should complete full user journey from authentication to scrobbling', async ({
    page,
  }) => {
    // Step 1: Start at home page and verify authentication required
    await page.goto('/');
    await expect(
      page.getByText(/Please authenticate with Discogs/)
    ).toBeVisible();
    await expect(
      page.getByText(/Please authenticate with Last.fm/)
    ).toBeVisible();

    // Step 2: Navigate to setup page
    await page.getByRole('button', { name: /Setup/i }).click();
    await expect(page).toHaveURL(/.*#setup/);

    // Step 3: Mock successful authentication
    await page.addInitScript(() => {
      localStorage.setItem(
        'authStatus',
        JSON.stringify({
          discogs: { authenticated: true, username: 'testuser' },
          lastfm: { authenticated: true, username: 'testuser' },
        })
      );
    });

    // Step 4: Navigate to collection page
    await page.goto('/#collection');

    // Mock collection data
    await page.route('**/api/v1/collection/testuser/all', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              release: {
                id: 101,
                title: 'Test Album',
                artist: 'Test Artist',
                year: 2020,
                format: ['Vinyl'],
                label: ['Test Label'],
                cover_image: 'cover1.jpg',
                resource_url: 'https://api.discogs.com/releases/101',
              },
              date_added: '2023-01-01T00:00:00Z',
            },
          ],
        }),
      });
    });

    // Step 5: Verify collection loads
    await expect(page.getByText('Test Album')).toBeVisible();
    await expect(page.getByText('1 total items')).toBeVisible();

    // Step 6: Select an album
    await page
      .getByRole('button', { name: /Select/i })
      .first()
      .click();
    await expect(page.getByText('1 selected')).toBeVisible();

    // Step 7: Navigate to scrobble page
    await page
      .getByRole('button', { name: /Scrobble Selected Albums/i })
      .click();
    await expect(page).toHaveURL(/.*#scrobble/);

    // Step 8: Navigate back to collection and view details
    await page.goto('/#collection');
    await page
      .getByRole('button', { name: /View Details/i })
      .first()
      .click();
    await expect(page).toHaveURL(/.*#release-details/);

    // Step 9: Verify release details page loads
    await expect(page.getByText('Test Album')).toBeVisible();
    await expect(page.getByText('Test Artist')).toBeVisible();

    // Step 10: Mock release details with tracks
    const mockRelease = {
      id: 101,
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2020,
      format: ['Vinyl'],
      label: ['Test Label'],
      cover_image: 'cover1.jpg',
      resource_url: 'https://api.discogs.com/releases/101',
      tracklist: [
        { position: 'A1', title: 'Track 1', duration: '3:30' },
        { position: 'A2', title: 'Track 2', duration: '4:15' },
      ],
    };

    await page.addInitScript(release => {
      localStorage.setItem('selectedRelease', JSON.stringify(release));
    }, mockRelease);

    // Step 11: Reload page to get track data
    await page.reload();
    await expect(page.getByText('Track 1')).toBeVisible();
    await expect(page.getByText('Track 2')).toBeVisible();

    // Step 12: Select tracks
    await page.getByRole('checkbox', { name: /Track 1/i }).check();
    await page.getByRole('checkbox', { name: /Track 2/i }).check();

    // Step 13: Mock scrobble preparation and execution
    await page.route('**/api/v1/scrobble/prepare-from-release', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: {
            tracks: [
              {
                title: 'Track 1',
                artist: 'Test Artist',
                album: 'Test Album',
                timestamp: Date.now(),
              },
              {
                title: 'Track 2',
                artist: 'Test Artist',
                album: 'Test Album',
                timestamp: Date.now() + 210000,
              },
            ],
            release: mockRelease,
            startTime: Date.now(),
            totalDuration: 445,
          },
        }),
      });
    });

    await page.route('**/api/v1/scrobble/batch', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: {
            results: {
              success: 2,
              failed: 0,
              ignored: 0,
              errors: [],
              sessionId: 'test-session-123',
            },
          },
        }),
      });
    });

    // Step 14: Execute scrobble
    await page
      .getByRole('button', { name: /Scrobble Selected Tracks/i })
      .click();

    // Step 15: Verify scrobble results
    await expect(page.getByText(/2 successful/i)).toBeVisible();
    await expect(page.getByText(/0 failed/i)).toBeVisible();

    // Step 16: Navigate back to collection
    await page.getByRole('button', { name: /Back to Collection/i }).click();
    await expect(page).toHaveURL(/.*#collection/);

    // Step 17: Verify we're back at collection
    await expect(page.getByText('Test Album')).toBeVisible();
  });

  test('should handle error scenarios gracefully', async ({ page }) => {
    // Step 1: Start with authentication failure
    await page.goto('/');
    await page.getByRole('button', { name: /Setup/i }).click();

    // Mock authentication failure
    await page.route('**/api/v1/auth/discogs/test', async route => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({ error: 'Authentication failed' }),
      });
    });

    await page
      .getByRole('button', { name: /Test Discogs Connection/i })
      .click();
    await expect(page.getByText('Authentication failed')).toBeVisible();

    // Step 2: Mock successful authentication and test collection loading error
    await page.addInitScript(() => {
      localStorage.setItem(
        'authStatus',
        JSON.stringify({
          discogs: { authenticated: true, username: 'testuser' },
          lastfm: { authenticated: true, username: 'testuser' },
        })
      );
    });

    await page.goto('/#collection');

    // Mock collection loading error
    await page.route('**/api/v1/collection/testuser/all', async route => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Failed to load collection' }),
      });
    });

    await expect(page.getByText('Failed to load collection')).toBeVisible();

    // Step 3: Test retry functionality
    await page.route('**/api/v1/collection/testuser/all', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });

    await page.getByRole('button', { name: /Retry/i }).click();
    await expect(page.getByText('No items in your collection')).toBeVisible();
  });

  test('should handle search and filtering workflows', async ({ page }) => {
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

    await page.goto('/#collection');

    // Mock collection data
    await page.route('**/api/v1/collection/testuser/all', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              release: {
                id: 101,
                title: 'Rock Album',
                artist: 'Rock Artist',
                year: 2020,
                format: ['Vinyl'],
                label: ['Rock Label'],
                cover_image: 'cover1.jpg',
                resource_url: 'https://api.discogs.com/releases/101',
              },
              date_added: '2023-01-01T00:00:00Z',
            },
            {
              id: 2,
              release: {
                id: 102,
                title: 'Jazz Album',
                artist: 'Jazz Artist',
                year: 2021,
                format: ['CD'],
                label: ['Jazz Label'],
                cover_image: 'cover2.jpg',
                resource_url: 'https://api.discogs.com/releases/102',
              },
              date_added: '2023-01-02T00:00:00Z',
            },
          ],
        }),
      });
    });

    // Wait for collection to load
    await expect(page.getByText('Rock Album')).toBeVisible();
    await expect(page.getByText('Jazz Album')).toBeVisible();

    // Test search functionality
    await page.route(
      '**/api/v1/collection/testuser/search-paginated**',
      async route => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: [
              {
                id: 1,
                release: {
                  id: 101,
                  title: 'Rock Album',
                  artist: 'Rock Artist',
                  year: 2020,
                  format: ['Vinyl'],
                  label: ['Rock Label'],
                  cover_image: 'cover1.jpg',
                  resource_url: 'https://api.discogs.com/releases/101',
                },
                date_added: '2023-01-01T00:00:00Z',
              },
            ],
            pagination: {
              total: 1,
              pages: 1,
              page: 1,
              per_page: 50,
            },
          }),
        });
      }
    );

    await page.getByPlaceholder('Search your collection...').fill('Rock');
    await page.getByRole('button', { name: /Search/i }).click();

    await expect(page.getByText('Rock Album')).toBeVisible();
    await expect(page.getByText('Jazz Album')).not.toBeVisible();

    // Test sorting
    await page.getByRole('combobox').selectOption('title');
    await page.getByRole('button', { name: /↓/ }).click();

    // Verify sort order changed
    await expect(page.getByRole('button', { name: /↑/ })).toBeVisible();
  });

  test('should handle cache management workflows', async ({ page }) => {
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

    await page.goto('/#collection');

    // Mock collection data with cache status
    await page.route('**/api/v1/collection/testuser/all', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [],
          cacheStatus: 'cached',
          message: 'Using cached data',
        }),
      });
    });

    // Wait for cache status to be displayed
    await expect(page.getByText('Using cached data')).toBeVisible();

    // Test cache management buttons
    await expect(
      page.getByRole('button', { name: /Check for New Items/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Force Reload/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Clear Cache/i })
    ).toBeVisible();

    // Mock new items found
    await page.route('**/api/v1/collection/testuser/check-new', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: { newItemsCount: 5 },
        }),
      });
    });

    await page.getByRole('button', { name: /Check for New Items/i }).click();
    await expect(page.getByText(/Found 5 new items/i)).toBeVisible();
  });
});
