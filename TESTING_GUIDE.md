# Testing Guide for RecordScrobbles

## Overview

This document provides comprehensive guidance for the testing infrastructure of the RecordScrobbles application. The project maintains a robust testing strategy with **81.16% overall code coverage** across unit, integration, and end-to-end tests.

## Current Coverage Status

### Overall Coverage Metrics
- **Statements**: 81.16% (1,875/2,310)
- **Branches**: 72.85% (1,052/1,444)
- **Functions**: 86.78% (335/386)
- **Lines**: 81.34% (1,832/2,252)

### Coverage Targets
- **Global Threshold**: 60% (configured in jest.config.js)
- **Target Coverage**: 90% (project goal)
- **Current Status**: 81.16% (excellent progress toward 90% target)

## Testing Architecture

### Test Structure
```
tests/
├── backend/           # Backend unit tests (Node.js environment)
│   ├── routes/        # API route tests
│   ├── services/      # Service layer tests
│   └── utils/         # Utility function tests
├── frontend/          # Frontend unit tests (jsdom environment)
│   ├── components/    # React component tests
│   ├── pages/         # Page component tests
│   ├── context/       # React context tests
│   ├── hooks/         # Custom hook tests
│   └── utils/         # Frontend utility tests
├── integration/       # Integration tests (API + database)
├── e2e/              # End-to-end tests (Playwright)
├── setup.ts          # Backend test setup
└── setupReact.ts     # Frontend test setup
```

### Test Environments

#### Backend Tests (Node.js)
- **Environment**: Node.js
- **Framework**: Jest with ts-jest
- **Coverage**: Backend services, routes, utilities
- **Setup**: `tests/setup.ts`

#### Frontend Tests (jsdom)
- **Environment**: jsdom (simulated browser)
- **Framework**: Jest with React Testing Library
- **Coverage**: React components, hooks, utilities
- **Setup**: `tests/setupReact.ts`

#### Integration Tests
- **Environment**: Node.js with supertest
- **Framework**: Jest + supertest
- **Coverage**: API endpoints with database integration
- **Purpose**: Test complete request/response cycles

#### End-to-End Tests
- **Environment**: Real browsers (Chrome, Firefox, Safari)
- **Framework**: Playwright
- **Coverage**: Complete user workflows
- **Purpose**: Test real user interactions

## Running Tests

### Available Scripts

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run end-to-end tests
npm run test:e2e

# Run e2e tests with UI
npm run test:e2e:ui

# Run e2e tests in headed mode
npm run test:e2e:headed

# Run e2e tests in debug mode
npm run test:e2e:debug

# Show e2e test report
npm run test:e2e:report
```

### Running Specific Test Suites

```bash
# Run only backend tests
npm test -- --testPathPattern="backend"

# Run only frontend tests
npm test -- --testPathPattern="frontend"

# Run only integration tests
npm test -- --testPathPattern="integration"

# Run specific test file
npm test -- tests/backend/authService.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="authentication"
```

## Test Configuration

### Jest Configuration (`jest.config.js`)

The project uses a multi-project Jest configuration:

```javascript
module.exports = {
  projects: [
    // Backend tests (Node.js environment)
    {
      displayName: 'backend',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/backend', '<rootDir>/tests/integration'],
      // ... configuration
    },
    // Frontend tests (jsdom environment)
    {
      displayName: 'frontend',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/tests/frontend'],
      // ... configuration
    }
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  }
};
```

### Playwright Configuration (`playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
  ],
  webServer: {
    command: 'npm run dev:app',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

## Testing Best Practices

### Unit Testing Guidelines

#### Backend Tests

1. **Service Layer Testing**
   ```typescript
   describe('AuthService', () => {
     beforeEach(() => {
       // Setup mocks and test data
     });

     it('should authenticate user with valid credentials', async () => {
       // Arrange
       const credentials = { username: 'test', password: 'password' };
       
       // Act
       const result = await authService.authenticate(credentials);
       
       // Assert
       expect(result).toBeDefined();
       expect(result.authenticated).toBe(true);
     });
   });
   ```

2. **Route Testing**
   ```typescript
   describe('POST /api/auth/login', () => {
     it('should return 200 for valid credentials', async () => {
       const response = await request(app)
         .post('/api/auth/login')
         .send({ username: 'test', password: 'password' });
       
       expect(response.status).toBe(200);
       expect(response.body).toHaveProperty('token');
     });
   });
   ```

#### Frontend Tests

1. **Component Testing with React Testing Library**
   ```typescript
   describe('LoginForm', () => {
     it('should submit form with user input', async () => {
       render(<LoginForm onSubmit={mockSubmit} />);
       
       const usernameInput = screen.getByLabelText(/username/i);
       const passwordInput = screen.getByLabelText(/password/i);
       const submitButton = screen.getByRole('button', { name: /login/i });
       
       await userEvent.type(usernameInput, 'testuser');
       await userEvent.type(passwordInput, 'password123');
       await userEvent.click(submitButton);
       
       expect(mockSubmit).toHaveBeenCalledWith({
         username: 'testuser',
         password: 'password123'
       });
     });
   });
   ```

2. **Context Testing**
   ```typescript
   describe('AuthContext', () => {
     it('should provide authentication state', () => {
       const TestComponent = () => {
         const { isAuthenticated } = useAuth();
         return <div>{isAuthenticated ? 'Logged In' : 'Logged Out'}</div>;
       };
       
       render(
         <AuthProvider>
           <TestComponent />
         </AuthProvider>
       );
       
       expect(screen.getByText('Logged Out')).toBeInTheDocument();
     });
   });
   ```

### Integration Testing Guidelines

1. **API Integration Tests**
   ```typescript
   describe('Collection API Integration', () => {
     it('should fetch and return collection data', async () => {
       const response = await request(app)
         .get('/api/collection')
         .set('Authorization', `Bearer ${validToken}`);
       
       expect(response.status).toBe(200);
       expect(response.body).toHaveProperty('items');
       expect(Array.isArray(response.body.items)).toBe(true);
     });
   });
   ```

2. **Database Integration Tests**
   ```typescript
   describe('Collection Service Integration', () => {
     beforeEach(async () => {
       // Setup test database
       await setupTestDatabase();
     });
     
     afterEach(async () => {
       // Cleanup test database
       await cleanupTestDatabase();
     });
     
     it('should save and retrieve collection items', async () => {
       const item = { id: 1, title: 'Test Album' };
       await collectionService.saveItem(item);
       
       const retrieved = await collectionService.getItem(1);
       expect(retrieved).toEqual(item);
     });
   });
   ```

### End-to-End Testing Guidelines

1. **User Workflow Testing**
   ```typescript
   test('complete authentication and collection browsing flow', async ({ page }) => {
     // Navigate to setup page
     await page.goto('/setup');
     
     // Complete authentication
     await page.fill('[data-testid="discogs-token"]', 'test-token');
     await page.fill('[data-testid="lastfm-token"]', 'test-token');
     await page.click('[data-testid="save-auth"]');
     
     // Verify navigation to collection
     await expect(page).toHaveURL('/collection');
     await expect(page.getByText('Browse Collection')).toBeVisible();
   });
   ```

2. **Error Handling Testing**
   ```typescript
   test('handles authentication errors gracefully', async ({ page }) => {
     await page.goto('/setup');
     
     // Mock failed authentication
     await page.route('**/api/auth/discogs', route => {
       route.fulfill({ status: 401, body: 'Unauthorized' });
     });
     
     await page.fill('[data-testid="discogs-token"]', 'invalid-token');
     await page.click('[data-testid="save-auth"]');
     
     await expect(page.getByText(/authentication failed/i)).toBeVisible();
   });
   ```

## Test Data Management

### Mock Data Patterns

1. **Factory Functions**
   ```typescript
   // tests/factories/collectionFactory.ts
   export const createCollectionItem = (overrides = {}) => ({
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
     date_added: '2023-01-01T00:00:00Z',
     ...overrides
   });
   ```

2. **Test Utilities**
   ```typescript
   // tests/utils/testHelpers.ts
   export const renderWithProviders = (component: ReactElement) => {
     return render(
       <AuthProvider>
         <ThemeProvider>
           {component}
         </ThemeProvider>
       </AuthProvider>
     );
   };
   ```

### Test Database Setup

```typescript
// tests/setup/database.ts
export const setupTestDatabase = async () => {
  // Initialize test database with known state
  await db.migrate();
  await seedTestData();
};

export const cleanupTestDatabase = async () => {
  // Clean up test data
  await db.cleanup();
};
```

## Coverage Analysis

### High Coverage Areas (>90%)
- **Backend Services**: 95-100% coverage
- **Utility Functions**: 95-100% coverage
- **API Routes**: 90-95% coverage
- **Core Business Logic**: 90-95% coverage

### Areas Needing Improvement (60-80%)
- **Frontend Components**: 60-80% coverage
- **Error Handling Paths**: 70-85% coverage
- **Edge Cases**: 65-80% coverage

### Coverage Improvement Strategy

1. **Component Testing Focus**
   - Add tests for user interactions
   - Test error states and loading states
   - Cover conditional rendering paths

2. **Error Handling Coverage**
   - Test network failure scenarios
   - Test invalid input handling
   - Test authentication error flows

3. **Edge Case Testing**
   - Test boundary conditions
   - Test empty state handling
   - Test large dataset scenarios

## Continuous Integration

### GitHub Actions Workflow

The project includes automated testing in CI/CD:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
    
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linting
      run: npm run lint
    
    - name: Run type checking
      run: npm run typecheck
    
    - name: Run tests
      run: npm test
    
    - name: Run e2e tests
      run: npm run test:e2e
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
```

### Coverage Reporting

- **Local**: HTML report in `coverage/` directory
- **CI**: Codecov integration for pull requests
- **Thresholds**: 60% minimum, 90% target

## Debugging Tests

### Common Issues and Solutions

1. **Async Test Failures**
   ```typescript
   // Use proper async/await patterns
   it('should handle async operations', async () => {
     await waitFor(() => {
       expect(screen.getByText('Loaded')).toBeInTheDocument();
     });
   });
   ```

2. **Mock Setup Issues**
   ```typescript
   // Ensure mocks are reset between tests
   beforeEach(() => {
     jest.clearAllMocks();
     jest.resetModules();
   });
   ```

3. **Component Rendering Issues**
   ```typescript
   // Use proper provider wrapping
   const renderWithProviders = (component) => {
     return render(
       <TestProviders>
         {component}
       </TestProviders>
     );
   };
   ```

### Debugging Tools

1. **Jest Debug Mode**
   ```bash
   npm test -- --verbose --detectOpenHandles
   ```

2. **Playwright Debug Mode**
   ```bash
   npm run test:e2e:debug
   ```

3. **Coverage Analysis**
   ```bash
   npm run test:coverage
   # Open coverage/index.html in browser
   ```

## Performance Considerations

### Test Execution Time
- **Unit Tests**: < 30 seconds
- **Integration Tests**: < 2 minutes
- **E2E Tests**: < 5 minutes
- **Full Suite**: < 10 minutes

### Optimization Strategies

1. **Parallel Execution**
   - Jest runs tests in parallel by default
   - Playwright supports parallel browser testing
   - CI uses matrix strategy for Node.js versions

2. **Test Isolation**
   - Each test is independent
   - Proper cleanup after each test
   - No shared state between tests

3. **Mocking Strategy**
   - Mock external dependencies
   - Use fast in-memory databases for tests
   - Avoid real network calls in unit tests

## Maintenance and Updates

### Regular Maintenance Tasks

1. **Update Dependencies**
   ```bash
   npm update
   npm audit fix
   ```

2. **Review Coverage Reports**
   - Monthly coverage analysis
   - Identify uncovered code paths
   - Plan coverage improvements

3. **Update Test Data**
   - Keep mock data current
   - Update test scenarios for new features
   - Maintain test data consistency

### Adding New Tests

1. **For New Features**
   - Add unit tests for business logic
   - Add integration tests for API endpoints
   - Add e2e tests for user workflows

2. **For Bug Fixes**
   - Add regression tests
   - Test the specific failure scenario
   - Ensure fix prevents future occurrences

3. **For Refactoring**
   - Update existing tests
   - Maintain test coverage
   - Verify behavior remains the same

## Conclusion

The RecordScrobbles testing infrastructure provides comprehensive coverage with a well-structured approach to unit, integration, and end-to-end testing. The current 81.16% coverage represents excellent progress toward the 90% target, with strong foundations in place for continued improvement.

Key strengths:
- **Multi-layered testing strategy** (unit, integration, e2e)
- **Comprehensive tooling** (Jest, React Testing Library, Playwright)
- **Automated CI/CD integration**
- **Clear testing patterns and best practices**

Areas for continued improvement:
- **Frontend component coverage** (target: 90%+)
- **Error handling scenarios** (target: 85%+)
- **Edge case coverage** (target: 80%+)

This testing guide serves as a comprehensive reference for maintaining and improving the test suite as the project evolves.
