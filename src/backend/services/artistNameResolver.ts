import { AlbumMapping } from '../../shared/types';
import { createLogger } from '../utils/logger';

import { ArtistMapping as DiscogsArtistMapping } from './artistMappingService';
import {
  CompoundArtistMappingServiceLike,
  isCompoundArtistName,
} from './compoundArtistMappingService';
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
  /** lowercased name -> original casing (as encountered in mapping data) */
  private originalCasing: Map<string, string> = new Map();

  /** Union-find parent pointers (lowercased name -> parent lowercased name) */
  private parent: Map<string, string> = new Map();
  /** Union-find rank for union-by-rank */
  private rank: Map<string, number> = new Map();

  /** Compound artist decomposition: lowercased compound → canonical component keys */
  private compoundToComponents: Map<string, string[]> = new Map();
  /** Reverse: lowercased canonical component → set of compound keys */
  private componentToCompounds: Map<string, Set<string>> = new Map();

  private artistMappingService: ArtistMappingServiceLike;
  private mappingService: MappingService;
  private compoundMappingService?: CompoundArtistMappingServiceLike;

  /** Optional callback to supply play counts for display name weighting */
  private playCountProvider?: () => Promise<Map<string, number>>;

  constructor(
    artistMappingService: ArtistMappingServiceLike,
    mappingService: MappingService,
    compoundMappingService?: CompoundArtistMappingServiceLike
  ) {
    this.artistMappingService = artistMappingService;
    this.mappingService = mappingService;
    this.compoundMappingService = compoundMappingService;
  }

  /**
   * Register a callback that supplies artist play counts for display name
   * selection. Called during rebuild() to weight display names by frequency.
   */
  setPlayCountProvider(fn: () => Promise<Map<string, number>>): void {
    this.playCountProvider = fn;
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
      // Resolve preferred through union-find — it may already be merged
      // into an existing set, so its root could differ from the raw string.
      const preferredRootKey = this.find(preferred);
      if (preferredRootKey === rootB) {
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
   * @param artistPlayCounts Optional pre-computed play counts per lowercased artist.
   *   If not provided and a playCountProvider is set, it will be called automatically.
   */
  async rebuild(artistPlayCounts?: Map<string, number>): Promise<void> {
    // 1. Clear all maps
    this.aliasToCanonical.clear();
    this.canonicalToAliases.clear();
    this.displayNames.clear();
    this.originalCasing.clear();
    this.parent.clear();
    this.rank.clear();
    this.compoundToComponents.clear();
    this.componentToCompounds.clear();

    // 2. Read artistMappingService.getAllMappings() -> union discogsName and lastfmName
    //    Prefer lastfmName as canonical (it's the scrobble history name)
    const discogsArtistMappings = this.artistMappingService.getAllMappings();
    for (const mapping of discogsArtistMappings) {
      if (!mapping.discogsName || !mapping.lastfmName) continue;
      this.union(mapping.discogsName, mapping.lastfmName, mapping.lastfmName);
      this.recordOriginalCasing(mapping.discogsName);
      this.recordOriginalCasing(mapping.lastfmName);
      // Record display name preference (Last.fm / history name)
      this.setDisplayNamePreference(mapping.lastfmName);
    }
    log.info(
      `Processed ${discogsArtistMappings.length} Discogs artist mappings`
    );

    // 3. Read mappingService album mappings -> union artists that differ
    //    Skip generic compilation artists (e.g. "Various") to avoid transitively
    //    linking all artists from a compilation into one equivalence class.
    //    When historyArtist is a compound name (e.g. "Danny Brown (2), Jane Remover")
    //    and collectionArtist is not, prefer collectionArtist as root so the
    //    compound name doesn't hijack the equivalence class.
    const GENERIC_COLLECTION_ARTISTS = new Set(['various', 'various artists']);
    const albumMappings = await this.mappingService.getAllAlbumMappings();
    let albumArtistUnions = 0;
    for (const mapping of albumMappings) {
      if (!mapping.historyArtist || !mapping.collectionArtist) continue;
      if (
        GENERIC_COLLECTION_ARTISTS.has(mapping.collectionArtist.toLowerCase())
      )
        continue;
      if (
        mapping.historyArtist.toLowerCase() !==
        mapping.collectionArtist.toLowerCase()
      ) {
        // If historyArtist is compound but collectionArtist is not, use
        // collectionArtist as the preferred root to avoid compound name
        // becoming the canonical display name for all entries.
        const historyIsCompound = isCompoundArtistName(mapping.historyArtist);
        const collectionIsCompound = isCompoundArtistName(
          mapping.collectionArtist
        );
        const preferredRoot =
          historyIsCompound && !collectionIsCompound
            ? mapping.collectionArtist
            : mapping.historyArtist;

        this.union(
          mapping.historyArtist,
          mapping.collectionArtist,
          preferredRoot
        );
        this.recordOriginalCasing(mapping.historyArtist);
        this.recordOriginalCasing(mapping.collectionArtist);
        this.setDisplayNamePreference(preferredRoot);
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
        this.recordOriginalCasing(mapping.historyArtist);
        this.recordOriginalCasing(mapping.collectionArtist);
        this.setDisplayNamePreference(mapping.historyArtist);
      }
    }
    log.info(
      `Processed ${historyArtistMappings.length} history artist mappings`
    );

    // 5. Handle compound artists from album mappings (legacy — ensures
    //    component names exist in the graph even without persisted mappings)
    this.processCompoundArtists(albumMappings);

    // 6. Build final lookup maps from union-find structure
    this.buildLookupMaps();

    // 7. Build compound decomposition maps from persisted + auto-detected mappings
    await this.buildCompoundDecompositionMaps();

    // 8. Assign play-count-weighted display names
    const playCounts =
      artistPlayCounts ??
      (this.playCountProvider ? await this.playCountProvider() : undefined);
    if (playCounts) {
      this.assignPlayCountWeightedDisplayNames(playCounts);
    }

    log.info(
      `Alias graph built: ${this.canonicalToAliases.size} canonical artists, ` +
        `${this.aliasToCanonical.size} total aliases, ` +
        `${this.compoundToComponents.size} compound decompositions`
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
   * Record the original casing for a name (first seen wins).
   */
  private recordOriginalCasing(name: string): void {
    const key = name.toLowerCase();
    if (!this.originalCasing.has(key)) {
      this.originalCasing.set(key, name);
    }
  }

  /**
   * Record a display name preference. First call wins for a given canonical root.
   */
  private setDisplayNamePreference(name: string): void {
    const root = this.find(name);
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

  /**
   * Build compound decomposition maps from the CompoundArtistMappingService.
   * Each compound name is mapped to the canonical keys of its component artists.
   */
  private async buildCompoundDecompositionMaps(): Promise<void> {
    if (!this.compoundMappingService) return;

    const mappings = await this.compoundMappingService.getAllMappings();
    for (const mapping of mappings) {
      const compoundKey = mapping.compoundName.toLowerCase();

      // Resolve each component through union-find to get canonical key.
      // Deduplicate: two component names may resolve to the same canonical
      // (e.g., "Danny Brown" and "Danny Brown (2)" → both "danny brown").
      const seen = new Set<string>();
      const resolvedComponents: string[] = [];
      for (const component of mapping.components) {
        const canonical = this.resolveArtist(component);
        if (!seen.has(canonical)) {
          seen.add(canonical);
          resolvedComponents.push(canonical);
        }
      }

      this.compoundToComponents.set(compoundKey, resolvedComponents);

      // Build reverse map
      for (const canonical of resolvedComponents) {
        if (!this.componentToCompounds.has(canonical)) {
          this.componentToCompounds.set(canonical, new Set());
        }
        this.componentToCompounds.get(canonical)!.add(compoundKey);
      }
    }

    if (mappings.length > 0) {
      log.info(
        `Built decomposition maps for ${mappings.length} compound artists`
      );
    }
  }

  /**
   * For each equivalence class, pick the display name by highest play count
   * among non-compound aliases. Falls back to shortest non-compound alias
   * if no play data exists.
   */
  private assignPlayCountWeightedDisplayNames(
    playCounts: Map<string, number>
  ): void {
    let updated = 0;

    for (const [canonical, aliases] of this.canonicalToAliases) {
      // Collect non-compound aliases with their play counts
      const candidates: { key: string; plays: number }[] = [];
      for (const alias of aliases) {
        if (!isCompoundArtistName(alias)) {
          candidates.push({
            key: alias,
            plays: playCounts.get(alias) ?? 0,
          });
        }
      }

      if (candidates.length === 0) continue; // all aliases are compound

      // Sort: highest play count first, then shortest name as tiebreaker
      candidates.sort((a, b) => {
        if (b.plays !== a.plays) return b.plays - a.plays;
        return a.key.length - b.key.length;
      });

      const best = candidates[0];
      // Use original casing if available, otherwise the key itself
      const displayName = this.originalCasing.get(best.key) ?? best.key;
      const current = this.displayNames.get(canonical);
      if (current !== displayName) {
        this.displayNames.set(canonical, displayName);
        updated++;
      }
    }

    if (updated > 0) {
      log.info(`Updated ${updated} display names using play count weighting`);
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

  /**
   * Returns all canonical artist keys a name should be attributed to.
   * For compound names with a decomposition mapping, returns each component's
   * canonical key. For non-compound names, returns [resolveArtist(name)].
   */
  resolveArtistMulti(name: string): string[] {
    if (!name) return [];
    const key = name.toLowerCase();

    // Check if this is a known compound with decomposition
    const components = this.compoundToComponents.get(key);
    if (components && components.length > 0) {
      return components;
    }

    // Also check if the resolved canonical form is a known compound
    const canonical = this.resolveArtist(name);
    const canonicalComponents = this.compoundToComponents.get(canonical);
    if (canonicalComponents && canonicalComponents.length > 0) {
      return canonicalComponents;
    }

    return [canonical];
  }

  /**
   * Reverse lookup: returns compound names that include the given artist
   * as a component.
   */
  getCompoundsForArtist(name: string): string[] {
    if (!name) return [];
    const canonical = this.resolveArtist(name);
    const compounds = this.componentToCompounds.get(canonical);
    return compounds ? Array.from(compounds) : [];
  }

  /**
   * Returns true if the name is a known compound artist with a decomposition.
   */
  isCompound(name: string): boolean {
    if (!name) return false;
    const key = name.toLowerCase();
    return this.compoundToComponents.has(key);
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
