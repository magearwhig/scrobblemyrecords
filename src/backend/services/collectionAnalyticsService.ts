import {
  CachedReleaseValue,
  CollectionAnalyticsOverview,
  CollectionItem,
  CollectionSummary,
  CollectionValueCacheStore,
  CollectionValueEstimation,
  CollectionValueItem,
  CollectionValueScanStatusStore,
  DecadeBucket,
  DecadeHistogram,
  FormatBreakdown,
  FormatCategory,
  GrowthDataPoint,
  GrowthTimeline,
  LabelCount,
  LabelDistribution,
  MarketplaceStats,
  ValueScanStatus,
  YearBucket,
} from '../../shared/types';
import { getAllCachedCollectionItems } from '../utils/collectionCache';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { AuthService } from './authService';
import { WishlistService } from './wishlistService';

const log = createLogger('CollectionAnalyticsService');

const VALUE_CACHE_PATH = 'collection-analytics/value-cache.json';
const SCAN_STATUS_PATH = 'collection-analytics/scan-status.json';

const FORMAT_CATEGORIES: Record<string, string> = {
  LP: 'LP (12")',
  '12"': '12" Single/EP',
  '10"': '10"',
  '7"': '7" Single',
  'Box Set': 'Box Set',
  'Flexi-disc': 'Flexi-disc',
  Shellac: 'Shellac (78rpm)',
  'Picture Disc': 'Picture Disc',
  Vinyl: 'Vinyl (Other)',
  CD: 'CD',
  Cassette: 'Cassette',
  File: 'Digital',
};

const LABEL_SUFFIX_PATTERN =
  /\s*(Ltd\.?|Inc\.?|Records|Recordings|Music|Rec\.?|Co\.?|Entertainment|Group)\s*$/i;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export class CollectionAnalyticsService {
  private fileStorage: FileStorage;
  private authService: AuthService;
  private wishlistService: WishlistService;
  private scanning = false;

  constructor(
    fileStorage: FileStorage,
    authService: AuthService,
    wishlistService: WishlistService
  ) {
    this.fileStorage = fileStorage;
    this.authService = authService;
    this.wishlistService = wishlistService;
  }

  private async loadCollection(): Promise<CollectionItem[]> {
    const settings = await this.authService.getUserSettings();
    const username = settings.discogs.username;
    if (!username) {
      log.warn('No Discogs username configured');
      return [];
    }

    return getAllCachedCollectionItems(username, this.fileStorage);
  }

  async getCollectionOverview(): Promise<CollectionAnalyticsOverview> {
    const collection = await this.loadCollection();

    const [summary, formats, labels, decades, growth] = await Promise.all([
      this.getCollectionSummary(collection),
      this.getFormatBreakdown(collection),
      this.getLabelDistribution(collection),
      this.getDecadeHistogram(collection),
      this.getGrowthTimeline(collection),
    ]);

    return { summary, formats, labels, decades, growth };
  }

  async getFormatBreakdown(
    collection: CollectionItem[]
  ): Promise<FormatBreakdown> {
    const categoryMap = new Map<
      string,
      {
        count: number;
        examples: { artist: string; title: string; coverImage?: string }[];
      }
    >();

    for (const item of collection) {
      const formats = item.release.format || [];
      let matched = false;

      for (const formatKey of Object.keys(FORMAT_CATEGORIES)) {
        if (formats.some(f => f.includes(formatKey))) {
          const categoryName = FORMAT_CATEGORIES[formatKey];
          const entry = categoryMap.get(categoryName) || {
            count: 0,
            examples: [],
          };
          entry.count++;
          if (entry.examples.length < 3) {
            entry.examples.push({
              artist: item.release.artist,
              title: item.release.title,
              coverImage: item.release.cover_image,
            });
          }
          categoryMap.set(categoryName, entry);
          matched = true;
          break;
        }
      }

      if (!matched) {
        const entry = categoryMap.get('Other') || { count: 0, examples: [] };
        entry.count++;
        if (entry.examples.length < 3) {
          entry.examples.push({
            artist: item.release.artist,
            title: item.release.title,
            coverImage: item.release.cover_image,
          });
        }
        categoryMap.set('Other', entry);
      }
    }

    const totalItems = collection.length;
    const categories: FormatCategory[] = Array.from(categoryMap.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        percentage:
          totalItems > 0
            ? Math.round((data.count / totalItems) * 1000) / 10
            : 0,
        examples: data.examples,
      }))
      .sort((a, b) => b.count - a.count);

    return { categories, totalItems };
  }

  async getLabelDistribution(
    collection: CollectionItem[]
  ): Promise<LabelDistribution> {
    const normalizedMap = new Map<
      string,
      { variants: Map<string, number>; count: number }
    >();

    for (const item of collection) {
      const labels = item.release.label || [];
      for (const rawLabel of labels) {
        const trimmed = rawLabel.trim();
        if (!trimmed) continue;

        const normalized = trimmed
          .replace(LABEL_SUFFIX_PATTERN, '')
          .trim()
          .toLowerCase();
        const key = normalized || trimmed.toLowerCase();

        const entry = normalizedMap.get(key) || {
          variants: new Map<string, number>(),
          count: 0,
        };
        entry.count++;
        entry.variants.set(trimmed, (entry.variants.get(trimmed) || 0) + 1);
        normalizedMap.set(key, entry);
      }
    }

    const totalItems = collection.length;
    const labels: LabelCount[] = Array.from(normalizedMap.entries())
      .map(([, data]) => {
        // Pick most common variant as canonical name
        let canonicalName = '';
        let maxVariantCount = 0;
        for (const [variant, count] of data.variants) {
          if (count > maxVariantCount) {
            maxVariantCount = count;
            canonicalName = variant;
          }
        }

        return {
          name: canonicalName,
          count: data.count,
          percentage:
            totalItems > 0
              ? Math.round((data.count / totalItems) * 1000) / 10
              : 0,
          variants: Array.from(data.variants.keys()),
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      labels,
      totalLabels: labels.length,
      totalItems,
    };
  }

  async getDecadeHistogram(
    collection: CollectionItem[]
  ): Promise<DecadeHistogram> {
    const decadeMap = new Map<number, number>();
    const yearMap = new Map<number, number>();
    let unknownYearCount = 0;

    for (const item of collection) {
      const year = item.release.year;
      if (!year || year === 0) {
        unknownYearCount++;
        continue;
      }

      yearMap.set(year, (yearMap.get(year) || 0) + 1);

      const decadeStart = Math.floor(year / 10) * 10;
      decadeMap.set(decadeStart, (decadeMap.get(decadeStart) || 0) + 1);
    }

    const knownCount = collection.length - unknownYearCount;

    const decades: DecadeBucket[] = Array.from(decadeMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([startYear, count]) => ({
        decade: `${startYear}s`,
        startYear,
        count,
        percentage:
          knownCount > 0 ? Math.round((count / knownCount) * 1000) / 10 : 0,
      }));

    const years: YearBucket[] = Array.from(yearMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, count]) => ({ year, count }));

    return { decades, years, unknownYearCount };
  }

  async getGrowthTimeline(
    collectionOrGranularity?: CollectionItem[] | 'month' | 'year',
    granularity: 'month' | 'year' = 'month'
  ): Promise<GrowthTimeline> {
    let collection: CollectionItem[];
    if (Array.isArray(collectionOrGranularity)) {
      collection = collectionOrGranularity;
    } else {
      if (
        collectionOrGranularity === 'month' ||
        collectionOrGranularity === 'year'
      ) {
        granularity = collectionOrGranularity;
      }
      collection = await this.loadCollection();
    }
    const periodMap = new Map<string, number>();

    for (const item of collection) {
      if (!item.date_added) continue;

      const date = new Date(item.date_added);
      if (isNaN(date.getTime())) continue;

      let period: string;
      if (granularity === 'month') {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        period = `${date.getFullYear()}-${month}`;
      } else {
        period = `${date.getFullYear()}`;
      }

      periodMap.set(period, (periodMap.get(period) || 0) + 1);
    }

    const sortedPeriods = Array.from(periodMap.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    let cumulative = 0;
    const dataPoints: GrowthDataPoint[] = sortedPeriods.map(
      ([period, added]) => {
        cumulative += added;
        return { period, added, cumulative };
      }
    );

    return {
      dataPoints,
      granularity,
      totalAdded: collection.length,
    };
  }

  async getCollectionSummary(
    collection: CollectionItem[]
  ): Promise<CollectionSummary> {
    const totalItems = collection.length;

    const artistSet = new Set<string>();
    const labelSet = new Set<string>();
    let oldestRelease: { year: number; artist: string; title: string } | null =
      null;
    let newestRelease: { year: number; artist: string; title: string } | null =
      null;
    let oldestAddition: { date: string; artist: string; title: string } | null =
      null;
    let newestAddition: { date: string; artist: string; title: string } | null =
      null;
    let yearSum = 0;
    let yearCount = 0;
    let ratingSum = 0;
    let ratedCount = 0;

    for (const item of collection) {
      const { release } = item;
      artistSet.add(release.artist);
      if (release.label) {
        for (const l of release.label) {
          labelSet.add(l);
        }
      }

      const year = release.year;
      if (year && year > 0) {
        yearSum += year;
        yearCount++;
        if (!oldestRelease || year < oldestRelease.year) {
          oldestRelease = {
            year,
            artist: release.artist,
            title: release.title,
          };
        }
        if (!newestRelease || year > newestRelease.year) {
          newestRelease = {
            year,
            artist: release.artist,
            title: release.title,
          };
        }
      }

      if (item.date_added) {
        if (!oldestAddition || item.date_added < oldestAddition.date) {
          oldestAddition = {
            date: item.date_added,
            artist: release.artist,
            title: release.title,
          };
        }
        if (!newestAddition || item.date_added > newestAddition.date) {
          newestAddition = {
            date: item.date_added,
            artist: release.artist,
            title: release.title,
          };
        }
      }

      if (item.rating && item.rating > 0) {
        ratingSum += item.rating;
        ratedCount++;
      }
    }

    return {
      totalItems,
      totalArtists: artistSet.size,
      totalLabels: labelSet.size,
      oldestRelease,
      newestRelease,
      oldestAddition,
      newestAddition,
      averageReleaseYear:
        yearCount > 0 ? Math.round(yearSum / yearCount) : null,
      ratedCount,
      averageRating:
        ratedCount > 0 ? Math.round((ratingSum / ratedCount) * 10) / 10 : null,
    };
  }

  async getCollectionValue(): Promise<{
    estimation: CollectionValueEstimation | null;
    scanStatus: ValueScanStatus;
    lastScanTimestamp: number | null;
    cacheAge: number;
  }> {
    const estimation = await this.getValueEstimation();
    const scanStatus = await this.getValueScanStatus();
    const cacheStore =
      await this.fileStorage.readJSON<CollectionValueCacheStore>(
        VALUE_CACHE_PATH
      );
    const lastScanTimestamp = cacheStore?.lastUpdated ?? null;
    const cacheAge = lastScanTimestamp ? Date.now() - lastScanTimestamp : 0;
    return { estimation, scanStatus, lastScanTimestamp, cacheAge };
  }

  async getValueEstimation(): Promise<CollectionValueEstimation | null> {
    const cacheStore =
      await this.fileStorage.readJSON<CollectionValueCacheStore>(
        VALUE_CACHE_PATH
      );
    if (
      !cacheStore ||
      !cacheStore.items ||
      Object.keys(cacheStore.items).length === 0
    ) {
      return null;
    }

    const collection = await this.loadCollection();
    const items = cacheStore.items;

    let totalEstimatedValue = 0;
    let totalLowestValue = 0;
    let totalHighestValue = 0;
    let itemsWithPricing = 0;
    let itemsWithoutPricing = 0;
    const currencies = new Set<string>();
    const valueItems: CollectionValueItem[] = [];

    const decadeValueMap = new Map<string, { value: number; count: number }>();
    const formatValueMap = new Map<string, { value: number; count: number }>();

    for (const item of collection) {
      const cached = items[item.release.id];
      if (!cached || cached.medianPrice === undefined) {
        itemsWithoutPricing++;
        continue;
      }

      itemsWithPricing++;
      const median = cached.medianPrice ?? 0;
      totalEstimatedValue += median;
      totalLowestValue += cached.lowestPrice ?? median;
      totalHighestValue += cached.highestPrice ?? median;
      currencies.add(cached.currency);

      valueItems.push({
        releaseId: item.release.id,
        artist: item.release.artist,
        title: item.release.title,
        year: item.release.year,
        format: item.release.format,
        coverImage: item.release.cover_image,
        estimatedValue: median,
        lowestPrice: cached.lowestPrice,
        highestPrice: cached.highestPrice,
        numForSale: cached.numForSale,
        currency: cached.currency,
      });

      // Aggregate by decade
      const year = item.release.year;
      if (year && year > 0) {
        const decadeStart = Math.floor(year / 10) * 10;
        const decadeKey = `${decadeStart}s`;
        const decadeEntry = decadeValueMap.get(decadeKey) || {
          value: 0,
          count: 0,
        };
        decadeEntry.value += median;
        decadeEntry.count++;
        decadeValueMap.set(decadeKey, decadeEntry);
      }

      // Aggregate by format
      const formatName = this.classifyFormat(item.release.format);
      const formatEntry = formatValueMap.get(formatName) || {
        value: 0,
        count: 0,
      };
      formatEntry.value += median;
      formatEntry.count++;
      formatValueMap.set(formatName, formatEntry);
    }

    // Sort value items for most/least valuable
    valueItems.sort((a, b) => b.estimatedValue - a.estimatedValue);
    const mostValuableItems = valueItems.slice(0, 10);
    const leastValuableItems = valueItems
      .filter(v => v.estimatedValue > 0)
      .slice(-10)
      .reverse();

    const valueByDecade = Array.from(decadeValueMap.entries())
      .map(([decade, data]) => ({
        decade,
        value: Math.round(data.value * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => a.decade.localeCompare(b.decade));

    const valueByFormat = Array.from(formatValueMap.entries())
      .map(([format, data]) => ({
        format,
        value: Math.round(data.value * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      totalEstimatedValue: Math.round(totalEstimatedValue * 100) / 100,
      totalLowestValue: Math.round(totalLowestValue * 100) / 100,
      totalHighestValue: Math.round(totalHighestValue * 100) / 100,
      currency: currencies.size === 1 ? Array.from(currencies)[0] : 'USD',
      itemsWithPricing,
      itemsWithoutPricing,
      totalItems: collection.length,
      averageItemValue:
        itemsWithPricing > 0
          ? Math.round((totalEstimatedValue / itemsWithPricing) * 100) / 100
          : 0,
      mostValuableItems,
      leastValuableItems,
      valueByDecade,
      valueByFormat,
      mixedCurrencies: currencies.size > 1,
    };
  }

  async startValueScan(
    batchSize: number = 20,
    force: boolean = false
  ): Promise<void> {
    if (this.scanning) {
      throw new Error('Value scan already in progress');
    }

    this.scanning = true;
    const startedAt = Date.now();

    try {
      const collection = await this.loadCollection();
      if (collection.length === 0) {
        log.warn('No collection items to scan');
        return;
      }

      // Load existing cache
      const cacheStore =
        (await this.fileStorage.readJSON<CollectionValueCacheStore>(
          VALUE_CACHE_PATH
        )) || {
          schemaVersion: 1 as const,
          lastUpdated: 0,
          items: {},
        };

      // Filter items needing fresh data
      const now = Date.now();
      const itemsToScan = collection.filter(item => {
        if (force) return true;
        const cached = cacheStore.items[item.release.id];
        if (!cached) return true;
        return now - cached.fetchedAt > SEVEN_DAYS_MS;
      });

      const totalItems = itemsToScan.length;
      log.info(`Starting value scan: ${totalItems} items to process`);

      // Initialize scan status
      await this.updateScanStatus({
        status: 'scanning',
        itemsScanned: 0,
        totalItems,
        progress: 0,
        startedAt,
      });

      let itemsScanned = 0;

      for (let i = 0; i < totalItems; i += batchSize) {
        const batch = itemsToScan.slice(i, i + batchSize);

        for (const item of batch) {
          try {
            await this.updateScanStatus({
              status: 'scanning',
              itemsScanned,
              totalItems,
              progress:
                totalItems > 0
                  ? Math.round((itemsScanned / totalItems) * 100)
                  : 0,
              currentItem: `${item.release.artist} - ${item.release.title}`,
              startedAt,
              estimatedTimeRemaining: this.estimateTimeRemaining(
                itemsScanned,
                totalItems,
                startedAt
              ),
            });

            const stats: MarketplaceStats | null =
              await this.wishlistService.getMarketplaceStats(item.release.id);

            if (stats) {
              const cachedValue: CachedReleaseValue = {
                releaseId: item.release.id,
                lowestPrice: stats.lowestPrice,
                medianPrice: stats.medianPrice,
                highestPrice: stats.highestPrice,
                numForSale: stats.numForSale,
                currency: stats.currency,
                fetchedAt: Date.now(),
              };
              cacheStore.items[item.release.id] = cachedValue;
            }

            itemsScanned++;
          } catch (error) {
            log.error(
              `Failed to fetch marketplace stats for release ${item.release.id}`,
              error
            );
            itemsScanned++;
          }
        }

        // Save cache after each batch
        cacheStore.lastUpdated = Date.now();
        await this.fileStorage.writeJSONWithBackup(
          VALUE_CACHE_PATH,
          cacheStore
        );
      }

      // Mark scan as completed
      await this.updateScanStatus({
        status: 'completed',
        itemsScanned,
        totalItems,
        progress: 100,
        lastScanTimestamp: Date.now(),
        startedAt,
      });

      log.info(`Value scan completed: ${itemsScanned} items processed`);
    } catch (error) {
      log.error('Value scan failed', error);
      await this.updateScanStatus({
        status: 'error',
        itemsScanned: 0,
        totalItems: 0,
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        startedAt,
      });
      throw error;
    } finally {
      this.scanning = false;
    }
  }

  async getValueScanStatus(): Promise<ValueScanStatus> {
    const statusStore =
      await this.fileStorage.readJSON<CollectionValueScanStatusStore>(
        SCAN_STATUS_PATH
      );

    if (!statusStore || !statusStore.status) {
      return {
        status: 'idle',
        itemsScanned: 0,
        totalItems: 0,
        progress: 0,
      };
    }

    return statusStore.status;
  }

  private async updateScanStatus(status: ValueScanStatus): Promise<void> {
    const store: CollectionValueScanStatusStore = {
      schemaVersion: 1,
      status,
    };
    await this.fileStorage.writeJSON(SCAN_STATUS_PATH, store);
  }

  private classifyFormat(formats: string[]): string {
    for (const formatKey of Object.keys(FORMAT_CATEGORIES)) {
      if (formats.some(f => f.includes(formatKey))) {
        return FORMAT_CATEGORIES[formatKey];
      }
    }
    return 'Other';
  }

  private estimateTimeRemaining(
    itemsScanned: number,
    totalItems: number,
    startedAt: number
  ): number | undefined {
    if (itemsScanned === 0) return undefined;
    const elapsed = Date.now() - startedAt;
    const avgTimePerItem = elapsed / itemsScanned;
    const remaining = totalItems - itemsScanned;
    return Math.round(avgTimePerItem * remaining);
  }
}
