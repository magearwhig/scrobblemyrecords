import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('app loads and shows header', async ({ page }) => {
    await page.goto('/');

    // Header is always visible
    await expect(
      page.getByRole('heading', { name: /Discogs to Last\.fm Scrobbler/i })
    ).toBeVisible();
    await expect(page.getByText('v1.0.0')).toBeVisible();
  });

  test('sidebar navigation is visible', async ({ page }) => {
    await page.goto('/');

    // Sidebar category headers (exact match to avoid ambiguity)
    await expect(
      page.locator('.nav-category-header', { hasText: 'Dashboard' })
    ).toBeVisible();
    await expect(
      page.locator('.nav-category-header', { hasText: 'Library' })
    ).toBeVisible();

    // Navigation items
    await expect(
      page.locator('.nav-link-label', { hasText: 'Home' })
    ).toBeVisible();
    await expect(
      page.locator('.nav-link-label', { hasText: 'Browse Collection' })
    ).toBeVisible();
    await expect(
      page.locator('.nav-link-label', { hasText: 'Wishlist' })
    ).toBeVisible();
    await expect(
      page.locator('.nav-link-label', { hasText: 'Discard Pile' })
    ).toBeVisible();
  });

  test('unauthenticated home page shows welcome message', async ({ page }) => {
    // This test only works on CI where there are no real credentials.
    // Locally the backend is authenticated so mocking browser requests has no effect.
    test.skip(!process.env.CI, 'Only runs on CI (no real auth credentials)');

    await page.goto('/');

    await expect(page.getByText('Welcome to RecordScrobbles')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Connect Accounts/i })
    ).toBeVisible();
  });

  test('settings page loads with connections tab', async ({ page }) => {
    await page.goto('/#settings');

    await expect(
      page.getByRole('heading', { name: /Settings/i }).first()
    ).toBeVisible();
    await expect(page.getByText('Account Connections')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Discogs', exact: true })
    ).toBeVisible();
  });

  test('settings page has connection buttons', async ({ page }) => {
    await page.goto('/#settings');

    await expect(
      page.getByRole('button', { name: /Connect to Discogs/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Connect to Last\.fm/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Clear All Authentication/i })
    ).toBeVisible();
  });

  test('navigating between pages works', async ({ page }) => {
    await page.goto('/');

    // Click Settings in sidebar (nav items use .nav-link, not <a role="link">)
    await page.locator('.nav-link-label', { hasText: 'Settings' }).click();
    await expect(page).toHaveURL(/#settings/);
    await expect(
      page.getByRole('heading', { name: /Settings/i }).first()
    ).toBeVisible();

    // Click Home in sidebar
    await page.locator('.nav-link-label', { hasText: 'Home' }).click();
    await expect(page).toHaveURL(/#home/);
  });

  test('backend health endpoint responds', async ({ page }) => {
    // On CI, BACKEND_PORT is set explicitly. Locally the port varies
    // per user's .env, so skip (other tests already verify the backend).
    test.skip(!process.env.CI, 'Backend port varies locally');

    const response = await page.request.get(
      `http://127.0.0.1:${process.env.BACKEND_PORT}/health`
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});
