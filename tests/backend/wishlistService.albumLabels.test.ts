import { AuthService } from '../../src/backend/services/authService';
import { WishlistService } from '../../src/backend/services/wishlistService';
import { FileStorage } from '../../src/backend/utils/fileStorage';

jest.mock('../../src/backend/utils/fileStorage');
jest.mock('../../src/backend/services/authService');

const mockAxiosInstance = {
  get: jest.fn(),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

jest.mock('../../src/backend/utils/discogsAxios', () => ({
  getDiscogsAxios: () => mockAxiosInstance,
}));

describe('WishlistService.findAlbumLabels', () => {
  let service: WishlistService;

  beforeEach(() => {
    jest.clearAllMocks();
    const fileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
    } as unknown as FileStorage;
    const authService = {
      getDiscogsToken: jest.fn().mockResolvedValue('Discogs token=test'),
    } as unknown as AuthService;
    service = new WishlistService(fileStorage, authService);
  });

  it('takes the label of the earliest matching release of the album', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        results: [
          {
            title: 'Pavement - Wowee Zowee',
            year: '2006',
            label: ['Domino'],
            master_id: 7,
          },
          {
            title: 'Pavement - Wowee Zowee',
            year: '1995',
            label: ['Matador', 'Big Cat'],
            master_id: 7,
          },
          {
            title: 'Pavement - Wowee Zowee Sordid Sentinels',
            year: '1990',
            label: ['Other'],
            master_id: 8,
          },
        ],
      },
    });

    const result = await service.findAlbumLabels({
      artist: 'pavement',
      album: 'wowee zowee',
    });

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/database/search',
      expect.objectContaining({
        params: expect.objectContaining({
          artist: 'pavement',
          release_title: 'wowee zowee',
          type: 'release',
        }),
      })
    );
    expect(result).toEqual({
      labels: ['Matador', 'Big Cat'],
      status: 'found',
      matchedArtist: 'Pavement',
      matchedTitle: 'Wowee Zowee',
      year: 1995,
    });
  });

  it('ignores results for other albums and placeholder labels', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        results: [
          {
            title: 'Pavement* - Slanted And Enchanted',
            year: '1992',
            label: ['Not On Label (Pavement Self-released)'],
            master_id: 9,
          },
        ],
      },
    });

    expect(
      await service.findAlbumLabels({
        artist: 'pavement',
        album: 'wowee zowee',
      })
    ).toBeNull();
    expect(
      await service.findAlbumLabels({
        artist: 'pavement',
        album: 'slanted & enchanted',
      })
    ).toBeNull();
  });
});
