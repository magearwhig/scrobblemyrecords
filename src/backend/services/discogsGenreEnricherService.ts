/**
 * Discogs Genre Enricher Service
 *
 * Enriches collection releases with genre and style data from Discogs.
 * Collection cache pages only contain basic_information (no genres/styles),
 * so this service fetches full release details to populate those fields.
 */

import { DiscogsRelease } from '../../shared/types';
import { createLogger } from '../utils/logger';

import { DiscogsService } from './discogsService';

const log = createLogger('DiscogsGenreEnricherService');

export class DiscogsGenreEnricherService {
  private discogsService: DiscogsService;

  constructor(discogsService: DiscogsService) {
    this.discogsService = discogsService;
  }

  /**
   * Enrich a batch of releases with Discogs genres and styles.
   * Mutates each release in place, adding genres/styles from the full release details.
   * Leverages existing getReleaseDetails() caching.
   */
  async enrichBatch(
    releases: DiscogsRelease[],
    onProgress?: (current: number, total: number) => void
  ): Promise<{ enriched: number; skipped: number; failed: number }> {
    let enriched = 0;
    let skipped = 0;
    let failed = 0;

    const needsEnrichment = releases.filter(
      r => r.genres === undefined || r.genres.length === 0
    );

    log.info(
      `Enriching ${needsEnrichment.length}/${releases.length} releases with Discogs genres`
    );

    for (let i = 0; i < needsEnrichment.length; i++) {
      const release = needsEnrichment[i];
      onProgress?.(i + 1, needsEnrichment.length);

      try {
        const details = await this.discogsService.getReleaseDetails(release.id);
        if (details) {
          release.genres = details.genres ?? [];
          release.styles = details.styles ?? [];
          enriched++;
        } else {
          release.genres = [];
          release.styles = [];
          skipped++;
        }
      } catch (err) {
        log.warn('Failed to fetch genre details for release', {
          releaseId: release.id,
          err,
        });
        release.genres = [];
        release.styles = [];
        failed++;
      }
    }

    const alreadyHad = releases.length - needsEnrichment.length;
    log.info(
      `Genre enrichment complete: ${enriched} enriched, ${alreadyHad} already had genres, ${skipped} skipped, ${failed} failed`
    );

    return { enriched, skipped, failed };
  }
}
