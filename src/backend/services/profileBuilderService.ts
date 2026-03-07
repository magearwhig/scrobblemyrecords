/**
 * Profile Builder Service
 *
 * Assembles the plain-text profiles used as input to the embedding model.
 *
 * Record profile format:
 *   Artist: Pink Floyd
 *   Album: The Dark Side of the Moon
 *   Year: 1973
 *   Genres: progressive rock, psychedelic rock, art rock
 *   Tags: atmospheric, concept album, classic, experimental, british
 *   Artist Tags: progressive, experimental, psychedelic, space rock
 *   Similar Artists In Collection: King Crimson, Yes, Genesis
 *   Tracks: Speak to Me, Breathe, On the Run, Time, ...
 *
 * Session profile format:
 *   Recent Artists: Radiohead, Portishead, Massive Attack
 *   Recent Genres: trip-hop, alternative rock, electronic, post-rock
 *   Recent Tags: atmospheric, melancholic, experimental, british, 90s
 *   Top Recent Tracks: Glory Box, Teardrop, Everything In Its Right Place
 *
 * Uses mapping services to resolve Discogs names to Last.fm names before
 * fetching tags, following the canonical Discogs↔Last.fm pattern.
 */

import { DiscogsRelease } from '../../shared/types';
import { createLogger } from '../utils/logger';

import { artistMappingService } from './artistMappingService';
import { ArtistSimilarityEnricherService } from './artistSimilarityEnricherService';
import { MappingService } from './mappingService';
import { TagEnricherService } from './tagEnricherService';

const log = createLogger('ProfileBuilderService');

export interface RecentScrobble {
  artist: string;
  track: string;
  album?: string;
  timestamp?: number;
}

export class ProfileBuilderService {
  private tagEnricherService: TagEnricherService;
  private artistSimilarityEnricherService: ArtistSimilarityEnricherService;
  private mappingService: MappingService;

  constructor(
    tagEnricherService: TagEnricherService,
    artistSimilarityEnricherService: ArtistSimilarityEnricherService,
    mappingService: MappingService
  ) {
    this.tagEnricherService = tagEnricherService;
    this.artistSimilarityEnricherService = artistSimilarityEnricherService;
    this.mappingService = mappingService;
  }

  /**
   * Resolve a Discogs artist name to the preferred Last.fm name.
   *
   * Resolution order:
   *   1. artistMappingService (Discogs→Last.fm artist mappings)
   *   2. mappingService album-level artist override (if a mapping has a matching collectionArtist)
   *   3. Fall back to the original Discogs name
   */
  private resolveArtistName(discogsArtist: string): string {
    return artistMappingService.getLastfmName(discogsArtist);
  }

  /**
   * Resolve Discogs album title to the Last.fm album name.
   * Uses album-level mapping if one exists for this artist+album pair.
   */
  private async resolveAlbumName(
    discogsArtist: string,
    discogsAlbum: string
  ): Promise<string> {
    const mapping = await this.mappingService.getAlbumMappingForCollection(
      discogsArtist,
      discogsAlbum
    );
    if (mapping) {
      return mapping.historyAlbum;
    }
    return discogsAlbum;
  }

  /**
   * Build the text profile for a single Discogs release.
   *
   * @param release          - Discogs release object from the collection
   * @param collectionArtists - All artist names in the collection (for similarity)
   * @returns Plain-text profile string ready for embedding
   */
  async buildRecordProfile(
    release: DiscogsRelease,
    collectionArtists: string[]
  ): Promise<string> {
    const discogsArtist = release.artist;
    const discogsAlbum = release.title;

    // Resolve names for Last.fm API calls
    const lastfmArtist = this.resolveArtistName(discogsArtist);
    const lastfmAlbum = await this.resolveAlbumName(
      discogsArtist,
      discogsAlbum
    );

    log.debug('Building record profile', {
      releaseId: release.id,
      discogsArtist,
      lastfmArtist,
      discogsAlbum,
      lastfmAlbum,
    });

    const trackTitles = release.tracklist?.map(t => t.title) ?? [];

    // Fetch tags (artist + album + first track)
    let artistTags: string[] = [];
    let albumTags: string[] = [];
    let trackTags: string[] = [];
    try {
      const tagResult = await this.tagEnricherService.enrichRecord(
        release.id,
        lastfmArtist,
        lastfmAlbum,
        trackTitles
      );
      artistTags = tagResult.artistTags;
      albumTags = tagResult.albumTags;
      trackTags = tagResult.trackTags;
    } catch (err) {
      log.warn('Tag enrichment failed for release, using empty tags', {
        releaseId: release.id,
        err,
      });
    }

    // Resolve collection artist names to Last.fm names before comparing against
    // Last.fm similar-artist data (prevents naive Discogs↔Last.fm name mismatch)
    const resolvedCollectionArtists = collectionArtists.map(a =>
      this.resolveArtistName(a)
    );

    // Fetch similar artists in collection
    let similarInCollection: string[] = [];
    try {
      similarInCollection =
        await this.artistSimilarityEnricherService.findSimilarInCollection(
          lastfmArtist,
          resolvedCollectionArtists
        );
    } catch (err) {
      log.warn('Artist similarity fetch failed for release', {
        releaseId: release.id,
        err,
      });
    }

    return this.formatRecordProfile({
      artist: lastfmArtist,
      album: lastfmAlbum,
      year: release.year,
      genres: release.format ?? [],
      albumTags,
      artistTags,
      trackTags,
      similarArtistsInCollection: similarInCollection,
      tracks: trackTitles,
    });
  }

  /**
   * Format the record text profile from resolved values.
   * Lines with no data are omitted to keep the profile compact.
   */
  private formatRecordProfile(data: {
    artist: string;
    album: string;
    year?: number;
    genres: string[];
    albumTags: string[];
    artistTags: string[];
    trackTags: string[];
    similarArtistsInCollection: string[];
    tracks: string[];
  }): string {
    const lines: string[] = [];

    lines.push(`Artist: ${data.artist}`);
    lines.push(`Album: ${data.album}`);

    if (data.year) {
      lines.push(`Year: ${data.year}`);
    }

    if (data.genres.length > 0) {
      lines.push(`Genres: ${data.genres.join(', ')}`);
    }

    // Deduplicate album and track tags, excluding duplicates already in album tags
    const albumTagSet = new Set(data.albumTags);
    const combinedAlbumTags = [...data.albumTags];
    for (const t of data.trackTags) {
      if (!albumTagSet.has(t)) {
        combinedAlbumTags.push(t);
        albumTagSet.add(t);
      }
    }

    if (combinedAlbumTags.length > 0) {
      lines.push(`Tags: ${combinedAlbumTags.join(', ')}`);
    }

    if (data.artistTags.length > 0) {
      lines.push(`Artist Tags: ${data.artistTags.join(', ')}`);
    }

    if (data.similarArtistsInCollection.length > 0) {
      lines.push(
        `Similar Artists In Collection: ${data.similarArtistsInCollection.join(', ')}`
      );
    }

    if (data.tracks.length > 0) {
      lines.push(`Tracks: ${data.tracks.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Build a listening session profile from recent scrobbles.
   *
   * Aggregates artist tags across all recent artists, ranks them by frequency,
   * and formats in the session profile format.
   *
   * @param recentScrobbles - Array of recent scrobble data
   * @returns Plain-text session profile string ready for embedding
   */
  async buildSessionProfile(
    recentScrobbles: RecentScrobble[]
  ): Promise<string> {
    if (recentScrobbles.length === 0) {
      return '';
    }

    // Count unique artists and their occurrence frequency
    const artistCounts = new Map<string, number>();
    const trackCounts = new Map<string, number>();

    for (const scrobble of recentScrobbles) {
      const artist = scrobble.artist.trim();
      const track = scrobble.track.trim();
      artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
      trackCounts.set(track, (trackCounts.get(track) ?? 0) + 1);
    }

    // Top artists by occurrence
    const topArtists = Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);

    // Top tracks by occurrence
    const topTracks = Array.from(trackCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);

    // Fetch artist tags for top artists and aggregate by frequency
    const tagFrequency = new Map<string, number>();

    for (const artist of topArtists) {
      try {
        const tags = await this.tagEnricherService.getArtistTags(artist);
        for (const tag of tags) {
          tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
        }
      } catch (err) {
        log.warn('Failed to fetch tags for session artist', { artist, err });
      }
    }

    // Sort tags by frequency
    const sortedTags = Array.from(tagFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag]) => tag);

    return this.formatSessionProfile({
      recentArtists: topArtists,
      recentTags: sortedTags,
      topRecentTracks: topTracks,
    });
  }

  /**
   * Format the session text profile from resolved values.
   */
  private formatSessionProfile(data: {
    recentArtists: string[];
    recentTags: string[];
    topRecentTracks: string[];
  }): string {
    const lines: string[] = [];

    if (data.recentArtists.length > 0) {
      lines.push(`Recent Artists: ${data.recentArtists.join(', ')}`);
    }

    if (data.recentTags.length > 0) {
      lines.push(`Recent Tags: ${data.recentTags.join(', ')}`);
    }

    if (data.topRecentTracks.length > 0) {
      lines.push(`Top Recent Tracks: ${data.topRecentTracks.join(', ')}`);
    }

    return lines.join('\n');
  }
}
