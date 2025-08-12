# End-to-End Tests

This directory contains comprehensive end-to-end tests for the recordscrobbles application using Playwright.

## Overview

The e2e tests cover the critical user workflows:

1. **Authentication Flows** (`auth.spec.ts`)
   - Discogs and Last.fm authentication
   - OAuth flow initiation and callbacks
   - Error handling and loading states
   - Authentication state persistence

2. **Collection Browsing Flows** (`collection.spec.ts`)
   - Collection loading and display
   - Search functionality
   - Sorting and filtering
   - Album selection and pagination
   - Cache management operations

3. **Release Details and Scrobbling Flows** (`release-details.spec.ts`)
   - Release details display
   - Track selection and filtering
   - Scrobbling process and progress
   - Last.fm connection testing
   - Error handling for scrobbling

4. **Complete User Workflow** (`test-runner.spec.ts`)
   - Full user journey from authentication to scrobbling
   - Error scenario handling
   - Search and filtering workflows
   - Cache management workflows

## Running the Tests

### Prerequisites

1. Install Playwright browsers:
   ```bash
   npx playwright install
   ```

2. Ensure the development server can be started:
   ```bash
   npm run dev:app
   ```

### Test Commands

```bash
# Run all e2e tests
npm run test:e2e

# Run tests with UI mode (interactive)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run tests in debug mode
npm run test:e2e:debug

# Show test report
npm run test:e2e:report
```

### Running Specific Tests

```bash
# Run only authentication tests
npx playwright test auth.spec.ts

# Run only collection tests
npx playwright test collection.spec.ts

# Run tests matching a pattern
npx playwright test --grep "authentication"
```

## Test Structure

### Test Organization

Each test file follows this structure:

```typescript
test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup code for each test
  });

  test('should do something specific', async ({ page }) => {
    // Test implementation
  });
});
```

### Mocking Strategy

Tests use Playwright's route interception to mock API responses:

```typescript
// Mock API response
await page.route('**/api/v1/endpoint', async route => {
  await route.fulfill({
    status: 200,
    body: JSON.stringify(mockData)
  });
});
```

### Authentication Mocking

Tests mock authentication state using localStorage:

```typescript
await page.addInitScript(() => {
  localStorage.setItem('authStatus', JSON.stringify({
    discogs: { authenticated: true, username: 'testuser' },
    lastfm: { authenticated: true, username: 'testuser' }
  }));
});
```

## Test Data

### Mock Collection Data

```typescript
const mockCollectionItem = {
  id: 1,
  release: {
    id: 101,
    title: 'Test Album',
    artist: 'Test Artist',
    year: 2020,
    format: ['Vinyl'],
    label: ['Test Label'],
    cover_image: 'cover1.jpg',
    resource_url: 'https://api.discogs.com/releases/101'
  },
  date_added: '2023-01-01T00:00:00Z'
};
```

### Mock Release Data

```typescript
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
    { position: 'A2', title: 'Track 2', duration: '4:15' }
  ]
};
```

## Configuration

The tests are configured in `playwright.config.ts`:

- **Base URL**: `http://localhost:3000`
- **Web Server**: Automatically starts `npm run dev:app`
- **Browsers**: Chrome, Firefox, Safari, and mobile viewports
- **Retries**: 2 retries on CI, 0 locally
- **Screenshots**: On failure only
- **Videos**: Retained on failure

## Best Practices

### Test Writing Guidelines

1. **Use descriptive test names** that explain what the test verifies
2. **Follow AAA pattern**: Arrange, Act, Assert
3. **Mock external dependencies** to ensure test reliability
4. **Test both success and failure scenarios**
5. **Use page object patterns** for complex interactions
6. **Keep tests independent** - each test should be able to run in isolation

### Selector Best Practices

1. **Prefer role-based selectors** over CSS selectors:
   ```typescript
   // Good
   await page.getByRole('button', { name: /Save/i }).click();
   
   // Avoid
   await page.click('.btn-save');
   ```

2. **Use text content for verification**:
   ```typescript
   // Good
   await expect(page.getByText('Success message')).toBeVisible();
   
   // Avoid
   await expect(page.locator('.success')).toBeVisible();
   ```

3. **Use test IDs for complex elements**:
   ```typescript
   await page.getByTestId('album-card-1').click();
   ```

### Error Handling

1. **Test error scenarios** to ensure graceful degradation
2. **Mock network failures** to test offline behavior
3. **Verify error messages** are user-friendly
4. **Test retry mechanisms** where applicable

## Debugging

### Debug Mode

Run tests in debug mode to step through execution:

```bash
npm run test:e2e:debug
```

### UI Mode

Use Playwright's UI mode for interactive debugging:

```bash
npm run test:e2e:ui
```

### Screenshots and Videos

Failed tests automatically generate:
- Screenshots in `test-results/`
- Videos in `test-results/`
- Traces in `test-results/`

### Logs

Enable debug logging by setting the environment variable:

```bash
DEBUG=pw:api npm run test:e2e
```

## CI/CD Integration

### GitHub Actions

Add this to your workflow:

```yaml
- name: Install Playwright Browsers
  run: npx playwright install --with-deps

- name: Run Playwright tests
  run: npm run test:e2e

- name: Upload test results
  uses: actions/upload-artifact@v2
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 30
```

### Parallel Execution

Tests run in parallel by default. Configure workers in `playwright.config.ts`:

```typescript
workers: process.env.CI ? 1 : undefined,
```

## Maintenance

### Updating Tests

1. **When adding new features**, add corresponding e2e tests
2. **When changing UI elements**, update selectors in tests
3. **When modifying API responses**, update mock data
4. **When changing authentication flow**, update auth tests

### Test Data Management

1. **Keep mock data realistic** but minimal
2. **Use consistent naming** for test data
3. **Document complex mock structures**
4. **Share common mock data** between tests

### Performance

1. **Mock slow operations** to keep tests fast
2. **Use efficient selectors** to reduce test time
3. **Avoid unnecessary waits** - use proper assertions
4. **Run tests in parallel** when possible

## Troubleshooting

### Common Issues

1. **Tests failing due to timing**: Use proper wait conditions
2. **Selectors not finding elements**: Check if elements are in shadow DOM or iframes
3. **Network timeouts**: Increase timeout values in config
4. **Browser compatibility**: Test on multiple browsers

### Debugging Tips

1. **Use `page.pause()`** to pause execution
2. **Add `console.log()`** for debugging
3. **Use Playwright Inspector** for step-by-step debugging
4. **Check browser console** for JavaScript errors

## Contributing

When adding new e2e tests:

1. Follow the existing test structure
2. Add comprehensive test coverage
3. Include both success and failure scenarios
4. Update this README if adding new patterns
5. Ensure tests are reliable and fast
