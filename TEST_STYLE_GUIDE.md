# Test Style Guide

## Overview

This guide establishes testing standards for the recordscrobbles project to ensure consistency, maintainability, and reliability across our test suite. All team members and AI developers should follow these conventions.

## Testing Framework & Tools

- **Primary Framework**: Jest with ts-jest preset
- **Frontend Testing**: @testing-library/react, @testing-library/jest-dom, @testing-library/user-event
- **API Testing**: supertest for HTTP endpoint testing
- **Mocking**: Jest built-in mocking capabilities
- **Environments**: Node.js for backend, jsdom for frontend

## File Organization

### Test File Structure
```
tests/
├── backend/               # Node.js environment tests
│   ├── services/          # Service layer unit tests
│   ├── routes/            # API endpoint integration tests
│   └── utils/             # Utility function unit tests
├── frontend/              # jsdom environment tests
│   ├── components/        # React component tests
│   ├── context/           # React context tests
│   ├── pages/             # Page component tests
│   ├── services/          # Frontend service tests
│   └── utils/             # Frontend utility tests
├── integration/           # Cross-system integration tests (currently empty)
├── setup.ts              # Backend test setup
└── setupReact.ts          # Frontend test setup
```

### Naming Conventions

- **Test files**: `ComponentName.test.tsx` or `serviceName.test.ts`
- **Mock files**: `__mocks__/moduleName.ts` (when needed)
- **Test data**: Use factories or fixtures in test files, avoid separate data files unless reused extensively

## Test Structure Standards

### AAA Pattern (Arrange-Act-Assert)

All tests must follow the AAA pattern with clear separation:

**✅ Good Example:**
```typescript
it('should store and retrieve Discogs token', async () => {
  // Arrange
  const testToken = 'test-discogs-token';
  const testUsername = 'testuser';
  
  // Act
  await authService.setDiscogsToken(testToken, testUsername);
  const retrievedToken = await authService.getDiscogsToken();
  
  // Assert
  expect(retrievedToken).toBe(testToken);
});
```

**❌ Bad Example:**
```typescript
it('should work with tokens', async () => {
  await authService.setDiscogsToken('test-discogs-token', 'testuser');
  expect(await authService.getDiscogsToken()).toBe('test-discogs-token');
  const settings = await authService.getUserSettings();
  expect(settings.discogs.username).toBe('testuser');
});
```

### Describe Block Organization

Use nested describe blocks to organize tests logically:

```typescript
describe('AuthService', () => {
  describe('Discogs Authentication', () => {
    it('should return undefined when no token exists', () => {});
    it('should store and retrieve token', () => {});
    it('should clear token', () => {});
  });
  
  describe('Last.fm Authentication', () => {
    it('should handle session keys', () => {});
  });
});
```

## Mocking Standards

### Service Mocking (Preferred)

Mock at the service boundary to maintain realistic data flow:

```typescript
// ✅ Good - Mock the entire service module
jest.mock('../../src/backend/services/authService');
const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;

// ✅ Good - Mock external dependencies
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
```

### Component Context Mocking

For React components, mock contexts consistently:

```typescript
// ✅ Good - Mock context with all required properties
const mockUseApp = {
  state: { serverUrl: 'http://localhost:3001' },
  dispatch: jest.fn(),
};

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => mockUseApp,
}));
```

### Avoid Over-Mocking

**❌ Bad - Too much mocking:**
```typescript
// Don't mock every single function
jest.mock('../../utils/dateUtils', () => ({
  formatDate: jest.fn(),
  parseDate: jest.fn(),
  validateDate: jest.fn(),
  // ... every function
}));
```

**✅ Good - Mock strategically:**
```typescript
// Only mock what's necessary for the test
jest.mock('../../utils/dateUtils', () => ({
  formatLocalTimeClean: jest.fn(date => date.toLocaleString()),
  getTimezoneOffset: jest.fn(() => 'UTC-5'),
}));
```

## Assertion Standards

### Assertion Hierarchy

Use the most specific assertion available:

```typescript
// ✅ Best - Most specific
expect(response.status).toBe(200);

// ✅ Good - Type and value
expect(response.body.success).toBe(true);

// ❌ Avoid - Too generic
expect(response.body.success).toBeTruthy();
```

### Error Testing

Always test both success and error cases:

```typescript
describe('Token validation', () => {
  it('should accept valid token', async () => {
    const result = await service.validateToken('valid-token');
    expect(result.isValid).toBe(true);
  });
  
  it('should reject invalid token', async () => {
    await expect(service.validateToken('invalid-token'))
      .rejects
      .toThrow('Invalid token format');
  });
});
```

### Async Testing

Use async/await consistently:

```typescript
// ✅ Good
it('should fetch user data', async () => {
  const userData = await api.getUser('123');
  expect(userData.id).toBe('123');
});

// ❌ Avoid promises directly
it('should fetch user data', () => {
  return api.getUser('123').then(userData => {
    expect(userData.id).toBe('123');
  });
});
```

## Test Data Management

### Inline Test Data

For simple test data, define it inline:

```typescript
const mockRelease: DiscogsRelease = {
  id: 123,
  title: 'Test Album',
  artist: 'Test Artist',
  year: 2021,
  format: ['Vinyl', 'LP'],
  label: ['Test Label'],
  cover_image: 'https://example.com/cover.jpg',
  resource_url: 'https://api.discogs.com/releases/123',
};
```

### Factory Functions

For complex or reused data, create factory functions:

```typescript
const createMockRelease = (overrides: Partial<DiscogsRelease> = {}): DiscogsRelease => ({
  id: 123,
  title: 'Test Album',
  artist: 'Test Artist',
  year: 2021,
  format: ['Vinyl', 'LP'],
  label: ['Test Label'],
  cover_image: 'https://example.com/cover.jpg',
  resource_url: 'https://api.discogs.com/releases/123',
  ...overrides,
});

// Usage
const albumWithoutYear = createMockRelease({ year: undefined });
```

## Test Isolation & Cleanup

### Before/After Hooks

Use consistent cleanup patterns:

```typescript
describe('FileStorage', () => {
  let fileStorage: FileStorage;
  const testDataDir = './test-data-file-storage';

  beforeEach(async () => {
    fileStorage = new FileStorage(testDataDir);
    await fileStorage.ensureDataDir();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  });
});
```

### Mock Cleanup

Always clear mocks between tests:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
});
```

## Component Testing Standards

### Rendering with Providers

Wrap components with necessary providers:

```typescript
const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <AuthProvider value={mockAuthContext}>
      <AppProvider value={mockAppContext}>
        {component}
      </AppProvider>
    </AuthProvider>
  );
};
```

### User Interaction Testing

Test user interactions, not implementation details:

```typescript
// ✅ Good - Test user behavior
it('should show details when view button is clicked', async () => {
  const user = userEvent.setup();
  render(<AlbumCard {...props} />);
  
  await user.click(screen.getByRole('button', { name: /view details/i }));
  
  expect(props.onViewDetails).toHaveBeenCalledWith(props.item.release.id);
});

// ❌ Bad - Test implementation details
it('should call onClick handler', () => {
  render(<AlbumCard {...props} />);
  fireEvent.click(screen.getByTestId('view-button'));
  expect(mockHandler).toHaveBeenCalled();
});
```

## API Testing Standards

### Express App Testing

Use supertest for API endpoint testing:

```typescript
describe('GET /api/v1/auth/status', () => {
  it('should return authentication status structure', async () => {
    const response = await request(app)
      .get('/api/v1/auth/status')
      .expect(200);

    expect(response.body).toHaveProperty('success');
    expect(response.body.data.discogs).toBeDefined();
    expect(response.body.data.lastfm).toBeDefined();
  });
});
```

### Security Testing

Include security-focused tests for user input:

```typescript
describe('XSS Prevention', () => {
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror="alert(1)">',
    'javascript:alert("XSS")',
  ];

  xssPayloads.forEach((payload) => {
    it(`should prevent XSS payload: ${payload.substring(0, 30)}...`, async () => {
      const response = await request(app)
        .get(`/auth/callback?param=${encodeURIComponent(payload)}`)
        .expect(400);

      expect(response.text).not.toContain(payload);
      expect(response.text).not.toContain('alert');
    });
  });
});
```

## Performance Guidelines

### Test Duration

- **Unit tests**: < 100ms per test
- **Component tests**: < 500ms per test  
- **Integration tests**: < 2 seconds per test
- **End-to-end tests**: < 30 seconds per test

### Test Parallelization

Tests must be completely isolated to support parallel execution.

## Coverage Standards

### Target Coverage

Maintain minimum coverage thresholds:
- **Statements**: 60%
- **Branches**: 60%
- **Functions**: 60%
- **Lines**: 60%

### Coverage Exclusions

Exclude these from coverage:
- Type definitions (`*.d.ts`)
- Test files (`*.test.ts`, `*.spec.ts`)
- Entry points (`index.tsx`, `main.ts`)

## Common Anti-Patterns to Avoid

### ❌ Testing Implementation Details
```typescript
// Don't test internal state
expect(component.state.isLoading).toBe(false);

// Don't test private methods
expect(service['_privateMethod']).toHaveBeenCalled();
```

### ❌ Overly Complex Test Setup
```typescript
// Don't create overly complex test scenarios
beforeEach(async () => {
  // 50 lines of setup...
});
```

### ❌ Flaky Assertions
```typescript
// Don't use time-dependent assertions
expect(response.body.timestamp).toBe(Date.now());

// Don't test external dependencies without mocking
expect(await fetch('https://api.external.com')).toBeDefined();
```

## Examples from Codebase

### Good Examples

**Strong Security Testing** (`tests/backend/routes/xss-auth.test.ts:115-137`):
```typescript
xssPayloads.forEach((payload, index) => {
  it(`should prevent XSS payload ${index + 1}: ${payload.substring(0, 30)}...`, async () => {
    const response = await request(app)
      .get(`/auth/discogs/callback?oauth_token=${encodeURIComponent(payload)}`)
      .expect(500);

    expect(response.text).not.toContain(payload);
    expect(response.text).not.toContain('alert');
  });
});
```

**Clean Component Testing** (`tests/frontend/components/AlbumCard.test.tsx:38-46`):
```typescript
it('renders album information correctly', () => {
  render(<AlbumCard {...defaultProps} />);

  expect(screen.getByText('Test Album')).toBeInTheDocument();
  expect(screen.getByText('Test Artist')).toBeInTheDocument();
  expect(screen.getByText('2021')).toBeInTheDocument();
});
```

### Areas for Improvement

**Overly Complex Mocking** (`tests/frontend/pages/HomePage.test.tsx:22-29`):
Consider simplifying the extensive mock setup and focusing on the behavior being tested.

## Continuous Improvement

This style guide is a living document. Update it as the codebase evolves and new patterns emerge. Regular reviews should assess:

1. Whether current patterns serve the team effectively
2. New testing challenges that need addressing
3. Opportunities to simplify or improve testing approaches

For questions or clarifications about testing patterns, refer to this guide first, then discuss with the team for consensus on new patterns.