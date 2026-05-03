import crypto from 'crypto';

import * as cheerio from 'cheerio';

import {
  CollectionItem,
  MonitoredWebsite,
  MonitoredWebsitesStore,
  WebsiteItem,
  WebsiteItemsStore,
  WebsiteMonitoringSettings,
  WebsiteScanStatus,
  WebsiteScanStatusStore,
} from '../../shared/types';
import {
  createArtistAlbumKey,
  normalizeArtistName,
} from '../../shared/utils/trackNormalization';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { OllamaService } from './ollamaService';
import { WishlistService } from './wishlistService';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 500 * 1024; // 500KB
const DEFAULT_OLLAMA_MODEL = 'mistral';
const USER_AGENT = 'Listenography/1.0 (+website-monitor)';

interface ExtractedItemRaw {
  title?: unknown;
  artist?: unknown;
  format?: unknown;
  releaseDate?: unknown;
  price?: unknown;
  url?: unknown;
  confidence?: unknown;
}

export interface WebsitePreviewResult {
  items: WebsiteItem[];
  ollamaAvailable: boolean;
  warning?: string;
  rawTextPreview?: string;
  /** CSS selector recommended by Ollama, if it identified a clear product
   *  container on the page. Only present when Ollama extracted items
   *  successfully and recognized a useful selector. */
  suggestedCssSelector?: string;
}

interface MatchContext {
  wishlistAlbums: Set<string>; // "artist|title" lowercase
  wishlistArtists: Set<string>;
  localWantAlbums: Set<string>;
  localWantArtists: Set<string>;
  collectionArtists: Set<string>;
  lastfmArtists: Set<string>;
}

export class WebsiteMonitoringService {
  private fileStorage: FileStorage;
  private ollamaService: OllamaService;
  private logger = createLogger('WebsiteMonitoringService');

  private readonly WEBSITES_FILE = 'websites/monitored-websites.json';
  private readonly ITEMS_FILE = 'websites/items.json';
  private readonly SCAN_STATUS_FILE = 'websites/scan-status.json';
  private readonly SETTINGS_FILE = 'websites/settings.json';

  private scanInProgress = false;
  private scanAborted = false;
  private initialized = false;

  private wishlistService: WishlistService;

  constructor(
    fileStorage: FileStorage,
    ollamaService: OllamaService,
    wishlistService: WishlistService
  ) {
    this.fileStorage = fileStorage;
    this.ollamaService = ollamaService;
    this.wishlistService = wishlistService;
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const stored = await this.fileStorage.readJSON<WebsiteScanStatusStore>(
        this.SCAN_STATUS_FILE
      );
      const status = stored?.status;
      if (status && status.status === 'scanning') {
        this.logger.info(
          `Resetting stale website scan status from '${status.status}' to 'idle' (server restart detected)`
        );
        await this.writeScanStatus({ status: 'idle' });
      }
    } catch {
      // No status yet
    }
  }

  // ============================================
  // Settings
  // ============================================

  async getSettings(): Promise<WebsiteMonitoringSettings> {
    try {
      const stored = await this.fileStorage.readJSON<WebsiteMonitoringSettings>(
        this.SETTINGS_FILE
      );
      if (stored && stored.schemaVersion === 1) {
        return stored;
      }
    } catch {
      this.logger.debug('No website settings file, using defaults');
    }

    return {
      schemaVersion: 1,
      ollamaModel: DEFAULT_OLLAMA_MODEL,
      ollamaEnabled: true,
      fetchTimeoutMs: DEFAULT_TIMEOUT_MS,
      maxBytes: DEFAULT_MAX_BYTES,
    };
  }

  async saveSettings(
    update: Partial<WebsiteMonitoringSettings>
  ): Promise<WebsiteMonitoringSettings> {
    const current = await this.getSettings();
    const merged: WebsiteMonitoringSettings = {
      ...current,
      ...update,
      schemaVersion: 1,
    };
    await this.fileStorage.writeJSONWithBackup(this.SETTINGS_FILE, merged);
    this.logger.info('Website monitoring settings saved');
    return merged;
  }

  // ============================================
  // Scan status
  // ============================================

  async getScanStatus(): Promise<WebsiteScanStatus> {
    try {
      const stored = await this.fileStorage.readJSON<WebsiteScanStatusStore>(
        this.SCAN_STATUS_FILE
      );
      if (stored?.status) return stored.status;
    } catch {
      // No status yet
    }
    return { status: 'idle' };
  }

  private async writeScanStatus(
    update: Partial<WebsiteScanStatus>
  ): Promise<void> {
    const current = await this.getScanStatus();
    const merged: WebsiteScanStatus = { ...current, ...update };
    const store: WebsiteScanStatusStore = {
      schemaVersion: 1,
      status: merged,
    };
    await this.fileStorage.writeJSON(this.SCAN_STATUS_FILE, store);
  }

  // ============================================
  // Website CRUD
  // ============================================

  async getWebsites(): Promise<MonitoredWebsite[]> {
    try {
      const stored = await this.fileStorage.readJSON<MonitoredWebsitesStore>(
        this.WEBSITES_FILE
      );
      if (stored && stored.schemaVersion === 1) {
        return stored.websites;
      }
    } catch {
      this.logger.debug('No monitored websites file');
    }
    return [];
  }

  private validateUrl(url: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('URL must use http or https');
    }
    return parsed;
  }

  async addWebsite(input: {
    name: string;
    url: string;
    cssSelector?: string;
    useOllama?: boolean;
    enabled?: boolean;
  }): Promise<MonitoredWebsite> {
    if (!input.name || typeof input.name !== 'string') {
      throw new Error('name is required');
    }
    if (!input.url || typeof input.url !== 'string') {
      throw new Error('url is required');
    }
    this.validateUrl(input.url);

    const websites = await this.getWebsites();
    if (websites.some(w => w.url === input.url)) {
      throw new Error('Already monitoring this URL');
    }

    const website: MonitoredWebsite = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      url: input.url,
      cssSelector: input.cssSelector?.trim() || undefined,
      useOllama: input.useOllama ?? true,
      enabled: input.enabled ?? true,
      addedAt: Date.now(),
    };

    const store: MonitoredWebsitesStore = {
      schemaVersion: 1,
      websites: [...websites, website],
    };
    await this.fileStorage.writeJSONWithBackup(this.WEBSITES_FILE, store);
    this.logger.info(`Added website: ${website.name}`);
    return website;
  }

  async updateWebsite(
    id: string,
    update: Partial<MonitoredWebsite>
  ): Promise<MonitoredWebsite | null> {
    const websites = await this.getWebsites();
    const idx = websites.findIndex(w => w.id === id);
    if (idx === -1) return null;

    if (update.url) {
      this.validateUrl(update.url);
    }

    const merged: MonitoredWebsite = {
      ...websites[idx],
      ...update,
      id: websites[idx].id, // never let id be overwritten
      addedAt: websites[idx].addedAt,
    };
    websites[idx] = merged;
    const store: MonitoredWebsitesStore = {
      schemaVersion: 1,
      websites,
    };
    await this.fileStorage.writeJSONWithBackup(this.WEBSITES_FILE, store);
    return merged;
  }

  async removeWebsite(id: string): Promise<boolean> {
    const websites = await this.getWebsites();
    const idx = websites.findIndex(w => w.id === id);
    if (idx === -1) return false;
    websites.splice(idx, 1);
    const store: MonitoredWebsitesStore = {
      schemaVersion: 1,
      websites,
    };
    await this.fileStorage.writeJSONWithBackup(this.WEBSITES_FILE, store);

    const itemsStore = await this.getItemsStore();
    const before = itemsStore.items.length;
    itemsStore.items = itemsStore.items.filter(i => i.websiteId !== id);
    if (itemsStore.items.length !== before) {
      itemsStore.lastUpdated = Date.now();
      await this.fileStorage.writeJSONWithBackup(this.ITEMS_FILE, itemsStore);
    }
    this.logger.info(`Removed website: ${id}`);
    return true;
  }

  // ============================================
  // Items store
  // ============================================

  private async getItemsStore(): Promise<WebsiteItemsStore> {
    try {
      const stored = await this.fileStorage.readJSON<WebsiteItemsStore>(
        this.ITEMS_FILE
      );
      if (stored && stored.schemaVersion === 1) return stored;
    } catch {
      // No file yet
    }
    return {
      schemaVersion: 1,
      lastUpdated: Date.now(),
      items: [],
    };
  }

  async getItems(websiteId?: string): Promise<WebsiteItem[]> {
    const store = await this.getItemsStore();
    return websiteId
      ? store.items.filter(i => i.websiteId === websiteId)
      : store.items;
  }

  async markItemAsSeen(itemId: string): Promise<boolean> {
    const result = await this.markItemsAsSeen([itemId]);
    return result.updated > 0;
  }

  /**
   * Bulk-update many items to status='seen' in one read-mutate-write cycle.
   * Avoids the read-modify-write race when the frontend fires many parallel
   * single-item updates and only the last writer's mutation survives.
   */
  async markItemsAsSeen(
    itemIds: string[]
  ): Promise<{ updated: number; missing: string[] }> {
    if (itemIds.length === 0) return { updated: 0, missing: [] };
    const store = await this.getItemsStore();
    const idSet = new Set(itemIds);
    const found = new Set<string>();
    for (const item of store.items) {
      if (idSet.has(item.id)) {
        item.status = 'seen';
        found.add(item.id);
      }
    }
    if (found.size === 0) {
      return { updated: 0, missing: itemIds };
    }
    store.lastUpdated = Date.now();
    await this.fileStorage.writeJSONWithBackup(this.ITEMS_FILE, store);
    const missing = itemIds.filter(id => !found.has(id));
    return { updated: found.size, missing };
  }

  async dismissItem(itemId: string): Promise<boolean> {
    const result = await this.dismissItems([itemId]);
    return result.updated > 0;
  }

  /** See `markItemsAsSeen` — same shape, status='dismissed'. */
  async dismissItems(
    itemIds: string[]
  ): Promise<{ updated: number; missing: string[] }> {
    if (itemIds.length === 0) return { updated: 0, missing: [] };
    const store = await this.getItemsStore();
    const idSet = new Set(itemIds);
    const found = new Set<string>();
    for (const item of store.items) {
      if (idSet.has(item.id)) {
        item.status = 'dismissed';
        found.add(item.id);
      }
    }
    if (found.size === 0) {
      return { updated: 0, missing: itemIds };
    }
    store.lastUpdated = Date.now();
    await this.fileStorage.writeJSONWithBackup(this.ITEMS_FILE, store);
    const missing = itemIds.filter(id => !found.has(id));
    return { updated: found.size, missing };
  }

  // ============================================
  // Fetch + extract pipeline
  // ============================================

  /**
   * Fetch a URL with timeout and a hard byte cap.
   */
  private async fetchPage(
    url: string,
    timeoutMs: number,
    maxBytes: number
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(
          `Fetch failed: HTTP ${response.status} ${response.statusText}`
        );
      }

      const contentType = response.headers.get('content-type') || '';
      if (
        contentType &&
        !/text\/html|application\/xhtml/i.test(contentType) &&
        !/text\/plain/i.test(contentType)
      ) {
        // Non-HTML; reject before parsing
        throw new Error(`Unsupported content-type: ${contentType}`);
      }

      // Stream-style read with cap. We always cap, even when no reader is
      // available (some non-Node runtimes), to ensure we never load an
      // unbounded body into memory.
      const reader = response.body?.getReader();
      if (!reader) {
        const text = await response.text();
        if (text.length > maxBytes) {
          this.logger.warn(
            `Body exceeded ${maxBytes} bytes for ${url}; truncating (no reader available)`
          );
        }
        return text.length > maxBytes ? text.slice(0, maxBytes) : text;
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      let truncated = false;
      while (total < maxBytes) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const remaining = maxBytes - total;
        if (value.byteLength > remaining) {
          chunks.push(value.slice(0, remaining));
          total = maxBytes;
          truncated = true;
          break;
        }
        chunks.push(value);
        total += value.byteLength;
      }
      if (truncated) {
        this.logger.debug(
          `Body capped at ${maxBytes} bytes for ${url} (truncated mid-stream)`
        );
      }
      try {
        await reader.cancel();
      } catch {
        // ignore — cancelling an already-completed stream throws
      }

      const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
      return buffer.toString('utf-8');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Use cheerio to scope HTML to a CSS selector and return both the HTML
   * fragment and a normalized text representation.
   */
  private extractWithCheerio(
    html: string,
    selector?: string,
    maxBytes: number = DEFAULT_MAX_BYTES
  ): { text: string; html: string } {
    const $ = cheerio.load(html);
    // Strip noise nodes
    $('script, style, noscript, svg, iframe').remove();

    let scoped: cheerio.Cheerio<unknown> | null = null;
    if (selector) {
      try {
        const matched = $(selector);
        if (matched.length > 0) {
          scoped = matched as unknown as cheerio.Cheerio<unknown>;
        }
      } catch {
        // Bad selector — fall back to full body
      }
    }

    const target = scoped ?? $('body');
    const targetEl = target as unknown as { html(): string | null };
    const fragmentHtml = targetEl.html() || '';
    const targetText = (target as unknown as { text(): string }).text();
    const text = targetText
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join('\n');

    return {
      text: text.length > maxBytes ? text.slice(0, maxBytes) : text,
      html:
        fragmentHtml.length > maxBytes
          ? fragmentHtml.slice(0, maxBytes)
          : fragmentHtml,
    };
  }

  /**
   * Ask Ollama to extract structured product data. Returns null on any
   * extraction error so the caller can fall back to regex.
   */
  /**
   * Resolve a possibly-relative URL against the source page's URL. Returns
   * `undefined` when the input is falsy or doesn't parse. Absolute URLs are
   * returned unchanged.
   */
  private absolutizeUrl(href: string, baseUrl: string): string | undefined {
    if (!href) return undefined;
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return undefined;
    }
  }

  private async extractWithOllama(
    text: string,
    websiteId: string,
    sourceUrl: string
  ): Promise<{ items: WebsiteItem[]; suggestedCssSelector?: string } | null> {
    if (!text.trim()) return { items: [] };

    const settings = await this.getSettings();
    if (!settings.ollamaEnabled) return null;

    try {
      // Override model if user-configured
      this.ollamaService.updateSettings({
        enabled: true,
        model: settings.ollamaModel,
      });

      const prompt = [
        'Extract all vinyl/music products from this web page text.',
        'For each product, provide: title, artist, price (number), format (LP/2xLP/7"/CD/etc), releaseDate (ISO), url (if found), confidence (0-1).',
        'Return JSON of shape: { "items": [...], "suggestedCssSelector": "<selector or empty>" }. Only physical music releases, not merch or digital. If none, return { "items": [] }.',
        'For "suggestedCssSelector": if the page has an obvious repeating product container (e.g. ".product-card", ".release-list .item", "article.product"), return ONE concise CSS selector that targets the container element. Return empty string if no clear selector exists.',
      ].join(' ');

      const raw = await this.ollamaService.chat(
        [
          { role: 'system', content: prompt },
          { role: 'user', content: text },
        ],
        { jsonMode: true }
      );

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        this.logger.warn(
          `Ollama returned non-JSON for website ${websiteId}; falling back`,
          parseError
        );
        return null;
      }

      const itemsRaw: unknown =
        (parsed as { items?: unknown })?.items ??
        (Array.isArray(parsed) ? parsed : []);
      if (!Array.isArray(itemsRaw)) {
        this.logger.warn(
          `Ollama JSON missing items array for website ${websiteId}; falling back`
        );
        return null;
      }

      const rawSelector = (parsed as { suggestedCssSelector?: unknown })
        ?.suggestedCssSelector;
      const suggestedCssSelector =
        typeof rawSelector === 'string' && rawSelector.trim().length > 0
          ? rawSelector.trim()
          : undefined;

      const items: WebsiteItem[] = [];
      for (const entry of itemsRaw as ExtractedItemRaw[]) {
        if (!entry || typeof entry !== 'object') continue;
        const title = typeof entry.title === 'string' ? entry.title.trim() : '';
        if (!title) continue;
        const artist =
          typeof entry.artist === 'string' ? entry.artist.trim() : undefined;
        const format =
          typeof entry.format === 'string' ? entry.format.trim() : undefined;
        const releaseDate =
          typeof entry.releaseDate === 'string'
            ? entry.releaseDate.trim()
            : undefined;
        let price: number | undefined;
        if (typeof entry.price === 'number' && Number.isFinite(entry.price)) {
          price = entry.price;
        } else if (typeof entry.price === 'string') {
          const num = parseFloat(entry.price.replace(/[^0-9.]/g, ''));
          if (Number.isFinite(num)) price = num;
        }
        const rawUrl =
          typeof entry.url === 'string' && entry.url.trim()
            ? entry.url.trim()
            : undefined;
        const url = rawUrl ? this.absolutizeUrl(rawUrl, sourceUrl) : undefined;
        let confidence = 0.6;
        if (
          typeof entry.confidence === 'number' &&
          entry.confidence >= 0 &&
          entry.confidence <= 1
        ) {
          confidence = entry.confidence;
        }

        items.push({
          id: crypto.randomUUID(),
          websiteId,
          title,
          artist,
          format,
          formatKind: this.classifyFormat(format),
          releaseDate,
          price,
          url,
          extractedAt: Date.now(),
          confidence,
          status: 'new',
        });
      }
      return { items, suggestedCssSelector };
    } catch (error) {
      this.logger.warn(
        `Ollama extraction failed for website ${websiteId}; falling back`,
        error
      );
      return null;
    }
  }

  /**
   * Classify a format string as vinyl, non-vinyl, or unknown. Used both for
   * the vinyl-only filter and for the UI to show a format-aware badge.
   * `unknown` is treated as "keep" by the filter so we don't drop items the
   * extractor wasn't confident about.
   */
  private classifyFormat(
    format: string | undefined
  ): 'vinyl' | 'non-vinyl' | 'unknown' {
    if (!format) return 'unknown';
    const lower = format.toLowerCase();
    if (
      /\blp\b/.test(lower) ||
      /\bvinyl\b/.test(lower) ||
      /[27]"/.test(lower) ||
      /\b\d+x?lp\b/.test(lower) ||
      /\b\d+"\s*(single|ep|single)?\b/.test(lower)
    ) {
      return 'vinyl';
    }
    if (
      /\bcd\b/.test(lower) ||
      /\bcassette\b/.test(lower) ||
      /\btape\b/.test(lower) ||
      /\bdigital\b/.test(lower) ||
      /\bmp3\b/.test(lower) ||
      /\bflac\b/.test(lower) ||
      /\bstreaming\b/.test(lower) ||
      /\bdownload\b/.test(lower)
    ) {
      return 'non-vinyl';
    }
    return 'unknown';
  }

  /**
   * Best-effort regex-based extractor when Ollama is unavailable or returned
   * unusable output.
   */
  private extractFallback(text: string, websiteId: string): WebsiteItem[] {
    const items: WebsiteItem[] = [];
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const seen = new Set<string>();

    const priceRegex = /(?:\$|£|€|USD|GBP|EUR)\s*([0-9]+(?:[.,][0-9]{1,2})?)/i;
    const dashRegex =
      /^(?<artist>[^-]{1,80})[\s]*[-–—][\s]*(?<title>.{1,120})$/;

    for (const line of lines) {
      const match = dashRegex.exec(line);
      if (!match || !match.groups) continue;
      const artist = match.groups.artist.trim();
      const title = match.groups.title.trim();
      if (!artist || !title) continue;
      const key = `${artist.toLowerCase()}|${title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let price: number | undefined;
      const pm = priceRegex.exec(line);
      if (pm) {
        const num = parseFloat(pm[1].replace(',', '.'));
        if (Number.isFinite(num)) price = num;
      }

      items.push({
        id: crypto.randomUUID(),
        websiteId,
        title,
        artist,
        price,
        extractedAt: Date.now(),
        confidence: 0.2,
        status: 'new',
        formatKind: 'unknown',
        rawText: line.slice(0, 300),
      });

      if (items.length >= 50) break;
    }

    return items;
  }

  /**
   * Apply the vinyl-only format filter. Items whose format couldn't be
   * determined (`formatKind === 'unknown'`) are kept so we don't silently
   * drop potentially-relevant listings.
   */
  private applyFormatFilter(
    items: WebsiteItem[],
    mode: 'vinyl-only' | 'all' | undefined
  ): WebsiteItem[] {
    if (mode !== 'vinyl-only') return items;
    return items.filter(i => i.formatKind !== 'non-vinyl');
  }

  /**
   * Build a context of normalized lookup sets sourced from the user's wishlist,
   * local want list, Discogs collection, and Last.fm scrobble history.
   * Each source is best-effort: failure to load any one source returns an empty
   * Set rather than throwing.
   */
  private async getMatchContext(): Promise<MatchContext> {
    const ctx: MatchContext = {
      wishlistAlbums: new Set(),
      wishlistArtists: new Set(),
      localWantAlbums: new Set(),
      localWantArtists: new Set(),
      collectionArtists: new Set(),
      lastfmArtists: new Set(),
    };

    try {
      const wishlist = await this.wishlistService.getWishlistItems();
      for (const item of wishlist) {
        if (item.artist)
          ctx.wishlistArtists.add(normalizeArtistName(item.artist));
        if (item.artist && item.title) {
          ctx.wishlistAlbums.add(createArtistAlbumKey(item.artist, item.title));
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load wishlist for match context', error);
    }

    try {
      const localWants = await this.wishlistService.getLocalWantList();
      for (const item of localWants) {
        if (item.artist) {
          ctx.localWantArtists.add(normalizeArtistName(item.artist));
        }
        if (item.artist && item.album) {
          ctx.localWantAlbums.add(
            createArtistAlbumKey(item.artist, item.album)
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        'Failed to load local want list for match context',
        error
      );
    }

    try {
      const files = await this.fileStorage.listFiles('collections');
      for (const filename of files) {
        if (!/-page-\d+\.json$/.test(filename)) continue;
        const cached = await this.fileStorage.readJSON<{
          data?: CollectionItem[];
        }>(`collections/${filename}`);
        for (const ci of cached?.data ?? []) {
          if (ci.release?.artist) {
            ctx.collectionArtists.add(normalizeArtistName(ci.release.artist));
          }
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load collection for match context', error);
    }

    try {
      const index = await this.fileStorage.readJSON<{
        albums?: Record<string, unknown>;
      }>('history/scrobble-history-index.json');
      for (const key of Object.keys(index?.albums ?? {})) {
        // keys look like "artist|album" already lowercased — re-normalize so
        // "the von bondies|..." and "von bondies|..." both collapse correctly.
        const rawArtist = key.split('|', 1)[0];
        if (rawArtist) ctx.lastfmArtists.add(normalizeArtistName(rawArtist));
      }
    } catch (error) {
      this.logger.warn(
        'Failed to load scrobble history index for match context',
        error
      );
    }

    return ctx;
  }

  /**
   * Stamp `matches` flags on each item based on the cross-reference context.
   * Mutates items in place. All comparisons go through the shared
   * artist-name normalizer so "The Von Bondies" and "Von Bondies" collapse
   * to the same key, and Discogs "(2)" disambiguation suffixes are stripped.
   */
  private applyMatches(items: WebsiteItem[], ctx: MatchContext): void {
    for (const item of items) {
      const artistKey = normalizeArtistName(item.artist ?? '');
      const albumKey =
        item.artist && item.title
          ? createArtistAlbumKey(item.artist, item.title)
          : '';
      const matches: WebsiteItem['matches'] = {};
      if (albumKey && ctx.wishlistAlbums.has(albumKey)) {
        matches.onWishlist = true;
      }
      if (albumKey && ctx.localWantAlbums.has(albumKey)) {
        matches.onLocalWant = true;
      }
      if (artistKey && ctx.collectionArtists.has(artistKey)) {
        matches.artistInCollection = true;
      }
      if (artistKey && ctx.lastfmArtists.has(artistKey)) {
        matches.artistInLastfmTop = true;
      }
      if (Object.keys(matches).length > 0) {
        item.matches = matches;
      }
    }
  }

  /**
   * Preview the extraction pipeline for a URL without persisting anything.
   */
  async previewWebsite(
    url: string,
    cssSelector?: string
  ): Promise<WebsitePreviewResult> {
    this.validateUrl(url);
    const settings = await this.getSettings();

    let html = '';
    try {
      html = await this.fetchPage(
        url,
        settings.fetchTimeoutMs,
        settings.maxBytes
      );
    } catch (error) {
      throw new Error(
        `Failed to fetch URL: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }

    const { text } = this.extractWithCheerio(
      html,
      cssSelector,
      settings.maxBytes
    );

    let ollamaAvailable = false;
    if (settings.ollamaEnabled) {
      const conn = await this.ollamaService.checkConnection();
      ollamaAvailable = conn.connected;
    }

    let items: WebsiteItem[] | null = null;
    let suggestedCssSelector: string | undefined;
    if (ollamaAvailable) {
      const result = await this.extractWithOllama(text, 'preview', url);
      if (result) {
        items = result.items;
        suggestedCssSelector = result.suggestedCssSelector;
      }
    }

    let warning: string | undefined;
    if (!items) {
      items = this.extractFallback(text, 'preview');
      warning = ollamaAvailable
        ? 'Ollama returned unusable output — used regex fallback'
        : 'Ollama unavailable — used regex fallback';
    }

    items = this.applyFormatFilter(
      items,
      settings.formatFilter ?? 'vinyl-only'
    );

    try {
      const ctx = await this.getMatchContext();
      this.applyMatches(items, ctx);
    } catch (error) {
      this.logger.warn('Match context failed during preview', error);
    }

    return {
      items,
      ollamaAvailable,
      warning,
      rawTextPreview: text.slice(0, 1000),
      // Only suggest a selector when there isn't already one set by the user
      suggestedCssSelector: cssSelector ? undefined : suggestedCssSelector,
    };
  }

  // ============================================
  // Scan lifecycle
  // ============================================

  async startScan(targetWebsiteId?: string): Promise<WebsiteScanStatus> {
    if (this.scanInProgress) {
      this.logger.warn('Website scan already in progress');
      return this.getScanStatus();
    }

    const websites = await this.getWebsites();
    const all = targetWebsiteId
      ? websites.filter(w => w.id === targetWebsiteId)
      : websites.filter(w => w.enabled !== false);

    if (all.length === 0) {
      const empty: WebsiteScanStatus = {
        status: 'completed',
        totalWebsites: 0,
        processedWebsites: 0,
        itemsFound: 0,
        startedAt: Date.now(),
        completedAt: Date.now(),
        ollamaAvailable: false,
      };
      await this.writeScanStatus(empty);
      return empty;
    }

    this.scanInProgress = true;
    this.scanAborted = false;

    const initial: WebsiteScanStatus = {
      status: 'scanning',
      totalWebsites: all.length,
      processedWebsites: 0,
      itemsFound: 0,
      startedAt: Date.now(),
    };
    await this.writeScanStatus(initial);

    // runScanInBackground already has its own try/catch/finally; this .catch
    // is a defensive safety net for any rejection that escapes (which would
    // otherwise become an unhandled promise rejection and crash the process).
    void this.runScanInBackground(websites, targetWebsiteId).catch(
      async error => {
        try {
          this.logger.error('Background website scan failed (escaped)', error);
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
      }
    );

    return initial;
  }

  async cancelScan(): Promise<boolean> {
    if (!this.scanInProgress) {
      this.logger.info('No website scan in progress to cancel');
      return false;
    }
    this.logger.info('Website scan cancellation requested');
    this.scanAborted = true;
    return true;
  }

  private dedupeKey(item: WebsiteItem): string {
    const t = (item.title || '').toLowerCase().trim();
    const a = (item.artist || '').toLowerCase().trim();
    const p = item.price ?? '';
    return `${a}|${t}|${p}`;
  }

  private async runScanInBackground(
    websites: MonitoredWebsite[],
    targetWebsiteId?: string
  ): Promise<void> {
    try {
      const settings = await this.getSettings();
      const itemsStore = await this.getItemsStore();

      // Build cross-reference context once per scan — these reads are I/O
      // bound and don't change during a scan.
      const matchContext = await this.getMatchContext();

      // Index existing items by websiteId+dedupeKey to avoid duplicates
      const existingByKey = new Map<string, WebsiteItem>();
      for (const item of itemsStore.items) {
        existingByKey.set(`${item.websiteId}|${this.dedupeKey(item)}`, item);
      }

      const sitesToScan = (
        targetWebsiteId
          ? websites.filter(w => w.id === targetWebsiteId)
          : websites.filter(w => w.enabled !== false)
      ).slice();

      let processed = 0;
      let itemsFound = 0;

      // Detect Ollama availability up front
      let ollamaAvailable = false;
      if (settings.ollamaEnabled) {
        const conn = await this.ollamaService.checkConnection();
        ollamaAvailable = conn.connected;
        if (!ollamaAvailable) {
          this.logger.warn(
            `Ollama unavailable: ${conn.error || 'unknown'} — scans will use regex fallback`
          );
        }
      }
      await this.writeScanStatus({ ollamaAvailable });

      for (const website of sitesToScan) {
        if (this.scanAborted) {
          this.logger.info('Website scan cancelled between sites');
          await this.writeScanStatus({
            status: 'cancelled',
            processedWebsites: processed,
            itemsFound,
            completedAt: Date.now(),
          });
          return;
        }

        await this.writeScanStatus({
          status: 'scanning',
          currentWebsiteId: website.id,
          currentWebsiteName: website.name,
          processedWebsites: processed,
          itemsFound,
          ollamaAvailable,
        });

        try {
          const html = await this.fetchPage(
            website.url,
            settings.fetchTimeoutMs,
            settings.maxBytes
          );
          const { text } = this.extractWithCheerio(
            html,
            website.cssSelector,
            settings.maxBytes
          );

          let extracted: WebsiteItem[] | null = null;
          if (ollamaAvailable && website.useOllama !== false) {
            const result = await this.extractWithOllama(
              text,
              website.id,
              website.url
            );
            if (result) extracted = result.items;
          }
          if (!extracted) {
            extracted = this.extractFallback(text, website.id);
          }

          // Vinyl-only filter (default) drops explicit non-vinyl, keeps unknown
          extracted = this.applyFormatFilter(
            extracted,
            settings.formatFilter ?? 'vinyl-only'
          );
          // Stamp wishlist / collection / lastfm match flags
          this.applyMatches(extracted, matchContext);

          // Merge with dedup
          for (const item of extracted) {
            const key = `${website.id}|${this.dedupeKey(item)}`;
            if (existingByKey.has(key)) continue;
            // Stamp websiteId in case fallback used 'preview'
            item.websiteId = website.id;
            existingByKey.set(key, item);
            itemsStore.items.push(item);
            itemsFound++;
          }

          // Update website lastScannedAt
          const websitesAll = await this.getWebsites();
          const live = websitesAll.find(w => w.id === website.id);
          if (live) {
            live.lastScannedAt = Date.now();
            await this.fileStorage.writeJSONWithBackup(this.WEBSITES_FILE, {
              schemaVersion: 1,
              websites: websitesAll,
            } as MonitoredWebsitesStore);
          }
        } catch (error) {
          this.logger.error(`Failed to scan website ${website.name}`, error);
        }

        // Incremental save after each site
        itemsStore.lastUpdated = Date.now();
        await this.fileStorage.writeJSONWithBackup(this.ITEMS_FILE, itemsStore);

        processed++;
        await this.writeScanStatus({
          processedWebsites: processed,
          itemsFound,
        });
      }

      await this.writeScanStatus({
        status: this.scanAborted ? 'cancelled' : 'completed',
        processedWebsites: processed,
        itemsFound,
        completedAt: Date.now(),
        currentWebsiteId: undefined,
        currentWebsiteName: undefined,
        ollamaAvailable,
      });

      this.logger.info(
        `Website scan completed: ${processed} sites, ${itemsFound} new items`
      );
    } catch (error) {
      this.logger.error('Website scan failed', error);
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
