import '@testing-library/jest-dom';
// Make sure jest-dom types are available globally

// Skip location mocking to avoid JSDOM conflicts
// Only hash changes are supported in JSDOM

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;

// Mock IntersectionObserver (not available in jsdom)
global.IntersectionObserver = class IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
} as unknown as typeof globalThis.IntersectionObserver;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Reset console mock call counts between tests to prevent cross-test pollution
afterEach(() => {
  (console.log as jest.Mock).mockClear();
  (console.error as jest.Mock).mockClear();
  (console.warn as jest.Mock).mockClear();
  (console.info as jest.Mock).mockClear();
  (console.debug as jest.Mock).mockClear();
});
