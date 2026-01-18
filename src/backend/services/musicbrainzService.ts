import axios, { AxiosInstance } from 'axios';

import { MusicBrainzArtistMatch, MusicBrainzRelease } from '../../shared/types';
import { createLogger } from '../utils/logger';

// Rate limiting: MusicBrainz requires 1 request/sec max
const MUSICBRAINZ_DELAY_MS = 1100; // 1 req/sec + buffer
const COVER_ART_DELAY_MS = 100; // Cover Art Archive is more generous

// Exponential backoff for rate limit errors
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 30000;

// MusicBrainz API response types
interface MBArtistSearchResult {
  id: string;
  name: string;
  disambiguation?: string;
  country?: string;
  'life-span'?: {
    begin?: string;
    end?: string;
    ended?: boolean;
  };
  score: number;
}

interface MBReleaseGroup {
  id: string;
  title: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
  'artist-credit'?: Array<{
    artist: {
      id: string;
      name: string;
    };
  }>;
}

export class MusicBrainzService {
  private axios: AxiosInstance;
  private coverArtAxios: AxiosInstance;
  private logger = createLogger('MusicBrainzService');
  private lastRequestTime = 0;
  private lastCoverArtRequestTime = 0;

  constructor() {
    // MusicBrainz API client
    this.axios = axios.create({
      baseURL: 'https://musicbrainz.org/ws/2',
      timeout: 10000,
      headers: {
        'User-Agent':
          'RecordScrobbles/1.0 (https://github.com/recordscrobbles)',
        Accept: 'application/json',
      },
    });

    // Cover Art Archive client
    this.coverArtAxios = axios.create({
      baseURL: 'https://coverartarchive.org',
      timeout: 5000,
      headers: {
        'User-Agent':
          'RecordScrobbles/1.0 (https://github.com/recordscrobbles)',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Ensure we respect MusicBrainz rate limits (1 req/sec)
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < MUSICBRAINZ_DELAY_MS) {
      await new Promise(resolve =>
        setTimeout(resolve, MUSICBRAINZ_DELAY_MS - elapsed)
      );
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Enforce rate limit for Cover Art Archive requests
   */
  private async enforceCoverArtRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCoverArtRequestTime;

    if (elapsed < COVER_ART_DELAY_MS) {
      await new Promise(resolve =>
        setTimeout(resolve, COVER_ART_DELAY_MS - elapsed)
      );
    }

    this.lastCoverArtRequestTime = Date.now();
  }

  /**
   * Execute an operation with exponential backoff for rate limit errors
   */
  private async executeWithBackoff<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let delay = INITIAL_BACKOFF_MS;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const isRateLimited =
          axios.isAxiosError(error) &&
          (error.response?.status === 429 || error.response?.status === 503);

        if (!isRateLimited || attempt === MAX_RETRIES) {
          throw error;
        }

        this.logger.warn(
          `Rate limited (${context}), retry ${attempt}/${MAX_RETRIES} in ${delay}ms`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, MAX_BACKOFF_MS);
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Search for artists by name
   * Returns candidates for disambiguation
   */
  async searchArtist(
    name: string,
    limit: number = 10
  ): Promise<MusicBrainzArtistMatch[]> {
    await this.enforceRateLimit();

    return this.executeWithBackoff(async () => {
      this.logger.debug(`Searching for artist: ${name}`);

      const response = await this.axios.get('/artist', {
        params: {
          query: `artist:"${name}"`,
          limit,
          fmt: 'json',
        },
      });

      const artists: MBArtistSearchResult[] = response.data.artists || [];

      return artists.map(artist => this.mapArtistResult(artist));
    }, `searchArtist(${name})`);
  }

  /**
   * Map MusicBrainz artist search result to our type
   */
  private mapArtistResult(
    artist: MBArtistSearchResult
  ): MusicBrainzArtistMatch {
    const lifeSpan = artist['life-span'];
    let beginYear: number | undefined;
    let endYear: number | undefined;

    if (lifeSpan?.begin) {
      beginYear = parseInt(lifeSpan.begin.split('-')[0], 10) || undefined;
    }
    if (lifeSpan?.end) {
      endYear = parseInt(lifeSpan.end.split('-')[0], 10) || undefined;
    }

    return {
      mbid: artist.id,
      name: artist.name,
      disambiguation: artist.disambiguation,
      country: artist.country,
      beginYear,
      endYear,
      score: artist.score,
    };
  }

  /**
   * Get all release groups for an artist
   * Optionally filter by type (album, ep, single, compilation)
   */
  async getArtistReleases(
    artistMbid: string,
    types?: Array<'album' | 'ep' | 'single' | 'compilation'>
  ): Promise<MusicBrainzRelease[]> {
    const releases: MusicBrainzRelease[] = [];
    let offset = 0;
    const limit = 100;
    let totalReleases = 0;

    // Build type filter query
    let typeQuery = '';
    if (types && types.length > 0) {
      typeQuery = types.map(t => `type:${t}`).join(' OR ');
      typeQuery = ` AND (${typeQuery})`;
    }

    do {
      await this.enforceRateLimit();

      const response = await this.executeWithBackoff(async () => {
        return this.axios.get('/release-group', {
          params: {
            query: `arid:${artistMbid}${typeQuery}`,
            limit,
            offset,
            fmt: 'json',
          },
        });
      }, `getArtistReleases(${artistMbid})`);

      const releaseGroups: MBReleaseGroup[] =
        response.data['release-groups'] || [];
      totalReleases = response.data.count || releaseGroups.length;

      for (const rg of releaseGroups) {
        releases.push(this.mapReleaseGroup(rg, artistMbid));
      }

      offset += limit;
    } while (offset < totalReleases && offset < 500); // Cap at 500 releases per artist

    this.logger.debug(
      `Found ${releases.length} releases for artist ${artistMbid}`
    );

    return releases;
  }

  /**
   * Get release groups for an artist filtered by date range
   * More efficient than fetching all and filtering in memory
   */
  async getRecentAndUpcomingReleases(
    artistMbid: string,
    monthsBack: number = 3
  ): Promise<MusicBrainzRelease[]> {
    await this.enforceRateLimit();

    // Calculate date range
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - monthsBack);
    const pastDateStr = pastDate.toISOString().split('T')[0];

    return this.executeWithBackoff(async () => {
      const response = await this.axios.get('/release-group', {
        params: {
          query: `arid:${artistMbid} AND firstreleasedate:[${pastDateStr} TO *]`,
          limit: 100,
          fmt: 'json',
        },
      });

      const releaseGroups: MBReleaseGroup[] =
        response.data['release-groups'] || [];

      const releases = releaseGroups.map(rg =>
        this.mapReleaseGroup(rg, artistMbid)
      );

      // Return releases - isUpcoming will be set properly in ReleaseTrackingService
      return releases.map(r => ({
        ...r,
        // Will be set properly in ReleaseTrackingService with isUpcoming
      }));
    }, `getRecentAndUpcomingReleases(${artistMbid})`);
  }

  /**
   * Map MusicBrainz release group to our type
   */
  private mapReleaseGroup(
    rg: MBReleaseGroup,
    artistMbid: string
  ): MusicBrainzRelease {
    const artistCredit = rg['artist-credit']?.[0];
    const artistName = artistCredit?.artist?.name || 'Unknown Artist';
    const actualArtistMbid = artistCredit?.artist?.id || artistMbid;

    return {
      mbid: rg.id,
      title: rg.title,
      artistName,
      artistMbid: actualArtistMbid,
      releaseDate: rg['first-release-date'] || null,
      releaseType: this.mapReleaseType(
        rg['primary-type'],
        rg['secondary-types']
      ),
      primaryType: rg['primary-type'],
      secondaryTypes: rg['secondary-types'],
    };
  }

  /**
   * Map MusicBrainz release type to our simplified types
   */
  private mapReleaseType(
    primaryType?: string,
    secondaryTypes?: string[]
  ): MusicBrainzRelease['releaseType'] {
    const primary = primaryType?.toLowerCase();
    const secondary = secondaryTypes?.map(s => s.toLowerCase()) || [];

    // Check for compilation first (it's a secondary type)
    if (secondary.includes('compilation')) {
      return 'compilation';
    }

    switch (primary) {
      case 'album':
        return 'album';
      case 'ep':
        return 'ep';
      case 'single':
        return 'single';
      default:
        return 'other';
    }
  }

  /**
   * Get cover art URL from Cover Art Archive
   * Returns the URL of the front cover image, or null if not available
   */
  async getCoverArtUrl(releaseGroupMbid: string): Promise<string | null> {
    await this.enforceCoverArtRateLimit();

    try {
      const response = await this.coverArtAxios.get(
        `/release-group/${releaseGroupMbid}`
      );

      const images = response.data.images || [];

      // Find front cover image
      const frontImage = images.find((img: { front?: boolean }) => img.front);

      // Prefer small thumbnail for list views (250px), fall back to full image
      const thumbnails = frontImage?.thumbnails || {};
      return thumbnails.small || thumbnails['250'] || frontImage?.image || null;
    } catch (error) {
      // 404 is common (no cover art) - not an error
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      this.logger.debug(
        `CAA lookup failed for ${releaseGroupMbid}`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return null;
    }
  }

  /**
   * Batch fetch cover art URLs for multiple release groups
   * Returns a map of MBID -> cover art URL
   */
  async batchGetCoverArtUrls(
    releaseGroupMbids: string[]
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const mbid of releaseGroupMbids) {
      const url = await this.getCoverArtUrl(mbid);
      if (url) {
        results.set(mbid, url);
      }
    }

    return results;
  }

  /**
   * Get artist details by MBID
   */
  async getArtistById(
    artistMbid: string
  ): Promise<MusicBrainzArtistMatch | null> {
    await this.enforceRateLimit();

    return this.executeWithBackoff(async () => {
      try {
        const response = await this.axios.get(`/artist/${artistMbid}`, {
          params: {
            fmt: 'json',
          },
        });

        const artist = response.data;
        const lifeSpan = artist['life-span'];
        let beginYear: number | undefined;
        let endYear: number | undefined;

        if (lifeSpan?.begin) {
          beginYear = parseInt(lifeSpan.begin.split('-')[0], 10) || undefined;
        }
        if (lifeSpan?.end) {
          endYear = parseInt(lifeSpan.end.split('-')[0], 10) || undefined;
        }

        return {
          mbid: artist.id,
          name: artist.name,
          disambiguation: artist.disambiguation,
          country: artist.country,
          beginYear,
          endYear,
          score: 100, // Direct lookup is perfect match
        };
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return null;
        }
        throw error;
      }
    }, `getArtistById(${artistMbid})`);
  }
}
