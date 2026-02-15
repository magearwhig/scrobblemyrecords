import { AlbumMapping } from '../../shared/types';
import { createLogger } from '../utils/logger';

import { ArtistMapping as DiscogsArtistMapping } from './artistMappingService';
import { MappingService } from './mappingService';

const log = createLogger('artistNameResolver');

/** Result from detecting missing scrobble mappings */
export interface MissingScrobbleMapping {
  discogsName: string;
  lastfmName: string;
}

/**
 * Interface for the subset of ArtistMappingService methods we depend on.
 * Avoids importing the singleton directly and enables testing.
 */
export interface ArtistMappingServiceLike {
  getAllMappings(): DiscogsArtistMapping[];
  hasMapping(discogsName: string): boolean;
}

/**
 * Read-only aggregator that builds a bidirectional alias graph from all
 * existing mapping data. Uses union-find with path compression for
 * transitive alias resolution.
 *
 * This service creates NO data files -- it is purely in-memory.
 */
export class ArtistNameResolver {
  /** any lowercased name -> canonical lowercased name */
  private aliasToCanonical: Map<string, string> = new Map();
  /** canonical -> all known lowercased aliases */
  private canonicalToAliases: Map<string, Set<string>> = new Map();
  /** canonical lowercased -> preferred display casing */
  private displayNames: Map<string, string> = new Map();

  /** Union-find parent pointers (lowercased name -> parent lowercased name) */
  private parent: Map<string, string> = new Map();
  /** Union-find rank for union-by-rank */
  private rank: Map<string, number> = new Map();

  private artistMappingService: ArtistMappingServiceLike;
  private mappingService: MappingService;

  constructor(
    artistMappingService: ArtistMappingServiceLike,
    mappingService: MappingService
  ) {
    this.artistMappingService = artistMappingService;
    this.mappingService = mappingService;
  }

  // ---------------------------------------------------------------------------
  // Union-Find helpers
  // ---------------------------------------------------------------------------

  /**
   * Ensure a node exists in the union-find structure.
   */
  private makeSet(name: string): void {
    const key = name.toLowerCase();
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
  }

  /**
   * Find the root representative for a name with path compression.
   */
  private find(name: string): string {
    const key = name.toLowerCase();
    this.makeSet(key);

    let root = key;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }

    // Path compression
    let current = key;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }

    return root;
  }

  /**
   * Union two names into the same equivalence class.
   * preferredRoot, if provided, will be forced as the root of the merged set.
   */
  private union(a: string, b: string, preferredRoot?: string): void {
    const keyA = a.toLowerCase();
    const keyB = b.toLowerCase();

    if (keyA === keyB) return; // self-referential, nothing to do

    this.makeSet(keyA);
    this.makeSet(keyB);

    let rootA = this.find(keyA);
    let rootB = this.find(keyB);

    if (rootA === rootB) return; // already in the same set

    const preferred = preferredRoot?.toLowerCase();

    if (preferred !== undefined) {
      // Force the preferred name to be the root
      if (preferred === rootB) {
        // Swap so rootA is the preferred root
        [rootA, rootB] = [rootB, rootA];
      }
      // Attach rootB under rootA (the preferred root)
      this.parent.set(rootB, rootA);
      const rankA = this.rank.get(rootA) ?? 0;
      const rankB = this.rank.get(rootB) ?? 0;
      if (rankA <= rankB) {
        this.rank.set(rootA, rankB + 1);
      }
    } else {
      // Standard union-by-rank
      const rankA = this.rank.get(rootA) ?? 0;
      const rankB = this.rank.get(rootB) ?? 0;

      if (rankA < rankB) {
        this.parent.set(rootA, rootB);
      } else if (rankA > rankB) {
        this.parent.set(rootB, rootA);
      } else {
        this.parent.set(rootB, rootA);
        this.rank.set(rootA, rankA + 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Build process
  // ---------------------------------------------------------------------------

  /**
   * Clears and rebuilds the alias graph from all mapping sources.
   */
  async rebuild(): Promise<void> {
    // 1. Clear all maps
    this.aliasToCanonical.clear();
    this.canonicalToAliases.clear();
    this.displayNames.clear();
    this.parent.clear();
    this.rank.clear();

    // 2. Read artistMappingService.getAllMappings() -> union discogsName and lastfmName
    //    Prefer lastfmName as canonical (it's the scrobble history name)
    const discogsArtistMappings = this.artistMappingService.getAllMappings();
    for (const mapping of discogsArtistMappings) {
      if (!mapping.discogsName || !mapping.lastfmName) continue;
      this.union(mapping.discogsName, mapping.lastfmName, mapping.lastfmName);
      // Record display name preference (Last.fm / history name)
      this.setDisplayNamePreference(mapping.lastfmName);
    }
    log.info(
      `Processed ${discogsArtistMappings.length} Discogs artist mappings`
    );

    // 3. Read mappingService album mappings -> union artists that differ
    const albumMappings = await this.mappingService.getAllAlbumMappings();
    let albumArtistUnions = 0;
    for (const mapping of albumMappings) {
      if (!mapping.historyArtist || !mapping.collectionArtist) continue;
      if (
        mapping.historyArtist.toLowerCase() !==
        mapping.collectionArtist.toLowerCase()
      ) {
        this.union(
          mapping.historyArtist,
          mapping.collectionArtist,
          mapping.historyArtist
        );
        this.setDisplayNamePreference(mapping.historyArtist);
        albumArtistUnions++;
      }
    }
    log.info(
      `Processed ${albumMappings.length} album mappings (${albumArtistUnions} artist unions)`
    );

    // 4. Read mappingService artist mappings -> union historyArtist and collectionArtist
    const historyArtistMappings =
      await this.mappingService.getAllArtistMappings();
    for (const mapping of historyArtistMappings) {
      if (!mapping.historyArtist || !mapping.collectionArtist) continue;
      if (
        mapping.historyArtist.toLowerCase() !==
        mapping.collectionArtist.toLowerCase()
      ) {
        this.union(
          mapping.historyArtist,
          mapping.collectionArtist,
          mapping.historyArtist
        );
        this.setDisplayNamePreference(mapping.historyArtist);
      }
    }
    log.info(
      `Processed ${historyArtistMappings.length} history artist mappings`
    );

    // 5. Handle compound artists from album mappings
    this.processCompoundArtists(albumMappings);

    // 6. Build final lookup maps from union-find structure
    this.buildLookupMaps();

    log.info(
      `Alias graph built: ${this.canonicalToAliases.size} canonical artists, ` +
        `${this.aliasToCanonical.size} total aliases`
    );
  }

  /**
   * For compound artists (e.g., "Billy Woods, Kenny Segal"), extract and union
   * the compound name with its individual components if a mapping exists.
   */
  private processCompoundArtists(albumMappings: AlbumMapping[]): void {
    const compoundSeparators = [', ', ' & ', ' and ', ' x ', ' X '];
    let compoundUnions = 0;

    for (const mapping of albumMappings) {
      for (const sep of compoundSeparators) {
        const artists = [mapping.historyArtist, mapping.collectionArtist];
        for (const artistName of artists) {
          if (!artistName || !artistName.includes(sep)) continue;
          const parts = artistName
            .split(sep)
            .map(p => p.trim())
            .filter(p => p.length > 0);
          if (parts.length <= 1) continue;

          // Union the compound name with itself as a recognized entity
          // so it's in the graph, but only union components if they have
          // existing mappings (i.e., they're known to the system)
          this.makeSet(artistName.toLowerCase());

          for (const part of parts) {
            const partRoot = this.parent.has(part.toLowerCase())
              ? this.find(part)
              : null;
            if (partRoot !== null) {
              // Component is known; union compound with component
              // but keep the compound name as its own entity -- don't merge them
              // Actually we should NOT merge compound with components because
              // "Billy Woods, Kenny Segal" is NOT the same artist as "Billy Woods"
              // We only want each component to appear in the graph
              this.makeSet(part.toLowerCase());
            }
          }
          compoundUnions++;
        }
      }
    }

    if (compoundUnions > 0) {
      log.debug(`Processed ${compoundUnions} compound artist names`);
    }
  }

  /**
   * Record a display name preference. The last call wins for a given canonical root.
   */
  private setDisplayNamePreference(name: string): void {
    const root = this.find(name);
    // Always prefer the Last.fm/history name; since we process those first and set
    // them as preferred roots, the root should already be the preferred name.
    if (!this.displayNames.has(root)) {
      this.displayNames.set(root, name);
    }
  }

  /**
   * Build the aliasToCanonical and canonicalToAliases maps from the
   * finalized union-find structure.
   */
  private buildLookupMaps(): void {
    this.aliasToCanonical.clear();
    this.canonicalToAliases.clear();

    // Collect all nodes and their roots
    const allNodes = new Set(this.parent.keys());
    for (const node of allNodes) {
      const root = this.find(node);
      this.aliasToCanonical.set(node, root);

      if (!this.canonicalToAliases.has(root)) {
        this.canonicalToAliases.set(root, new Set());
      }
      this.canonicalToAliases.get(root)!.add(node);
    }
  }

  // ---------------------------------------------------------------------------
  // Public query methods
  // ---------------------------------------------------------------------------

  /**
   * Returns the canonical lowercase name for an artist.
   * If the artist is unknown, returns the input lowercased.
   */
  resolveArtist(name: string): string {
    if (!name) return '';
    const key = name.toLowerCase();
    return this.aliasToCanonical.get(key) ?? key;
  }

  /**
   * Returns all known lowercase variants for an artist, including the canonical name.
   */
  getAliases(name: string): string[] {
    if (!name) return [];
    const canonical = this.resolveArtist(name);
    const aliases = this.canonicalToAliases.get(canonical);
    return aliases ? Array.from(aliases) : [canonical];
  }

  /**
   * Returns the preferred display casing for an artist name.
   * Falls back to the input name if no display preference is recorded.
   */
  getDisplayName(name: string): string {
    if (!name) return '';
    const canonical = this.resolveArtist(name);
    return this.displayNames.get(canonical) ?? name;
  }

  /**
   * Returns true if both names resolve to the same canonical artist.
   */
  areSameArtist(a: string, b: string): boolean {
    if (!a || !b) return false;
    return this.resolveArtist(a) === this.resolveArtist(b);
  }

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------

  /**
   * Finds album mappings where the history artist differs from the collection
   * artist but no corresponding artistMappingService entry exists.
   */
  async detectMissingScrobbleMappings(): Promise<MissingScrobbleMapping[]> {
    const albumMappings = await this.mappingService.getAllAlbumMappings();
    const missing: MissingScrobbleMapping[] = [];

    for (const mapping of albumMappings) {
      if (!mapping.historyArtist || !mapping.collectionArtist) continue;

      // Only consider cases where artists actually differ
      if (
        mapping.historyArtist.toLowerCase() ===
        mapping.collectionArtist.toLowerCase()
      ) {
        continue;
      }

      // Check if artistMappingService already has a mapping for the collection artist
      // (artistMappingService maps discogsName -> lastfmName, keyed by discogsName)
      if (!this.artistMappingService.hasMapping(mapping.collectionArtist)) {
        missing.push({
          discogsName: mapping.collectionArtist,
          lastfmName: mapping.historyArtist,
        });
      }
    }

    // Deduplicate by discogsName (case-insensitive)
    const seen = new Set<string>();
    const deduplicated: MissingScrobbleMapping[] = [];
    for (const entry of missing) {
      const key = entry.discogsName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(entry);
      }
    }

    log.info(
      `Detected ${deduplicated.length} missing scrobble artist mappings`
    );
    return deduplicated;
  }
}
