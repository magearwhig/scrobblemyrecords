import express from 'express';
import request from 'supertest';

import createStatsRouter from '../../../src/backend/routes/stats';
import { AuthService } from '../../../src/backend/services/authService';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { LabelPlayCount } from '../../../src/shared/types';

jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/utils/fileStorage');

describe('GET /api/v1/stats/top/labels/:period', () => {
  let app: express.Application;
  let statsService: jest.Mocked<StatsService>;

  const rows: LabelPlayCount[] = [
    {
      label: 'Sub Pop',
      labelKey: 'sub pop',
      playCount: 9,
      ownedPlayCount: 5,
      albumCount: 2,
      lastPlayed: 100,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    const fileStorage = new (FileStorage as jest.MockedClass<
      typeof FileStorage
    >)('test') as jest.Mocked<FileStorage>;
    fileStorage.readJSON = jest.fn().mockResolvedValue(null);
    const authService = new (AuthService as jest.MockedClass<
      typeof AuthService
    >)(fileStorage) as jest.Mocked<AuthService>;
    authService.getUserSettings = jest
      .fn()
      .mockResolvedValue({ discogs: { username: 'testuser' }, lastfm: {} });
    statsService = new (StatsService as jest.MockedClass<typeof StatsService>)(
      fileStorage,
      {} as never
    ) as jest.Mocked<StatsService>;
    statsService.getTopLabels = jest.fn().mockResolvedValue(rows);

    app = express();
    app.use(
      '/api/v1/stats',
      createStatsRouter(fileStorage, authService, statsService)
    );
  });

  it('returns the top labels for a period', async () => {
    const response = await request(app).get(
      '/api/v1/stats/top/labels/year?limit=5'
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: rows,
      period: 'year',
    });
    expect(statsService.getTopLabels).toHaveBeenCalledWith(
      'year',
      5,
      expect.any(Array),
      { startDate: undefined, endDate: undefined, includeUnowned: true }
    );
  });

  it('passes a custom range and owned-only through', async () => {
    const response = await request(app).get(
      '/api/v1/stats/top/labels/custom?startDate=10&endDate=20&includeUnowned=false'
    );

    expect(response.status).toBe(200);
    expect(statsService.getTopLabels).toHaveBeenCalledWith(
      'custom',
      10,
      expect.any(Array),
      { startDate: 10, endDate: 20, includeUnowned: false }
    );
  });

  it('rejects a bad period or a custom period without dates', async () => {
    expect(
      (await request(app).get('/api/v1/stats/top/labels/decade')).status
    ).toBe(400);
    expect(
      (await request(app).get('/api/v1/stats/top/labels/custom')).status
    ).toBe(400);
    expect(statsService.getTopLabels).not.toHaveBeenCalled();
  });
});
