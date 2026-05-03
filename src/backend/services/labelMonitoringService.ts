import crypto from 'crypto';

import axios, { AxiosInstance } from 'axios';
import OAuth from 'oauth-1.0a';

import {
  CollectionItem,
  LabelMonitoringSettings,
  LabelRelease,
  LabelReleasesStore,
  LabelScanStatus,
  LabelScanStatusStore,
  MonitoredLabel,
  MonitoredLabelsStore,
} from '../../shared/types';
import { safeJsonParse } from '../../shared/utils/safeJsonParse';
import { getDiscogsAxios } from '../utils/discogsAxios';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { AuthService } from './authService';
import { DiscogsService } from './discogsService';
import { WishlistService } from './wishlistService';

const MAX_RETRIES = 3;
const DEFAULT_LOOKBACK_MONTHS = 6;
const DEFAULT_MAX_RELEASES_PER_LABEL = 500;
const PER_PAGE = 100;
/**
 * Hard upper bound on pages we will fetch per label, regardless of what
 * Discogs reports in `pagination.pages`. Discogs itself caps pagination at
 * 100 (returning a 403 above that). This guarantees we cannot infinite-loop
 * if the API ever returns malformed pagination metadata.
 */
const MAX_PAGES_PER_LABEL = 100;

interface DiscogsLabelReleaseRaw {
  id: number;
  artist?: string;
  title?: string;
  year?: number;
  format?: string;
  thumb?: string;
  status?: string;
  resource_url?: string;
}

interface DiscogsPagination {
  page: number;
  pages: number;
  per_page: number;
  items: number;
  urls?: Record<string, string>;
}

interface DiscogsLabelSearchHit {
  id: number;
  type: string;
  title?: string;
  thumb?: string;
  resource_url?: string;
  user_data?: unknown;
}

export interface LabelSearchResult {
  id: number;
  name: string;
  thumbUrl?: string;
}

/** A label that appears on at least one wishlist item, with the artist(s)
 *  whose wishlist items reference it. Used to populate the Add Label dropdown. */
export interface WishlistLabelOption {
  name: string;
  artists: string[];
  count: number;
}

/** A single artist found on the user's wishlist or local want list. */
export interface WishlistArtistOption {
  name: string;
  count: number;
  sources: Array<'wishlist' | 'local-want'>;
}

/** A single URL harvested from an artist's Discogs profile. */
export interface ArtistWebsiteUrl {
  url: string;
  kind: 'bandcamp' | 'soundcloud' | 'homepage' | 'other';
}

export interface WebsiteSuggestion {
  url: string;
  /** Suggested name for the website (typically `${name} (bandcamp)` etc.) */
  suggestedName: string;
  /** Whether this URL was harvested from a monitored label or a wishlist artist. */
  sourceType: 'label' | 'artist';
  /** Display name of the label or artist this URL was harvested from. */
  sourceName: string;
  /** Heuristic kind: bandcamp / soundcloud / homepage / other. */
  kind: 'bandcamp' | 'soundcloud' | 'homepage' | 'other';
}

export class LabelMonitoringService {
  private fileStorage: FileStorage;
  private authService: AuthService;
  private wishlistService: WishlistService;
  private discogsService: DiscogsService;
  private axios: AxiosInstance;
  private oauth: OAuth;
  private baseUrl = 'https://api.discogs.com';
  private logger = createLogger('LabelMonitoringService');

  // File paths
  private readonly LABELS_FILE = 'labels/monitored-labels.json';
  private readonly RELEASES_FILE = 'labels/releases.json';
  private readonly SCAN_STATUS_FILE = 'labels/scan-status.json';
  private readonly SETTINGS_FILE = 'labels/settings.json';

  private scanInProgress = false;
  private scanAborted = false;
  private initialized = false;

  constructor(
    fileStorage: FileStorage,
    authService: AuthService,
    wishlistService: WishlistService,
    discogsService: DiscogsService
  ) {
    this.fileStorage = fileStorage;
    this.authService = authService;
    this.wishlistService = wishlistService;
    this.discogsService = discogsService;

    this.oauth = new OAuth({
      consumer: {
        key: process.env.DISCOGS_CLIENT_ID || '',
        secret: process.env.DISCOGS_CLIENT_SECRET || '',
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto
          .createHmac('sha1', key)
          .update(base_string)
          .digest('base64');
      },
    });

    this.axios = getDiscogsAxios();

    this.initialize();
  }

  /**
   * Reset scan status if server crashed mid-scan.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const stored = await this.fileStorage.readJSON<LabelScanStatusStore>(
        this.SCAN_STATUS_FILE
      );
      const status = stored?.status;
      if (status && status.status === 'scanning') {
        this.logger.info(
          `Resetting stale label scan status from '${status.status}' to 'idle' (server restart detected)`
        );
        await this.writeScanStatus({
          status: 'idle',
        });
      }
    } catch {
      // No status file yet — nothing to reset
    }
  }

  // ============================================
  // Auth + retry helpers (mirror sellerMonitoringService)
  // ============================================

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authService.getDiscogsToken();
    if (!token) {
      throw new Error('No Discogs token available. Please authenticate first.');
    }

    if (token.startsWith('Discogs token=')) {
      return { Authorization: token };
    }

    const requestData = { url: this.baseUrl, method: 'GET' };
    const parsed = safeJsonParse<{ key: string; secret: string }>(token);
    if (!parsed.success) {
      throw new Error(`Corrupted Discogs OAuth token: ${parsed.error.message}`);
    }
    const oauthHeader = this.oauth.toHeader(
      this.oauth.authorize(requestData, parsed.data)
    );
    return oauthHeader as unknown as Record<string, string>;
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const isPaginationLimit =
          axios.isAxiosError(error) &&
          error.response?.status === 403 &&
          error.response?.data?.message?.includes(
            'Pagination above 100 disabled'
          );
        if (isPaginationLimit) {
          throw error;
        }

        const isRateLimitError =
          axios.isAxiosError(error) &&
          (error.response?.status === 403 || error.response?.status === 429);
        if (!isRateLimitError || attempt === MAX_RETRIES) {
          throw error;
        }

        this.logger.warn(
          `Rate limit hit for ${context} (attempt ${attempt}/${MAX_RETRIES}), retrying after bucket pause...`
        );
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  // ============================================
  // Settings
  // ============================================

  async getSettings(): Promise<LabelMonitoringSettings> {
    try {
      const settings = await this.fileStorage.readJSON<LabelMonitoringSettings>(
        this.SETTINGS_FILE
      );
      if (settings && settings.schemaVersion === 1) {
        return settings;
      }
    } catch {
      this.logger.debug('No label settings file, using defaults');
    }

    return {
      schemaVersion: 1,
      defaultLookbackMonths: DEFAULT_LOOKBACK_MONTHS,
    };
  }

  async saveSettings(
    update: Partial<LabelMonitoringSettings>
  ): Promise<LabelMonitoringSettings> {
    const current = await this.getSettings();
    const merged: LabelMonitoringSettings = {
      ...current,
      ...update,
      schemaVersion: 1,
    };
    await this.fileStorage.writeJSONWithBackup(this.SETTINGS_FILE, merged);
    this.logger.info('Label monitoring settings saved');
    return merged;
  }

  // ============================================
  // Scan status
  // ============================================

  async getScanStatus(): Promise<LabelScanStatus> {
    try {
      const stored = await this.fileStorage.readJSON<LabelScanStatusStore>(
        this.SCAN_STATUS_FILE
      );
      if (stored?.status) {
        return stored.status;
      }
    } catch {
      // No status yet
    }
    return { status: 'idle' };
  }

  private async writeScanStatus(
    update: Partial<LabelScanStatus>
  ): Promise<void> {
    const current = await this.getScanStatus();
    const merged: LabelScanStatus = { ...current, ...update };
    const store: LabelScanStatusStore = {
      schemaVersion: 1,
      status: merged,
    };
    await this.fileStorage.writeJSON(this.SCAN_STATUS_FILE, store);
  }

  // ============================================
  // Label CRUD
  // ============================================

  async getLabels(): Promise<MonitoredLabel[]> {
    try {
      const store = await this.fileStorage.readJSON<MonitoredLabelsStore>(
        this.LABELS_FILE
      );
      if (store && store.schemaVersion === 1) {
        return store.labels;
      }
    } catch {
      this.logger.debug('No monitored labels file');
    }
    return [];
  }

  /**
   * Search Discogs for labels matching a query.
   */
  async searchLabels(query: string): Promise<LabelSearchResult[]> {
    if (!query || query.trim().length === 0) return [];

    const headers = await this.getAuthHeaders();
    const response = await this.executeWithRetry(
      () =>
        this.axios.get('/database/search', {
          headers,
          params: { q: query, type: 'label', per_page: 25 },
        }),
      `label search for ${query}`
    );

    const results: DiscogsLabelSearchHit[] = response.data?.results || [];
    return results
      .filter(r => r.type === 'label' && typeof r.id === 'number')
      .map(r => ({
        id: r.id,
        name: r.title || `Label ${r.id}`,
        thumbUrl: r.thumb,
      }));
  }

  /**
   * Every label that appears on at least one wishlist item, with the artist
   * names whose wishlist items reference it. Powers the Add Label dropdown.
   * Already-monitored labels are excluded.
   */
  async getWishlistLabelOptions(): Promise<WishlistLabelOption[]> {
    const labelMap = new Map<
      string,
      { displayName: string; artists: Set<string>; count: number }
    >();
    const addLabel = (rawLabel: string | undefined, artist: string) => {
      if (!rawLabel) return;
      const trimmed = rawLabel.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      const existing = labelMap.get(key);
      if (existing) {
        existing.count += 1;
        if (artist.trim()) existing.artists.add(artist.trim());
      } else {
        labelMap.set(key, {
          displayName: trimmed,
          artists: artist.trim() ? new Set([artist.trim()]) : new Set(),
          count: 1,
        });
      }
    };

    try {
      const wishlistItems = await this.wishlistService.getWishlistItems();
      for (const item of wishlistItems) {
        for (const version of item.vinylVersions || []) {
          addLabel(version.label, item.artist);
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load wishlist for label options', error);
    }

    const monitoredNames = new Set(
      (await this.getLabels()).map(l => l.name.trim().toLowerCase())
    );

    return Array.from(labelMap.entries())
      .filter(([key]) => !monitoredNames.has(key))
      .map(([, v]) => ({
        name: v.displayName,
        artists: Array.from(v.artists).sort((a, b) => a.localeCompare(b)),
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /**
   * Every unique artist on the user's Discogs wishlist + local want list.
   * Powers the Add Website dropdown.
   */
  async getWishlistArtistOptions(): Promise<WishlistArtistOption[]> {
    const artistMap = new Map<
      string,
      {
        displayName: string;
        count: number;
        sources: Set<'wishlist' | 'local-want'>;
      }
    >();
    const addArtist = (
      raw: string | undefined,
      source: 'wishlist' | 'local-want'
    ) => {
      if (!raw) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      const existing = artistMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.sources.add(source);
      } else {
        artistMap.set(key, {
          displayName: trimmed,
          count: 1,
          sources: new Set([source]),
        });
      }
    };

    try {
      const wishlistItems = await this.wishlistService.getWishlistItems();
      for (const item of wishlistItems) addArtist(item.artist, 'wishlist');
    } catch (error) {
      this.logger.warn('Failed to load wishlist for artist options', error);
    }
    try {
      const localWants = await this.wishlistService.getLocalWantList();
      for (const item of localWants) addArtist(item.artist, 'local-want');
    } catch (error) {
      this.logger.warn(
        'Failed to load local want list for artist options',
        error
      );
    }

    return Array.from(artistMap.values())
      .map(v => ({
        name: v.displayName,
        count: v.count,
        sources: Array.from(v.sources),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Resolve an artist name to a Discogs ID and return the URLs from their
   * profile, classified into bandcamp / soundcloud / homepage / other. Used
   * after the user picks an artist in the Add Website dropdown.
   */
  async getArtistWebsiteUrls(artistName: string): Promise<ArtistWebsiteUrl[]> {
    const trimmed = artistName.trim();
    if (!trimmed) return [];
    const resolved = await this.searchDiscogsArtist(trimmed);
    if (!resolved) return [];
    const urls = await this.getArtistUrls(resolved.id);
    if (!urls) return [];

    const seen = new Set<string>();
    const result: ArtistWebsiteUrl[] = [];
    for (const rawUrl of urls) {
      const kind = this.classifyLabelUrl(rawUrl);
      if (kind === null) continue;
      const key = this.normalizeForCompare(rawUrl);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ url: rawUrl, kind });
    }
    return result;
  }

  /**
   * Look up label info on Discogs to validate addition.
   */
  private async getLabelInfo(
    discogsLabelId: number
  ): Promise<{ id: number; name: string; urls?: string[] } | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.executeWithRetry(
        () => this.axios.get(`/labels/${discogsLabelId}`, { headers }),
        `lookup label ${discogsLabelId}`
      );
      const rawUrls = response.data?.urls;
      const urls =
        Array.isArray(rawUrls) && rawUrls.every(u => typeof u === 'string')
          ? (rawUrls as string[])
          : undefined;
      return {
        id: response.data?.id ?? discogsLabelId,
        name: response.data?.name || `Label ${discogsLabelId}`,
        urls,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Website suggestions harvested from each monitored label's Discogs
   * profile (bandcamp, soundcloud, homepage). Already-monitored URLs
   * (passed via `excludeUrls`) are skipped, as are duplicates within the
   * same call. Artist-derived suggestions live on a separate path
   * (`getArtistWebsiteUrls`) driven by the Add Website dropdown.
   */
  async getWebsiteSuggestions(
    excludeUrls: string[] = []
  ): Promise<WebsiteSuggestion[]> {
    const excludeSet = new Set(
      excludeUrls.map(u => this.normalizeForCompare(u))
    );
    const labels = await this.getLabels();
    if (labels.length === 0) return [];

    const suggestions: WebsiteSuggestion[] = [];
    for (const label of labels) {
      try {
        const info = await this.getLabelInfo(label.discogsLabelId);
        if (!info?.urls) continue;
        for (const rawUrl of info.urls) {
          const kind = this.classifyLabelUrl(rawUrl);
          if (kind === null) continue;
          const normalized = this.normalizeForCompare(rawUrl);
          if (excludeSet.has(normalized)) continue;
          excludeSet.add(normalized);
          suggestions.push({
            url: rawUrl,
            suggestedName:
              kind === 'homepage' ? label.name : `${label.name} (${kind})`,
            sourceType: 'label',
            sourceName: label.name,
            kind,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch info for label ${label.discogsLabelId} (${label.name})`,
          error
        );
      }
    }
    return suggestions;
  }

  private async searchDiscogsArtist(
    name: string
  ): Promise<{ id: number; name: string } | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.executeWithRetry(
        () =>
          this.axios.get('/database/search', {
            headers,
            params: { q: name, type: 'artist', per_page: 1 },
          }),
        `artist search for ${name}`
      );
      const top: DiscogsLabelSearchHit | undefined =
        response.data?.results?.[0];
      if (!top || top.type !== 'artist' || typeof top.id !== 'number') {
        return null;
      }
      return { id: top.id, name: top.title || name };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private async getArtistUrls(
    discogsArtistId: number
  ): Promise<string[] | undefined> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.executeWithRetry(
        () => this.axios.get(`/artists/${discogsArtistId}`, { headers }),
        `lookup artist ${discogsArtistId}`
      );
      const rawUrls = response.data?.urls;
      return Array.isArray(rawUrls) && rawUrls.every(u => typeof u === 'string')
        ? (rawUrls as string[])
        : undefined;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return undefined;
      }
      throw error;
    }
  }

  private classifyLabelUrl(url: string): WebsiteSuggestion['kind'] | null {
    const lower = url.toLowerCase();
    if (lower.includes('bandcamp.com')) return 'bandcamp';
    if (lower.includes('soundcloud.com')) return 'soundcloud';
    // Skip social / wiki / image hosts
    if (
      lower.includes('facebook.com') ||
      lower.includes('twitter.com') ||
      lower.includes('instagram.com') ||
      lower.includes('youtube.com') ||
      lower.includes('vimeo.com') ||
      lower.includes('flickr.com') ||
      lower.includes('myspace.com') ||
      lower.includes('wikipedia.org') ||
      lower.includes('discogs.com')
    ) {
      return null;
    }
    // Anything else is treated as the label's homepage
    return 'homepage';
  }

  private normalizeForCompare(url: string): string {
    return url.replace(/\/+$/, '').toLowerCase();
  }

  async addLabel(
    discogsLabelId: number,
    overrideName?: string,
    lookbackMonths?: number
  ): Promise<MonitoredLabel> {
    const labels = await this.getLabels();
    if (labels.some(l => l.discogsLabelId === discogsLabelId)) {
      throw new Error('Already monitoring this label');
    }

    const info = await this.getLabelInfo(discogsLabelId);
    if (!info) {
      throw new Error('Label not found on Discogs');
    }

    const settings = await this.getSettings();
    const newLabel: MonitoredLabel = {
      id: crypto.randomUUID(),
      discogsLabelId: info.id,
      name: overrideName || info.name,
      addedAt: Date.now(),
      lookbackMonths: lookbackMonths ?? settings.defaultLookbackMonths,
    };

    const store: MonitoredLabelsStore = {
      schemaVersion: 1,
      labels: [...labels, newLabel],
    };
    await this.fileStorage.writeJSONWithBackup(this.LABELS_FILE, store);
    this.logger.info(`Added label: ${newLabel.name} (${newLabel.id})`);
    return newLabel;
  }

  async removeLabel(localId: string): Promise<boolean> {
    const labels = await this.getLabels();
    const idx = labels.findIndex(l => l.id === localId);
    if (idx === -1) return false;

    const removed = labels.splice(idx, 1)[0];
    const store: MonitoredLabelsStore = {
      schemaVersion: 1,
      labels,
    };
    await this.fileStorage.writeJSONWithBackup(this.LABELS_FILE, store);

    // Also drop releases for this label so they don't linger
    const releasesStore = await this.getReleasesStore();
    const before = releasesStore.releases.length;
    releasesStore.releases = releasesStore.releases.filter(
      r => r.labelId !== localId
    );
    if (releasesStore.releases.length !== before) {
      releasesStore.lastUpdated = Date.now();
      await this.fileStorage.writeJSONWithBackup(
        this.RELEASES_FILE,
        releasesStore
      );
    }

    this.logger.info(`Removed label: ${removed.name} (${localId})`);
    return true;
  }

  // ============================================
  // Releases store
  // ============================================

  private async getReleasesStore(): Promise<LabelReleasesStore> {
    try {
      const store = await this.fileStorage.readJSON<LabelReleasesStore>(
        this.RELEASES_FILE
      );
      if (store && store.schemaVersion === 1) {
        return store;
      }
    } catch {
      // No file yet
    }
    return {
      schemaVersion: 1,
      lastUpdated: Date.now(),
      releases: [],
    };
  }

  async getAllReleases(): Promise<LabelRelease[]> {
    const store = await this.getReleasesStore();
    return store.releases;
  }

  async getReleasesForLabel(labelId: string): Promise<LabelRelease[]> {
    const store = await this.getReleasesStore();
    return store.releases.filter(r => r.labelId === labelId);
  }

  async markReleaseAsSeen(releaseId: string): Promise<boolean> {
    const result = await this.markReleasesAsSeen([releaseId]);
    return result.updated > 0;
  }

  /**
   * Bulk-update many releases to status='seen' in one read-mutate-write
   * cycle. Avoids the read-modify-write race when the frontend fires many
   * parallel single-item updates and only the last writer's mutation survives.
   */
  async markReleasesAsSeen(
    releaseIds: string[]
  ): Promise<{ updated: number; missing: string[] }> {
    if (releaseIds.length === 0) return { updated: 0, missing: [] };
    const store = await this.getReleasesStore();
    const idSet = new Set(releaseIds);
    const found = new Set<string>();
    for (const release of store.releases) {
      if (idSet.has(release.id)) {
        release.status = 'seen';
        found.add(release.id);
      }
    }
    if (found.size === 0) {
      return { updated: 0, missing: releaseIds };
    }
    store.lastUpdated = Date.now();
    await this.fileStorage.writeJSONWithBackup(this.RELEASES_FILE, store);
    return {
      updated: found.size,
      missing: releaseIds.filter(id => !found.has(id)),
    };
  }

  async dismissRelease(releaseId: string): Promise<boolean> {
    const result = await this.dismissReleases([releaseId]);
    return result.updated > 0;
  }

  /** See `markReleasesAsSeen` — same shape, status='dismissed'. */
  async dismissReleases(
    releaseIds: string[]
  ): Promise<{ updated: number; missing: string[] }> {
    if (releaseIds.length === 0) return { updated: 0, missing: [] };
    const store = await this.getReleasesStore();
    const idSet = new Set(releaseIds);
    const found = new Set<string>();
    for (const release of store.releases) {
      if (idSet.has(release.id)) {
        release.status = 'dismissed';
        found.add(release.id);
      }
    }
    if (found.size === 0) {
      return { updated: 0, missing: releaseIds };
    }
    store.lastUpdated = Date.now();
    await this.fileStorage.writeJSONWithBackup(this.RELEASES_FILE, store);
    return {
      updated: found.size,
      missing: releaseIds.filter(id => !found.has(id)),
    };
  }

  // ============================================
  // Cross-reference: collection + wishlist
  // ============================================

  /**
   * Build sets of release IDs and master IDs that the user already has
   * (collection) or wants (wishlist + local want list).
   */
  private async loadUserReferenceSets(): Promise<{
    collectionReleaseIds: Set<number>;
    wishlistReleaseIds: Set<number>;
    wishlistMasterIds: Set<number>;
  }> {
    const collectionReleaseIds = new Set<number>();
    const wishlistReleaseIds = new Set<number>();
    const wishlistMasterIds = new Set<number>();

    // Wishlist (Discogs wantlist) + local want list
    try {
      const wishlistItems = await this.wishlistService.getWishlistItems();
      for (const item of wishlistItems) {
        if (item.releaseId) wishlistReleaseIds.add(item.releaseId);
        if (item.masterId) wishlistMasterIds.add(item.masterId);
      }
    } catch (error) {
      this.logger.warn('Could not load wishlist items for cross-ref', error);
    }

    try {
      const localWants = await this.wishlistService.getLocalWantList();
      for (const item of localWants) {
        if (item.releaseId) wishlistReleaseIds.add(item.releaseId);
        if (item.masterId) wishlistMasterIds.add(item.masterId);
      }
    } catch (error) {
      this.logger.warn('Could not load local want list for cross-ref', error);
    }

    // Collection: read cached pages directly via FileStorage so we don't depend
    // on a username being present in auth (search helper requires one)
    try {
      const files = await this.fileStorage.listFiles('collections');
      for (const filename of files) {
        if (!/-page-\d+\.json$/.test(filename)) continue;
        const cached = await this.fileStorage.readJSON<{
          data?: CollectionItem[];
        }>(`collections/${filename}`);
        const items = cached?.data;
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          const releaseId = item?.release?.id;
          if (typeof releaseId === 'number') {
            collectionReleaseIds.add(releaseId);
          }
        }
      }
    } catch (error) {
      this.logger.debug('No cached collection pages available', error);
    }

    return { collectionReleaseIds, wishlistReleaseIds, wishlistMasterIds };
  }

  // ============================================
  // Discogs label-releases pagination
  // ============================================

  /**
   * Decide if a list of releases looks descending by year. We treat unknown
   * years as neutral (don't penalize) but require the populated entries to
   * be non-increasing.
   */
  private looksDescending(years: Array<number | undefined>): boolean {
    const populated = years.filter(
      (y): y is number => typeof y === 'number' && y > 0
    );
    if (populated.length < 2) return true; // can't tell — don't fall back
    for (let i = 1; i < populated.length; i++) {
      if (populated[i] > populated[i - 1]) return false;
    }
    return true;
  }

  /**
   * Try descending sort first; if Discogs ignores `sort` (BLOCK #3 mitigation),
   * fall back to ascending pagination with a hard cap. Returns released items
   * filtered by the lookback cutoff.
   */
  private async fetchLabelReleases(
    label: MonitoredLabel,
    headers: Record<string, string>,
    maxReleasesPerLabel: number,
    cutoffYear: number
  ): Promise<DiscogsLabelReleaseRaw[]> {
    // ---- Strategy A: descending sort ----
    let strategy: 'desc' | 'asc' = 'desc';
    let firstPageData: {
      releases: DiscogsLabelReleaseRaw[];
      pagination: DiscogsPagination;
    } | null = null;
    let firstPageDescResp: {
      releases: DiscogsLabelReleaseRaw[];
      pagination: DiscogsPagination;
    } | null = null;

    try {
      const resp = await this.executeWithRetry(
        () =>
          this.axios.get(`/labels/${label.discogsLabelId}/releases`, {
            headers,
            params: {
              page: 1,
              per_page: PER_PAGE,
              sort: 'year',
              sort_order: 'desc',
            },
          }),
        `label ${label.discogsLabelId} releases page 1 desc`
      );
      firstPageDescResp = {
        releases: (resp.data?.releases ?? []) as DiscogsLabelReleaseRaw[],
        pagination: resp.data?.pagination as DiscogsPagination,
      };
    } catch (error) {
      this.logger.warn(
        `Descending fetch for label ${label.discogsLabelId} failed, will try ascending`,
        error
      );
      strategy = 'asc';
    }

    // Verify descending sort by inspecting first page (and second page if available)
    if (strategy === 'desc' && firstPageDescResp) {
      const firstYears = firstPageDescResp.releases.map(r => r.year);
      let secondYears: Array<number | undefined> = [];
      if ((firstPageDescResp.pagination?.pages ?? 1) > 1) {
        try {
          const resp2 = await this.executeWithRetry(
            () =>
              this.axios.get(`/labels/${label.discogsLabelId}/releases`, {
                headers,
                params: {
                  page: 2,
                  per_page: PER_PAGE,
                  sort: 'year',
                  sort_order: 'desc',
                },
              }),
            `label ${label.discogsLabelId} releases page 2 desc`
          );
          secondYears = (
            (resp2.data?.releases ?? []) as DiscogsLabelReleaseRaw[]
          ).map(r => r.year);
        } catch (error) {
          this.logger.debug(
            'Could not fetch page 2 for descending verification',
            error
          );
        }
      }

      const combinedYears = [...firstYears, ...secondYears];
      if (!this.looksDescending(combinedYears)) {
        this.logger.info(
          `Label ${label.discogsLabelId}: Discogs sort ignored — falling back to ascending+cap`
        );
        strategy = 'asc';
      } else {
        this.logger.info(
          `Label ${label.discogsLabelId}: descending sort confirmed`
        );
        firstPageData = firstPageDescResp;
      }
    }

    const collected: DiscogsLabelReleaseRaw[] = [];

    if (strategy === 'desc' && firstPageData) {
      // Iterate in descending order; stop once we drop below cutoff year
      for (const r of firstPageData.releases) {
        if (collected.length >= maxReleasesPerLabel) break;
        if (typeof r.year === 'number' && r.year > 0 && r.year < cutoffYear) {
          // Past lookback window — desc means rest is older too
          return collected;
        }
        collected.push(r);
      }

      const totalPages = Math.min(
        firstPageData.pagination?.pages ?? 1,
        MAX_PAGES_PER_LABEL
      );
      let page = 2;
      while (page <= totalPages && collected.length < maxReleasesPerLabel) {
        if (this.scanAborted) return collected;
        let releases: DiscogsLabelReleaseRaw[] = [];
        try {
          const resp = await this.executeWithRetry(
            () =>
              this.axios.get(`/labels/${label.discogsLabelId}/releases`, {
                headers,
                params: {
                  page,
                  per_page: PER_PAGE,
                  sort: 'year',
                  sort_order: 'desc',
                },
              }),
            `label ${label.discogsLabelId} releases page ${page} desc`
          );
          releases = resp.data?.releases ?? [];
        } catch (error) {
          // Per-page failure (e.g. Discogs 403 above page 100, transient
          // network error). Return what we have so far rather than losing
          // all earlier pages.
          this.logger.warn(
            `Failed to fetch desc page ${page} for label ${label.discogsLabelId}; returning partial results (${collected.length} so far)`,
            error instanceof Error ? error.message : 'Unknown error'
          );
          return collected;
        }
        let hitCutoff = false;
        for (const r of releases) {
          if (collected.length >= maxReleasesPerLabel) break;
          if (typeof r.year === 'number' && r.year > 0 && r.year < cutoffYear) {
            hitCutoff = true;
            break;
          }
          collected.push(r);
        }
        if (hitCutoff) break;
        // Defensive: empty page from a non-final page means API anomaly.
        // Stop rather than loop forever.
        if (releases.length === 0) break;
        page++;
      }
      return collected;
    }

    // ---- Strategy B: ascending pagination with hard cap ----
    let page = 1;
    let totalPages = 1;
    let consecutiveEmptyPages = 0;
    do {
      if (this.scanAborted) break;
      let releases: DiscogsLabelReleaseRaw[] = [];
      try {
        const resp = await this.executeWithRetry(
          () =>
            this.axios.get(`/labels/${label.discogsLabelId}/releases`, {
              headers,
              params: { page, per_page: PER_PAGE },
            }),
          `label ${label.discogsLabelId} releases page ${page} asc`
        );
        releases = resp.data?.releases ?? [];
        totalPages = Math.min(
          resp.data?.pagination?.pages ?? totalPages,
          MAX_PAGES_PER_LABEL
        );
      } catch (error) {
        // Per-page failure — most commonly the Discogs 403 "Pagination above
        // 100 disabled" which `executeWithRetry` rethrows immediately. Return
        // partial results rather than losing everything.
        this.logger.warn(
          `Failed to fetch asc page ${page} for label ${label.discogsLabelId}; returning partial results (${collected.length} so far)`,
          error instanceof Error ? error.message : 'Unknown error'
        );
        return collected;
      }

      // Defensive: if Discogs returns empty pages indefinitely, stop.
      if (releases.length === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 2) break;
      } else {
        consecutiveEmptyPages = 0;
      }

      for (const r of releases) {
        // Apply lookback cutoff in ascending mode (skip too-old) but still
        // count against cap so we don't run away on huge catalogs.
        if (typeof r.year === 'number' && r.year > 0 && r.year < cutoffYear) {
          continue;
        }
        collected.push(r);
        if (collected.length >= maxReleasesPerLabel) break;
      }

      page++;
    } while (page <= totalPages && collected.length < maxReleasesPerLabel);

    return collected;
  }

  // ============================================
  // Scan lifecycle
  // ============================================

  async startScan(targetLabelId?: string): Promise<LabelScanStatus> {
    if (this.scanInProgress) {
      this.logger.warn('Label scan already in progress');
      return this.getScanStatus();
    }

    const labels = await this.getLabels();
    if (labels.length === 0) {
      const empty: LabelScanStatus = {
        status: 'completed',
        totalLabels: 0,
        processedLabels: 0,
        releasesFound: 0,
        startedAt: Date.now(),
        completedAt: Date.now(),
      };
      await this.writeScanStatus(empty);
      return empty;
    }

    this.scanInProgress = true;
    this.scanAborted = false;

    const initial: LabelScanStatus = {
      status: 'scanning',
      totalLabels: targetLabelId
        ? labels.filter(l => l.id === targetLabelId).length
        : labels.length,
      processedLabels: 0,
      releasesFound: 0,
      startedAt: Date.now(),
    };
    await this.writeScanStatus(initial);

    // Pass full labels array — runScanInBackground filters on targetLabelId.
    // runScanInBackground already has its own try/catch/finally; this .catch
    // is a defensive safety net for any rejection that escapes (which would
    // otherwise become an unhandled promise rejection and crash the process).
    void this.runScanInBackground(labels, targetLabelId).catch(async error => {
      try {
        this.logger.error('Background label scan failed (escaped)', error);
        await this.writeScanStatus({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: Date.now(),
        });
      } catch (statusError) {
        // Do not let a status-write failure bubble out as an unhandled
        // rejection — the original error has already been logged.
        this.logger.error(
          'Failed to write error status after background scan failure',
          statusError
        );
      } finally {
        this.scanInProgress = false;
        this.scanAborted = false;
      }
    });

    return initial;
  }

  async cancelScan(): Promise<boolean> {
    if (!this.scanInProgress) {
      this.logger.info('No label scan in progress to cancel');
      return false;
    }
    this.logger.info('Label scan cancellation requested');
    this.scanAborted = true;
    return true;
  }

  private async runScanInBackground(
    labels: MonitoredLabel[],
    targetLabelId?: string
  ): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      const settings = await this.getSettings();
      const refSets = await this.loadUserReferenceSets();
      const releasesStore = await this.getReleasesStore();
      const existingByKey = new Map<string, LabelRelease>();
      for (const r of releasesStore.releases) {
        existingByKey.set(`${r.labelId}:${r.discogsReleaseId}`, r);
      }

      const maxReleasesPerLabel =
        settings.maxReleasesPerLabel ?? DEFAULT_MAX_RELEASES_PER_LABEL;

      let processed = 0;
      let releasesFound = 0;

      const labelsToScan = targetLabelId
        ? labels.filter(l => l.id === targetLabelId)
        : labels;

      for (const label of labelsToScan) {
        if (this.scanAborted) {
          this.logger.info('Label scan cancelled between labels');
          await this.writeScanStatus({
            status: 'cancelled',
            processedLabels: processed,
            releasesFound,
            completedAt: Date.now(),
          });
          return;
        }

        await this.writeScanStatus({
          status: 'scanning',
          currentLabelId: label.id,
          currentLabelName: label.name,
          processedLabels: processed,
          releasesFound,
        });

        const lookbackMonths =
          label.lookbackMonths ?? settings.defaultLookbackMonths;
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - lookbackMonths);
        const cutoffYear = cutoffDate.getFullYear();

        let labelReleases: DiscogsLabelReleaseRaw[] = [];
        try {
          labelReleases = await this.fetchLabelReleases(
            label,
            headers,
            maxReleasesPerLabel,
            cutoffYear
          );
        } catch (error) {
          this.logger.error(
            `Failed to fetch releases for label ${label.name} (${label.discogsLabelId})`,
            error
          );
          processed++;
          continue;
        }

        for (const raw of labelReleases) {
          if (this.scanAborted) break;
          const key = `${label.id}:${raw.id}`;
          const existing = existingByKey.get(key);

          // Determine status
          const inCollection = refSets.collectionReleaseIds.has(raw.id);
          const inWishlist = refSets.wishlistReleaseIds.has(raw.id);
          let status: LabelRelease['status'];
          if (existing) {
            // Preserve seen/dismissed terminal states
            if (existing.status === 'seen' || existing.status === 'dismissed') {
              status = existing.status;
            } else if (inCollection) {
              status = 'in-collection';
            } else if (inWishlist) {
              status = 'in-wishlist';
            } else {
              status = 'new';
            }
          } else if (inCollection) {
            status = 'in-collection';
          } else if (inWishlist) {
            status = 'in-wishlist';
          } else {
            status = 'new';
          }

          const formatList: string[] = raw.format
            ? raw.format
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
            : [];

          const updated: LabelRelease = {
            id: existing?.id ?? crypto.randomUUID(),
            labelId: label.id,
            discogsReleaseId: raw.id,
            title: raw.title || existing?.title || 'Unknown Title',
            artist: raw.artist || existing?.artist || 'Unknown Artist',
            year: raw.year ?? existing?.year,
            format:
              formatList.length > 0 ? formatList : (existing?.format ?? []),
            thumbUrl: raw.thumb || existing?.thumbUrl,
            addedAt: existing?.addedAt ?? Date.now(),
            isInCollection: inCollection,
            isInWishlist: inWishlist,
            status,
          };

          if (!existing) {
            releasesFound++;
            existingByKey.set(key, updated);
            releasesStore.releases.push(updated);
          } else {
            // Update in place
            const idx = releasesStore.releases.findIndex(
              r => r.id === existing.id
            );
            if (idx >= 0) {
              releasesStore.releases[idx] = updated;
              existingByKey.set(key, updated);
            }
          }
        }

        // Incremental save after each label
        releasesStore.lastUpdated = Date.now();
        await this.fileStorage.writeJSONWithBackup(
          this.RELEASES_FILE,
          releasesStore
        );

        // Update label's lastScannedAt
        const labelsAll = await this.getLabels();
        const liveLabel = labelsAll.find(l => l.id === label.id);
        if (liveLabel) {
          liveLabel.lastScannedAt = Date.now();
          await this.fileStorage.writeJSONWithBackup(this.LABELS_FILE, {
            schemaVersion: 1,
            labels: labelsAll,
          } as MonitoredLabelsStore);
        }

        processed++;
        await this.writeScanStatus({
          processedLabels: processed,
          releasesFound,
        });
      }

      await this.writeScanStatus({
        status: this.scanAborted ? 'cancelled' : 'completed',
        processedLabels: processed,
        releasesFound,
        completedAt: Date.now(),
        currentLabelId: undefined,
        currentLabelName: undefined,
      });

      this.logger.info(
        `Label scan completed: ${processed} labels, ${releasesFound} new releases`
      );
    } catch (error) {
      this.logger.error('Label scan failed', error);
      await this.writeScanStatus({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: Date.now(),
      });
    } finally {
      this.scanInProgress = false;
      this.scanAborted = false;
    }
  }
}
