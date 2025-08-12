/**
 * Security validation utilities for input sanitization
 */

/**
 * Validates username format to prevent path traversal
 * Allows alphanumeric, underscore, and hyphen characters
 * Length between 1-64 characters
 */
export function validateUsername(username: string): boolean {
  const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
  return Boolean(username && USERNAME_PATTERN.test(username));
}

/**
 * Validates session ID format to prevent path traversal
 * Allows alphanumeric, underscore, and hyphen characters
 * Length between 1-64 characters
 */
export function validateSessionId(sessionId: string): boolean {
  const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
  return Boolean(sessionId && SESSION_ID_PATTERN.test(sessionId));
}

/**
 * Validates generic identifier format
 * Allows alphanumeric, underscore, and hyphen characters
 * Length between 1-64 characters
 */
export function validateIdentifier(identifier: string): boolean {
  const IDENTIFIER_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
  return Boolean(identifier && IDENTIFIER_PATTERN.test(identifier));
}

/**
 * Sanitizes a string by removing any path traversal attempts
 * Returns null if the input contains dangerous patterns
 */
export function sanitizePathComponent(input: string): string | null {
  if (!input) return null;

  // Convert to string if not already
  const stringInput = String(input);

  // Check for dangerous patterns
  if (
    stringInput.includes('..') ||
    stringInput.includes('/') ||
    stringInput.includes('\\') ||
    stringInput.includes('\0') ||
    stringInput.includes('%00') ||
    stringInput.includes('%2e%2e') ||
    stringInput.includes('%252e%252e')
  ) {
    return null;
  }

  // Return the input if it's safe
  return stringInput;
}

/**
 * Validates that a numeric ID is a positive integer
 */
export function validateNumericId(id: any): boolean {
  const numId = Number(id);
  return !isNaN(numId) && numId > 0 && Number.isInteger(numId);
}
