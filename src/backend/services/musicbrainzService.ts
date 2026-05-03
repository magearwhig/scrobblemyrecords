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

/**
 * Raw MusicBrainz `/release` search result shape (subset).
 * Returned by the search query against `/ws/2/release`.
 */
interface MBReleaseSearchResult {
  id: string;
  title: string;
  status?: string;
  date?: string;
  country?: string;
  packaging?: string;
  'artist-credit'?: Array<{
    artist: {
      id: string;
      name: string;
    };
  }>;
  'release-group'?: {
    id: string;
    title?: string;
    'primary-type'?: string;
    'secondary-types'?: string[];
  };
  'label-info'?: Array<{
    label?: {
      id?: string;
      name?: string;
    };
    'catalog-number'?: string;
  }>;
}

/**
 * Lightweight projection of a MusicBrainz `/release` (individual pressing) entry.
 * Distinct from MusicBrainzRelease which models a release-group.
 */
export interface MBReleaseLite {
  /** Release MBID (NOT the release-group MBID) */
  mbid: string;
  title: string;
  /** ISO date string (YYYY, YYYY-MM, or YYYY-MM-DD) or null */
  date: string | null;
  /** ISO country code (e.g. "US") */
  country?: string;
  /** "Official" / "Promotion" / etc. */
  status?: string;
  /** Parent release-group MBID — used for reissue detection */
  releaseGroupMbid: string;
  releaseGroupTitle?: string;
  releaseGroupPrimaryType?: string;
  releaseGroupSecondaryTypes?: string[];
  /** Mapped release type derived from the release-group's primary/secondary types */
  releaseType: MusicBrainzRelease['releaseType'];
  artistName: string;
  artistMbid: string;
  /** First non-empty label name from `label-info[]` */
  labelName?: string;
  /**
   * Parent release-group's `first-release-date` (the album's original release year).
   * Populated by a follow-up `/release-group/{mbid}` lookup after the search call;
   * may be `null` if the lookup failed or the field was not present on MB.
   */
  originalReleaseDate?: string | null;
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
   * Get individual releases (pressings) for an artist filtered by `date`.
   *
   * Unlike `getRecentAndUpcomingReleases` (which queries `/release-group` by
   * `firstreleasedate`), this queries `/release` by `date` — the date stamped
   * on the individual pressing. A 2026 reissue of a 2003 album will appear
   * here with `date: 2026` even though its release-group's first-release-date
   * is still 2003. This is how reissues are surfaced.
   *
   * Returns a flat list of `MBReleaseLite`. The caller is responsible for
   * deduping against already-tracked release-groups and for marking entries
   * as reissues.
   */
  async getRecentReleases(
    artistMbid: string,
    monthsBack: number = 12
  ): Promise<MBReleaseLite[]> {
    // Calculate date range as YYYY-MM (per plan; MB accepts partial dates)
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - monthsBack);
    const yyyy = pastDate.getUTCFullYear();
    const mm = String(pastDate.getUTCMonth() + 1).padStart(2, '0');
    const pastDateStr = `${yyyy}-${mm}`;

    const results: MBReleaseLite[] = [];
    const limit = 100;
    /** Hard cap on releases per artist to bound rate-limit cost. */
    const MAX_RELEASES = 500;
    let offset = 0;
    let total = 0;

    do {
      await this.enforceRateLimit();

      const response = await this.executeWithBackoff(async () => {
        return this.axios.get('/release', {
          params: {
            query: `arid:${artistMbid} AND date:[${pastDateStr} TO *] AND status:official`,
            limit,
            offset,
            fmt: 'json',
          },
        });
      }, `getRecentReleases(${artistMbid})`);

      const rawReleases: MBReleaseSearchResult[] = response.data.releases || [];
      total = response.data.count ?? rawReleases.length;

      // Defensive: empty page with non-zero offset means MB has nothing more
      // to give us regardless of `total`. Stop instead of looping forever.
      if (rawReleases.length === 0) {
        break;
      }

      for (const r of rawReleases) {
        const rg = r['release-group'];
        // Skip releases without a release-group reference
        if (!rg?.id) {
          continue;
        }

        const artistCredit = r['artist-credit']?.[0];
        const artistName = artistCredit?.artist?.name || 'Unknown Artist';
        const actualArtistMbid = artistCredit?.artist?.id || artistMbid;

        // First label entry with a non-empty name (some entries have empty
        // label-info or no label at all)
        const labelEntry = r['label-info']?.find(li => li.label?.name);
        const labelName = labelEntry?.label?.name;

        results.push({
          mbid: r.id,
          title: r.title,
          date: r.date || null,
          country: r.country,
          status: r.status,
          releaseGroupMbid: rg.id,
          releaseGroupTitle: rg.title,
          releaseGroupPrimaryType: rg['primary-type'],
          releaseGroupSecondaryTypes: rg['secondary-types'],
          releaseType: this.mapReleaseType(
            rg['primary-type'],
            rg['secondary-types']
          ),
          artistName,
          artistMbid: actualArtistMbid,
          labelName,
        });
      }

      offset += limit;
    } while (offset < total && offset < MAX_RELEASES);

    if (total > MAX_RELEASES) {
      this.logger.warn(
        `getRecentReleases: artist ${artistMbid} has ${total} releases since ${pastDateStr}; capped at ${MAX_RELEASES}`
      );
    }

    await this.enrichWithReleaseGroupDates(results);

    this.logger.debug(
      `Found ${results.length} recent releases for artist ${artistMbid} (since ${pastDateStr})`
    );

    return results;
  }

  /**
   * Populate `originalReleaseDate` on each entry by looking up its parent
   * release-group's `first-release-date`. Dedupes by `releaseGroupMbid` so each
   * unique release-group is fetched at most once per call. A lookup failure for
   * a single release-group leaves `originalReleaseDate` undefined for entries
   * sharing that MBID and does not abort the rest of the enrichment.
   */
  private async enrichWithReleaseGroupDates(
    releases: MBReleaseLite[]
  ): Promise<void> {
    const uniqueRgMbids = Array.from(
      new Set(releases.map(r => r.releaseGroupMbid).filter(Boolean))
    );
    if (uniqueRgMbids.length === 0) {
      return;
    }

    const dateByRgMbid = new Map<string, string | null>();

    for (const rgMbid of uniqueRgMbids) {
      try {
        await this.enforceRateLimit();
        const response = await this.executeWithBackoff(async () => {
          return this.axios.get(`/release-group/${rgMbid}`, {
            params: { fmt: 'json' },
          });
        }, `enrichReleaseGroup(${rgMbid})`);
        const firstReleaseDate: string | undefined =
          response.data?.['first-release-date'];
        dateByRgMbid.set(rgMbid, firstReleaseDate || null);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch release-group ${rgMbid} for original-date enrichment: ${(error as Error).message}`
        );
        // Leave undefined for entries sharing this RG so the UI can fall back.
      }
    }

    for (const r of releases) {
      if (dateByRgMbid.has(r.releaseGroupMbid)) {
        r.originalReleaseDate = dateByRgMbid.get(r.releaseGroupMbid) ?? null;
      }
    }
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
   * Get genres for an artist by MBID.
   * Uses the inc=genres parameter to fetch genre tags from MusicBrainz.
   * Returns sorted genre names.
   */
  async getArtistGenres(artistMbid: string): Promise<string[]> {
    await this.enforceRateLimit();

    return this.executeWithBackoff(async () => {
      try {
        const response = await this.axios.get(`/artist/${artistMbid}`, {
          params: {
            inc: 'genres',
            fmt: 'json',
          },
        });

        const genres: Array<{ name: string; count: number }> =
          response.data.genres || [];

        return genres.sort((a, b) => b.count - a.count).map(g => g.name);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return [];
        }
        throw error;
      }
    }, `getArtistGenres(${artistMbid})`);
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
