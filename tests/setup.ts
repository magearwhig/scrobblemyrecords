// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3002'; // Use different port for tests
// Use a proper 32+ character key for testing
process.env.ENCRYPTION_KEY =
  'test-encryption-key-for-testing-32-chars-minimum-length-required';
