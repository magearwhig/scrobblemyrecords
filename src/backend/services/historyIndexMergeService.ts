import {
  ScrobbleHistoryIndex,
  MergeProposal,
  MergeReport,
  ScrobbleHistoryEntry,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { ArtistNameResolver } from './artistNameResolver';

const log = createLogger('historyIndexMergeService');

const HISTORY_INDEX_FILE = 'history/scrobble-history-index.json';

/**
 * Opt-in tool for merging split entries in scrobble-history-index.json.
 *
 * When the same album is scrobbled under different artist name variants
 * (e.g. "billy woods" vs "Billy Woods, Kenny Segal"), the history index
 * ends up with multiple entries for what is logically the same album.
 * This service detects those splits and merges them into a single
 * canonical entry.
 */
export class HistoryIndexMergeService {
  private resolver: ArtistNameResolver;
  private fileStorage: FileStorage;

  constructor(resolver: ArtistNameResolver, fileStorage: FileStorage) {
    this.resolver = resolver;
    this.fileStorage = fileStorage;
  }

  /**
   * Dry-run scan: find index entries that should be merged based on
   * artist name resolution.
   *
   * Groups entries where the resolved (canonical) artist + lowercased album
   * match but the original keys differ. For each group with 2+ entries,
   * produces a MergeProposal.
   */
  async findSplitEntries(): Promise<MergeProposal[]> {
    const index =
      await this.fileStorage.readJSON<ScrobbleHistoryIndex>(HISTORY_INDEX_FILE);
    if (!index) {
      log.info('No history index found, nothing to scan');
      return [];
    }

    // Group keys by (resolvedArtist, album)
    const groups = new Map<string, string[]>();

    for (const key of Object.keys(index.albums)) {
      const pipeIdx = key.indexOf('|');
      if (pipeIdx === -1) continue;

      const artist = key.substring(0, pipeIdx);
      const album = key.substring(pipeIdx + 1);

      const resolvedArtist = this.resolver.resolveArtist(artist);
      const groupKey = `${resolvedArtist}|${album.toLowerCase()}`;

      const existing = groups.get(groupKey);
      if (existing) {
        existing.push(key);
      } else {
        groups.set(groupKey, [key]);
      }
    }

    const proposals: MergeProposal[] = [];

    for (const keys of groups.values()) {
      if (keys.length < 2) continue;

      // Determine which key is canonical: the one whose artist matches
      // the resolved name (or first match if multiple do)
      const canonicalKey = this.pickCanonicalKey(keys);
      const nonCanonicalKeys = keys.filter(k => k !== canonicalKey);

      for (const sourceKey of nonCanonicalKeys) {
        const sourceEntry = index.albums[sourceKey];
        const targetEntry = index.albums[canonicalKey];

        // Compute merged play count after dedup by timestamp
        const mergedPlays = this.deduplicatePlays([
          ...targetEntry.plays,
          ...sourceEntry.plays,
        ]);

        proposals.push({
          sourceKey,
          targetKey: canonicalKey,
          sourcePlayCount: sourceEntry.playCount,
          targetPlayCount: targetEntry.playCount,
          mergedPlayCount: mergedPlays.length,
        });
      }
    }

    log.info(`Found ${proposals.length} split entries to merge`);
    return proposals;
  }

  /**
   * Execute merge: applies proposals to the history index.
   * Creates a backup before any changes.
   */
  async executeMerge(proposals: MergeProposal[]): Promise<MergeReport> {
    if (proposals.length === 0) {
      return { mergedCount: 0, proposals: [], backupPath: '' };
    }

    const index =
      await this.fileStorage.readJSON<ScrobbleHistoryIndex>(HISTORY_INDEX_FILE);
    if (!index) {
      throw new Error('History index not found, cannot execute merge');
    }

    // Create backup before making changes
    const backupPath = await this.fileStorage.createBackup(HISTORY_INDEX_FILE);
    log.info(`Created backup at ${backupPath ?? 'unknown'}`);

    let mergedCount = 0;

    for (const proposal of proposals) {
      const sourceEntry = index.albums[proposal.sourceKey];
      const targetEntry = index.albums[proposal.targetKey];

      if (!sourceEntry || !targetEntry) {
        log.warn(
          `Skipping proposal: source="${proposal.sourceKey}" or target="${proposal.targetKey}" not found in index`
        );
        continue;
      }

      // Merge plays with dedup by timestamp
      const mergedPlays = this.deduplicatePlays([
        ...targetEntry.plays,
        ...sourceEntry.plays,
      ]);

      // Update target entry
      targetEntry.plays = mergedPlays;
      targetEntry.playCount = mergedPlays.length;
      targetEntry.lastPlayed = Math.max(
        targetEntry.lastPlayed,
        sourceEntry.lastPlayed
      );

      // Remove source entry
      delete index.albums[proposal.sourceKey];
      mergedCount++;
    }

    // Write the merged index (backup already created above)
    await this.fileStorage.writeJSON(HISTORY_INDEX_FILE, index);
    log.info(`Merged ${mergedCount} split entries`);

    return {
      mergedCount,
      proposals,
      backupPath: backupPath ?? '',
    };
  }

  /**
   * Pick the canonical key from a group of keys. The canonical key is
   * the one whose artist portion matches the resolved artist name.
   * Falls back to the first key if none match exactly.
   */
  private pickCanonicalKey(keys: string[]): string {
    for (const key of keys) {
      const pipeIdx = key.indexOf('|');
      const artist = key.substring(0, pipeIdx);
      const resolved = this.resolver.resolveArtist(artist);
      if (resolved === artist.toLowerCase()) {
        return key;
      }
    }
    // Fallback: return first key
    return keys[0];
  }

  /**
   * Deduplicate plays by timestamp. If two plays share the same timestamp,
   * keep only one.
   */
  private deduplicatePlays(
    plays: ScrobbleHistoryEntry[]
  ): ScrobbleHistoryEntry[] {
    const seen = new Set<number>();
    const result: ScrobbleHistoryEntry[] = [];

    for (const play of plays) {
      if (!seen.has(play.timestamp)) {
        seen.add(play.timestamp);
        result.push(play);
      }
    }

    // Sort by timestamp descending (most recent first)
    result.sort((a, b) => b.timestamp - a.timestamp);
    return result;
  }
}
