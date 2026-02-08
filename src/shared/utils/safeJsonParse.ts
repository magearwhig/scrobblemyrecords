/**
 * Type-safe JSON.parse wrapper that returns a result-or-error instead of throwing.
 *
 * @returns `{ success: true, data }` on success, `{ success: false, error }` on failure.
 */
export type JsonParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: Error };

export function safeJsonParse<T>(text: string): JsonParseResult<T> {
  try {
    const data = JSON.parse(text) as T;
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
