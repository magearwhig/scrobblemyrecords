import { AlbumMapping } from '../../shared/types';

/**
 * Load all album mappings, tolerating a missing service (or a mocked one that
 * returns nothing).
 */
export async function loadAlbumMappings(
  mappingService: { getAllAlbumMappings(): Promise<AlbumMapping[]> } | null
): Promise<AlbumMapping[]> {
  if (!mappingService) return [];
  return (await mappingService.getAllAlbumMappings()) ?? [];
}
