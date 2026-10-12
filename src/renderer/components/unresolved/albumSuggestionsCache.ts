import {
  UnresolvedAlbumOption,
  UnresolvedArtistAlbumSuggestions,
  UnresolvedTrackAlbumSuggestion,
} from '../../../shared/types';

export type AlbumSuggestionsFetcher = (
  artist: string,
  options: { includeHidden: boolean }
) => Promise<UnresolvedArtistAlbumSuggestions>;

/**
 * Shares one in-flight/settled album-suggestions request per artist between
 * the single-track and bulk resolve modals. Failed requests are evicted so
 * the next open retries. Clear it whenever rules change.
 */
export class AlbumSuggestionsCache {
  private entries = new Map<
    string,
    Promise<UnresolvedArtistAlbumSuggestions>
  >();

  constructor(private fetcher: AlbumSuggestionsFetcher) {}

  get(
    artist: string,
    includeHidden: boolean
  ): Promise<UnresolvedArtistAlbumSuggestions> {
    const cacheKey = `${includeHidden ? 1 : 0}|${artist}`;
    const cached = this.entries.get(cacheKey);
    if (cached) return cached;
    const request = this.fetcher(artist, { includeHidden }).catch(err => {
      if (this.entries.get(cacheKey) === request) {
        this.entries.delete(cacheKey);
      }
      throw err;
    });
    this.entries.set(cacheKey, request);
    return request;
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Find the suggestion entry for one track key. */
export const findTrackSuggestion = (
  data: UnresolvedArtistAlbumSuggestions | null | undefined,
  key: string
): UnresolvedTrackAlbumSuggestion | undefined =>
  data?.tracks.find(t => t.key === key);

/** Human-readable provenance of a suggested album. */
export const describeSuggestion = (option: UnresolvedAlbumOption): string => {
  if (option.source === 'collection') return 'from your collection';
  return option.trackPlays > 0
    ? `from your history · played ${option.trackPlays}× on this album`
    : 'from your history';
};

/**
 * Album names for a track's datalist: its suggestion and alternatives first
 * (best first), then the artist's other known albums. Deduplicated.
 */
export const albumChoices = (
  suggestion: UnresolvedTrackAlbumSuggestion | undefined,
  knownAlbums: string[]
): string[] => {
  const names = [
    ...(suggestion?.suggestion ? [suggestion.suggestion.album] : []),
    ...(suggestion?.alternatives ?? []).map(a => a.album),
    ...knownAlbums,
  ];
  return [...new Set(names.filter(Boolean))];
};
