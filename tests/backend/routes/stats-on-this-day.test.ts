import express from 'express';
import request from 'supertest';

import createStatsRouter from '../../../src/backend/routes/stats';
import { AuthService } from '../../../src/backend/services/authService';
import { ImageService } from '../../../src/backend/services/imageService';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/utils/fileStorage');

describe('GET /api/v1/stats/on-this-day covers', () => {
  it('answers without fetching covers; the page loads them afterwards', async () => {
    const fileStorage = new (FileStorage as jest.MockedClass<
      typeof FileStorage
    >)('test') as jest.Mocked<FileStorage>;
    const authService = new (AuthService as jest.MockedClass<
      typeof AuthService
    >)(fileStorage) as jest.Mocked<AuthService>;
    const statsService = new (StatsService as jest.MockedClass<
      typeof StatsService
    >)(fileStorage, {} as never) as jest.Mocked<StatsService>;
    statsService.getOnThisDay = jest.fn().mockResolvedValue({
      date: { month: 11, day: 13 },
      years: [
        {
          year: 2020,
          yearsAgo: 6,
          totalScrobbles: 3,
          albums: [
            {
              artist: 'Spoon',
              album: 'Kill the Moonlight',
              playCount: 3,
              coverUrl: null,
            },
          ],
        },
      ],
    });
    const imageService = {
      getAlbumCover: jest.fn().mockResolvedValue('https://example.com/c.jpg'),
    } as unknown as ImageService;

    const app = express();
    app.use(
      '/api/v1/stats',
      createStatsRouter(
        fileStorage,
        authService,
        statsService,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        imageService
      )
    );

    const response = await request(app).get('/api/v1/stats/on-this-day');

    expect(response.status).toBe(200);
    expect(imageService.getAlbumCover).not.toHaveBeenCalled();
    expect(response.body.data.years[0].albums[0].coverUrl).toBeNull();
  });
});
