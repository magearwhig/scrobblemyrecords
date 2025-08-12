import { test, expect } from '@playwright/test';

test.describe('Collection Browsing Flows', () => {
  test.beforeEach(async ({ page }) => {
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

    // Navigate to collection page
    await page.goto('/#collection');
  });

  test('should load collection when authenticated', async ({ page }) => {
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
                title: 'Test Album 1',
                artist: 'Test Artist 1',
                year: 2020,
                format: ['Vinyl'],
                label: ['Test Label'],
                cover_image: 'cover1.jpg',
                resource_url: 'https://api.discogs.com/releases/101',
              },
              date_added: '2023-01-01T00:00:00Z',
            },
            {
              id: 2,
              release: {
                id: 102,
                title: 'Test Album 2',
                artist: 'Test Artist 2',
                year: 2021,
                format: ['CD'],
                label: ['Test Label 2'],
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
    await expect(page.getByText('Test Album 1')).toBeVisible();
    await expect(page.getByText('Test Album 2')).toBeVisible();

    // Verify collection stats
    await expect(page.getByText('2 total items')).toBeVisible();
  });

  test('should show loading state while fetching collection', async ({
    page,
  }) => {
    // Mock slow collection response
    await page.route('**/api/v1/collection/testuser/all', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });

    // Verify loading state is shown
    await expect(page.getByText('Loading collection...')).toBeVisible();
  });

  test('should handle collection loading errors', async ({ page }) => {
    // Mock collection loading error
    await page.route('**/api/v1/collection/testuser/all', async route => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Failed to load collection' }),
      });
    });

    // Verify error message is displayed
    await expect(page.getByText('Failed to load collection')).toBeVisible();

    // Verify retry button is available
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
  });

  test('should allow searching the collection', async ({ page }) => {
    // Mock search results
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
                  title: 'Search Result Album',
                  artist: 'Search Artist',
                  year: 2020,
                  format: ['Vinyl'],
                  label: ['Test Label'],
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

    // Enter search query
    await page.getByPlaceholder('Search your collection...').fill('Search');
    await page.getByRole('button', { name: /Search/i }).click();

    // Verify search results
    await expect(page.getByText('Search Result Album')).toBeVisible();
    await expect(page.getByText('Page 1 of 1 (1 results)')).toBeVisible();
  });

  test('should handle search with no results', async ({ page }) => {
    // Mock empty search results
    await page.route(
      '**/api/v1/collection/testuser/search-paginated**',
      async route => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: [],
            pagination: {
              total: 0,
              pages: 0,
              page: 1,
              per_page: 50,
            },
          }),
        });
      }
    );

    // Enter search query
    await page
      .getByPlaceholder('Search your collection...')
      .fill('Nonexistent');
    await page.getByRole('button', { name: /Search/i }).click();

    // Verify no results message
    await expect(
      page.getByText('No results found for "Nonexistent"')
    ).toBeVisible();
  });

  test('should allow sorting collection', async ({ page }) => {
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
                title: 'Album A',
                artist: 'Artist A',
                year: 2020,
                format: ['Vinyl'],
                label: ['Test Label'],
                cover_image: 'cover1.jpg',
                resource_url: 'https://api.discogs.com/releases/101',
              },
              date_added: '2023-01-01T00:00:00Z',
            },
            {
              id: 2,
              release: {
                id: 102,
                title: 'Album B',
                artist: 'Artist B',
                year: 2021,
                format: ['CD'],
                label: ['Test Label 2'],
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
    await expect(page.getByText('Album A')).toBeVisible();

    // Change sort criteria
    await page.getByRole('combobox').selectOption('title');

    // Toggle sort order
    await page.getByRole('button', { name: /↓/ }).click();

    // Verify sort order changed
    await expect(page.getByRole('button', { name: /↑/ })).toBeVisible();
  });

  test('should allow selecting albums', async ({ page }) => {
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

    // Wait for collection to load
    await expect(page.getByText('Test Album')).toBeVisible();

    // Select an album
    await page
      .getByRole('button', { name: /Select/i })
      .first()
      .click();

    // Verify selection
    await expect(page.getByText('1 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: /Deselect/i })).toBeVisible();

    // Verify scrobble button appears
    await expect(
      page.getByRole('button', { name: /Scrobble Selected Albums/i })
    ).toBeVisible();
  });

  test('should allow selecting all albums', async ({ page }) => {
    // Mock collection data with multiple albums
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
                title: 'Album 1',
                artist: 'Artist 1',
                year: 2020,
                format: ['Vinyl'],
                label: ['Test Label'],
                cover_image: 'cover1.jpg',
                resource_url: 'https://api.discogs.com/releases/101',
              },
              date_added: '2023-01-01T00:00:00Z',
            },
            {
              id: 2,
              release: {
                id: 102,
                title: 'Album 2',
                artist: 'Artist 2',
                year: 2021,
                format: ['CD'],
                label: ['Test Label 2'],
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
    await expect(page.getByText('Album 1')).toBeVisible();
    await expect(page.getByText('Album 2')).toBeVisible();

    // Select all albums
    await page.getByRole('button', { name: /Select All/i }).click();

    // Verify all albums are selected
    await expect(page.getByText('2 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: /Deselect/i })).toHaveCount(
      2
    );
  });

  test('should navigate to scrobble page when scrobble button is clicked', async ({
    page,
  }) => {
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

    // Wait for collection to load
    await expect(page.getByText('Test Album')).toBeVisible();

    // Select an album
    await page
      .getByRole('button', { name: /Select/i })
      .first()
      .click();

    // Click scrobble button
    await page
      .getByRole('button', { name: /Scrobble Selected Albums/i })
      .click();

    // Verify navigation to scrobble page
    await expect(page).toHaveURL(/.*#scrobble/);
  });

  test('should handle pagination for large collections', async ({ page }) => {
    // Mock large collection data
    const largeCollection = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      release: {
        id: 100 + i,
        title: `Album ${i + 1}`,
        artist: `Artist ${i + 1}`,
        year: 2020 + i,
        format: ['Vinyl'],
        label: ['Test Label'],
        cover_image: 'cover.jpg',
        resource_url: `https://api.discogs.com/releases/${100 + i}`,
      },
      date_added: '2023-01-01T00:00:00Z',
    }));

    await page.route('**/api/v1/collection/testuser/all', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: largeCollection,
        }),
      });
    });

    // Wait for collection to load
    await expect(page.getByText('Album 1')).toBeVisible();

    // Verify pagination controls are present
    await expect(page.getByText('Page 1 of 3')).toBeVisible();
    await expect(page.getByRole('button', { name: /Next/i })).toBeVisible();

    // Navigate to next page
    await page.getByRole('button', { name: /Next/i }).click();

    // Verify we're on page 2
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
  });

  test('should allow viewing album details', async ({ page }) => {
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

    // Wait for collection to load
    await expect(page.getByText('Test Album')).toBeVisible();

    // Click view details button
    await page
      .getByRole('button', { name: /View Details/i })
      .first()
      .click();

    // Verify navigation to release details page
    await expect(page).toHaveURL(/.*#release-details/);
  });

  test('should handle cache management operations', async ({ page }) => {
    // Mock collection data
    await page.route('**/api/v1/collection/testuser/all', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });

    // Wait for collection to load
    await expect(page.getByText('No items in your collection')).toBeVisible();

    // Verify cache management buttons are present
    await expect(
      page.getByRole('button', { name: /Check for New Items/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Force Reload/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Clear Cache/i })
    ).toBeVisible();
  });

  test('should show cache status indicators', async ({ page }) => {
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

    // Wait for collection to load
    await expect(page.getByText('Using cached data')).toBeVisible();
  });

  test('should handle empty collection state', async ({ page }) => {
    // Mock empty collection
    await page.route('**/api/v1/collection/testuser/all', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });

    // Wait for empty state message
    await expect(page.getByText('No items in your collection')).toBeVisible();

    // Verify debug information is shown
    await expect(page.getByText(/Debug: entireCollection=0/)).toBeVisible();
  });
});
