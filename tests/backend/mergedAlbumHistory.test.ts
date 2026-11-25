import { loadAlbumMappings } from '../../src/backend/services/mergedAlbumHistory';

describe('mergedAlbumHistory', () => {
  it('loadAlbumMappings tolerates a missing service or empty result', async () => {
    expect(await loadAlbumMappings(null)).toEqual([]);
    expect(
      await loadAlbumMappings({
        getAllAlbumMappings: jest.fn().mockResolvedValue(undefined),
      })
    ).toEqual([]);
  });
});
