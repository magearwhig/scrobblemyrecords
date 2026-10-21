/**
 * Browser download helpers for binary API responses.
 *
 * Downloads go through `ApiService` as blobs (not `<a href>` links) so the
 * API-token header is attached when the backend requires one.
 */

/**
 * Save a blob as a file via a temporary object URL.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    // Revoke on the next tick: some browsers start the download asynchronously
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Read the filename from a `Content-Disposition` header. Prefers the RFC 5987
 * `filename*=UTF-8''…` form, falls back to `filename="…"` / `filename=…`.
 * Path separators are stripped. Returns null when no usable name is present.
 */
export function filenameFromContentDisposition(
  header: string | null | undefined
): string | null {
  if (!header) return null;

  let name: string | null = null;

  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (extended) {
    try {
      name = decodeURIComponent(extended[2].trim().replace(/^"|"$/g, ''));
    } catch {
      name = null;
    }
  }

  if (!name) {
    const quoted = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i.exec(header);
    if (quoted) {
      name = quoted[1].replace(/\\(.)/g, '$1');
    } else {
      const bare = /filename\s*=\s*([^;]+)/i.exec(header);
      if (bare) name = bare[1].trim();
    }
  }

  if (!name) return null;
  const safe = name.replace(/[/\\]/g, '_').trim();
  return safe || null;
}

/**
 * Read a Blob as text. `Blob.text()` isn't available in every environment
 * (older jsdom), so fall back to FileReader.
 */
export function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
