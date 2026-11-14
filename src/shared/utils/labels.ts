/** Company words dropped when grouping label spellings ("Sub Pop Records" -> "Sub Pop") */
const LABEL_SUFFIX_PATTERN =
  /\s+(Ltd\.?|Inc\.?|Records|Recordings|Music|Rec\.?|Co\.?|Entertainment|Group)\s*$/i;

/** The number Discogs adds to tell same-named labels apart: "Dirty Looks (4)" */
const DISCOGS_NUMBER_PATTERN = /\s+\(\d+\)\s*$/;

/** A label name as shown: trimmed, without Discogs' trailing number */
export function labelDisplayName(rawLabel: string): string {
  const trimmed = rawLabel.trim();
  return trimmed.replace(DISCOGS_NUMBER_PATTERN, '') || trimmed;
}

/** Discogs and owner placeholders that mean "no real label" */
const PLACEHOLDER_PATTERN = /^(not on label\b.*|none|no label|unknown)$/i;

/**
 * Grouping key for a label, so "Sub Pop", "Sub Pop Records" and Discogs'
 * "Sub Pop (2)" count once.
 * A heuristic: it can merge two different labels whose names differ only by
 * a company word, so callers keep the original spellings alongside the key.
 */
export function labelKey(rawLabel: string): string {
  const trimmed = labelDisplayName(rawLabel);
  const normalized = trimmed
    .replace(LABEL_SUFFIX_PATTERN, '')
    .trim()
    .toLowerCase();
  return normalized || trimmed.toLowerCase();
}

/** "Not On Label", "none" and blanks: no label page, no credit */
export function isPlaceholderLabel(rawLabel: string): boolean {
  const trimmed = rawLabel.trim();
  return !trimmed || PLACEHOLDER_PATTERN.test(trimmed);
}

/** A release's real labels, each once by key, keeping the first spelling */
export function releaseLabels(
  labels: string[] | undefined
): Array<{ key: string; name: string }> {
  const seen = new Map<string, string>();
  for (const raw of labels ?? []) {
    if (isPlaceholderLabel(raw)) continue;
    const key = labelKey(raw);
    if (!seen.has(key)) seen.set(key, raw.trim());
  }
  return Array.from(seen, ([key, name]) => ({ key, name }));
}

/** Bracketed edition notes that don't make a different album */
const EDITION_NOTE =
  /\s*[([](?:[^)\]]*\b(?:deluxe|remaster(?:ed)?|anniversary|expanded|edition|bonus|explicit|reissue|mono|stereo|vinyl|lp)\b[^)\]]*)[)\]]/giu;

/**
 * Name form for matching an album or artist across Last.fm, MusicBrainz and
 * Discogs: case, accents, punctuation, a leading "The", "&" vs "and", Discogs
 * suffixes ("(2)", "*") and bracketed edition notes ("(Deluxe Edition)") are
 * ignored.
 */
export function albumMatchName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(EDITION_NOTE, '')
    .replace(/\*/g, '')
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
