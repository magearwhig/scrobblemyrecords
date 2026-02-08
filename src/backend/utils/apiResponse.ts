import { Response } from 'express';

/**
 * Standard API response helpers.
 * All API endpoints should return { success: boolean, ... } for consistency.
 */

interface ErrorResponseOptions {
  /** Additional data to include alongside the error (e.g., validation details) */
  data?: unknown;
}

/**
 * Send a standardized error response.
 */
export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  options?: ErrorResponseOptions
): void {
  const body: Record<string, unknown> = { success: false, error: message };
  if (options?.data !== undefined) {
    body.data = options.data;
  }
  res.status(statusCode).json(body);
}

/**
 * Send a standardized success response.
 */
export function sendSuccess(
  res: Response,
  data?: unknown,
  statusCode = 200
): void {
  res.status(statusCode).json({ success: true, data });
}
