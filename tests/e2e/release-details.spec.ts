import { test, expect } from '@playwright/test';

test.describe('Release Details and Scrobbling Flows', () => {
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
  });

  test('should display release details when navigating from collection', async ({
    page,
  }) => {
    // Mock release details
    const mockRelease = {
      id: 101,
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2020,
      format: ['Vinyl', 'LP'],
      label: ['Test Label'],
      cover_image: 'cover1.jpg',
      resource_url: 'https://api.discogs.com/releases/101',
      tracklist: [
        { position: 'A1', title: 'Track 1', duration: '3:30' },
        { position: 'A2', title: 'Track 2', duration: '4:15' },
        { position: 'B1', title: 'Track 3', duration: '3:45' },
        { position: 'B2', title: 'Track 4', duration: '5:20' },
      ],
    };

    // Set release in localStorage
    await page.addInitScript(release => {
      localStorage.setItem('selectedRelease', JSON.stringify(release));
    }, mockRelease);

    // Navigate to release details page
    await page.goto('/#release-details');

    // Verify release details are displayed
    await expect(page.getByText('Test Album')).toBeVisible();
    await expect(page.getByText('Test Artist')).toBeVisible();
    await expect(page.getByText('2020')).toBeVisible();
    await expect(page.getByText('Vinyl, LP')).toBeVisible();
    await expect(page.getByText('Test Label')).toBeVisible();

    // Verify tracks are displayed
    await expect(page.getByText('Track 1')).toBeVisible();
    await expect(page.getByText('Track 2')).toBeVisible();
    await expect(page.getByText('Track 3')).toBeVisible();
    await expect(page.getByText('Track 4')).toBeVisible();
  });

  test('should show error when no release data is found', async ({ page }) => {
    // Navigate to release details page without setting release data
    await page.goto('/#release-details');

    // Verify error message is displayed
    await expect(
      page.getByText(
        'No release data found. Please go back and select an album.'
      )
    ).toBeVisible();
  });

  test('should allow selecting individual tracks', async ({ page }) => {
    // Mock release details
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

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for tracks to load
    await expect(page.getByText('Track 1')).toBeVisible();

    // Select individual tracks
    await page.getByRole('checkbox', { name: /Track 1/i }).check();
    await page.getByRole('checkbox', { name: /Track 2/i }).check();

    // Verify tracks are selected
    await expect(
      page.getByRole('checkbox', { name: /Track 1/i })
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: /Track 2/i })
    ).toBeChecked();
  });

  test('should allow selecting all tracks', async ({ page }) => {
    // Mock release details
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

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for tracks to load
    await expect(page.getByText('Track 1')).toBeVisible();

    // Select all tracks
    await page.getByRole('button', { name: /Select All/i }).click();

    // Verify all tracks are selected
    await expect(
      page.getByRole('checkbox', { name: /Track 1/i })
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: /Track 2/i })
    ).toBeChecked();
  });

  test('should allow filtering tracks', async ({ page }) => {
    // Mock release details with many tracks
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
        { position: 'A1', title: 'Rock Track 1', duration: '3:30' },
        { position: 'A2', title: 'Jazz Track 2', duration: '4:15' },
        { position: 'B1', title: 'Rock Track 3', duration: '3:45' },
        { position: 'B2', title: 'Jazz Track 4', duration: '5:20' },
      ],
    };

    await page.addInitScript(release => {
      localStorage.setItem('selectedRelease', JSON.stringify(release));
    }, mockRelease);

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for tracks to load
    await expect(page.getByText('Rock Track 1')).toBeVisible();

    // Filter tracks by search term
    await page.getByPlaceholder('Filter tracks...').fill('Rock');

    // Verify only rock tracks are visible
    await expect(page.getByText('Rock Track 1')).toBeVisible();
    await expect(page.getByText('Rock Track 3')).toBeVisible();
    await expect(page.getByText('Jazz Track 2')).not.toBeVisible();
    await expect(page.getByText('Jazz Track 4')).not.toBeVisible();
  });

  test('should show scrobble button when tracks are selected', async ({
    page,
  }) => {
    // Mock release details
    const mockRelease = {
      id: 101,
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2020,
      format: ['Vinyl'],
      label: ['Test Label'],
      cover_image: 'cover1.jpg',
      resource_url: 'https://api.discogs.com/releases/101',
      tracklist: [{ position: 'A1', title: 'Track 1', duration: '3:30' }],
    };

    await page.addInitScript(release => {
      localStorage.setItem('selectedRelease', JSON.stringify(release));
    }, mockRelease);

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for tracks to load
    await expect(page.getByText('Track 1')).toBeVisible();

    // Select a track
    await page.getByRole('checkbox', { name: /Track 1/i }).check();

    // Verify scrobble button appears
    await expect(
      page.getByRole('button', { name: /Scrobble Selected Tracks/i })
    ).toBeVisible();
  });

  test('should handle scrobbling process', async ({ page }) => {
    // Mock release details
    const mockRelease = {
      id: 101,
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2020,
      format: ['Vinyl'],
      label: ['Test Label'],
      cover_image: 'cover1.jpg',
      resource_url: 'https://api.discogs.com/releases/101',
      tracklist: [{ position: 'A1', title: 'Track 1', duration: '3:30' }],
    };

    await page.addInitScript(release => {
      localStorage.setItem('selectedRelease', JSON.stringify(release));
    }, mockRelease);

    // Mock scrobble preparation
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
            ],
            release: mockRelease,
            startTime: Date.now(),
            totalDuration: 210,
          },
        }),
      });
    });

    // Mock scrobble batch
    await page.route('**/api/v1/scrobble/batch', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: {
            results: {
              success: 1,
              failed: 0,
              ignored: 0,
              errors: [],
              sessionId: 'test-session-123',
            },
          },
        }),
      });
    });

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for tracks to load
    await expect(page.getByText('Track 1')).toBeVisible();

    // Select a track
    await page.getByRole('checkbox', { name: /Track 1/i }).check();

    // Click scrobble button
    await page
      .getByRole('button', { name: /Scrobble Selected Tracks/i })
      .click();

    // Verify scrobbling progress is shown
    await expect(page.getByText(/Scrobbling/i)).toBeVisible();
  });

  test('should show scrobble results', async ({ page }) => {
    // Mock release details
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

    // Mock scrobble results
    await page.route('**/api/v1/scrobble/batch', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: {
            results: {
              success: 1,
              failed: 1,
              ignored: 0,
              errors: ['Track 2 failed to scrobble'],
              sessionId: 'test-session-123',
            },
          },
        }),
      });
    });

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for tracks to load
    await expect(page.getByText('Track 1')).toBeVisible();

    // Select tracks
    await page.getByRole('checkbox', { name: /Track 1/i }).check();
    await page.getByRole('checkbox', { name: /Track 2/i }).check();

    // Click scrobble button
    await page
      .getByRole('button', { name: /Scrobble Selected Tracks/i })
      .click();

    // Verify scrobble results are shown
    await expect(page.getByText(/1 successful/i)).toBeVisible();
    await expect(page.getByText(/1 failed/i)).toBeVisible();
    await expect(page.getByText(/Track 2 failed to scrobble/i)).toBeVisible();
  });

  test('should handle Last.fm connection testing', async ({ page }) => {
    // Mock release details
    const mockRelease = {
      id: 101,
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2020,
      format: ['Vinyl'],
      label: ['Test Label'],
      cover_image: 'cover1.jpg',
      resource_url: 'https://api.discogs.com/releases/101',
      tracklist: [{ position: 'A1', title: 'Track 1', duration: '3:30' }],
    };

    await page.addInitScript(release => {
      localStorage.setItem('selectedRelease', JSON.stringify(release));
    }, mockRelease);

    // Mock Last.fm connection test
    await page.route('**/api/v1/auth/lastfm/test', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          username: 'testuser',
        }),
      });
    });

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for page to load
    await expect(page.getByText('Test Album')).toBeVisible();

    // Test Last.fm connection
    await page
      .getByRole('button', { name: /Test Last.fm Connection/i })
      .click();

    // Verify connection success
    await expect(page.getByText(/Connection successful/i)).toBeVisible();
    await expect(page.getByText(/testuser/i)).toBeVisible();
  });

  test('should handle Last.fm connection failure', async ({ page }) => {
    // Mock release details
    const mockRelease = {
      id: 101,
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2020,
      format: ['Vinyl'],
      label: ['Test Label'],
      cover_image: 'cover1.jpg',
      resource_url: 'https://api.discogs.com/releases/101',
      tracklist: [{ position: 'A1', title: 'Track 1', duration: '3:30' }],
    };

    await page.addInitScript(release => {
      localStorage.setItem('selectedRelease', JSON.stringify(release));
    }, mockRelease);

    // Mock Last.fm connection failure
    await page.route('**/api/v1/auth/lastfm/test', async route => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({
          error: 'Last.fm authentication failed',
        }),
      });
    });

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for page to load
    await expect(page.getByText('Test Album')).toBeVisible();

    // Test Last.fm connection
    await page
      .getByRole('button', { name: /Test Last.fm Connection/i })
      .click();

    // Verify connection failure
    await expect(
      page.getByText(/Last.fm authentication failed/i)
    ).toBeVisible();
  });

  test('should show scrobble progress during batch scrobbling', async ({
    page,
  }) => {
    // Mock release details
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
        { position: 'B1', title: 'Track 3', duration: '3:45' },
      ],
    };

    await page.addInitScript(release => {
      localStorage.setItem('selectedRelease', JSON.stringify(release));
    }, mockRelease);

    // Mock scrobble progress
    await page.route('**/api/v1/scrobble/progress/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: {
            sessionId: 'test-session-123',
            status: 'in-progress',
            progress: {
              current: 2,
              total: 3,
              success: 1,
              failed: 0,
              ignored: 1,
            },
          },
        }),
      });
    });

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for tracks to load
    await expect(page.getByText('Track 1')).toBeVisible();

    // Select all tracks
    await page.getByRole('button', { name: /Select All/i }).click();

    // Click scrobble button
    await page
      .getByRole('button', { name: /Scrobble Selected Tracks/i })
      .click();

    // Verify progress is shown
    await expect(page.getByText(/2 of 3 tracks processed/i)).toBeVisible();
    await expect(page.getByText(/1 successful/i)).toBeVisible();
    await expect(page.getByText(/1 ignored/i)).toBeVisible();
  });

  test('should handle scrobble session errors', async ({ page }) => {
    // Mock release details
    const mockRelease = {
      id: 101,
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2020,
      format: ['Vinyl'],
      label: ['Test Label'],
      cover_image: 'cover1.jpg',
      resource_url: 'https://api.discogs.com/releases/101',
      tracklist: [{ position: 'A1', title: 'Track 1', duration: '3:30' }],
    };

    await page.addInitScript(release => {
      localStorage.setItem('selectedRelease', JSON.stringify(release));
    }, mockRelease);

    // Mock scrobble error
    await page.route('**/api/v1/scrobble/batch', async route => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({
          error: 'Scrobble session failed',
        }),
      });
    });

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for tracks to load
    await expect(page.getByText('Track 1')).toBeVisible();

    // Select a track
    await page.getByRole('checkbox', { name: /Track 1/i }).check();

    // Click scrobble button
    await page
      .getByRole('button', { name: /Scrobble Selected Tracks/i })
      .click();

    // Verify error is shown
    await expect(page.getByText(/Scrobble session failed/i)).toBeVisible();
  });

  test('should allow navigating back to collection', async ({ page }) => {
    // Mock release details
    const mockRelease = {
      id: 101,
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2020,
      format: ['Vinyl'],
      label: ['Test Label'],
      cover_image: 'cover1.jpg',
      resource_url: 'https://api.discogs.com/releases/101',
      tracklist: [{ position: 'A1', title: 'Track 1', duration: '3:30' }],
    };

    await page.addInitScript(release => {
      localStorage.setItem('selectedRelease', JSON.stringify(release));
    }, mockRelease);

    // Navigate to release details page
    await page.goto('/#release-details');

    // Wait for page to load
    await expect(page.getByText('Test Album')).toBeVisible();

    // Click back button
    await page.getByRole('button', { name: /Back to Collection/i }).click();

    // Verify navigation back to collection
    await expect(page).toHaveURL(/.*#collection/);
  });

  test('should handle invalid release data gracefully', async ({ page }) => {
    // Set invalid release data
    await page.addInitScript(() => {
      localStorage.setItem('selectedRelease', 'invalid-json');
    });

    // Navigate to release details page
    await page.goto('/#release-details');

    // Verify error message is displayed
    await expect(page.getByText(/Invalid release data/i)).toBeVisible();
  });
});
