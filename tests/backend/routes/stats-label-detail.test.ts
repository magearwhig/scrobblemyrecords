import express from 'express';
import request from 'supertest';

import createStatsRouter from '../../../src/backend/routes/stats';
import { AuthService } from '../../../src/backend/services/authService';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { LabelDetailResponse } from '../../../src/shared/types';

jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/utils/fileStorage');

describe('GET /api/v1/stats/label/:labelName', () => {
  let app: express.Application;
  let statsService: jest.Mocked<StatsService>;

  const detail: LabelDetailResponse = {
    labelKey: 'sub pop',
    label: 'Sub Pop',
    otherSpellings: [],
    totalPlayCount: 8,
    ownedPlayCount: 8,
    lookedUpPlayCount: 0,
    includeUnowned: true,
    firstPlayed: 1,
    lastPlayed: 2,
    periodCounts: { thisWeek: 0, thisMonth: 0, thisYear: 8, allTime: 8 },
    playTrend: [],
    topArtists: [],
    topAlbums: [],
    topTracks: [],
    ownedCopyCount: 2,
    unplayedCopies: [],
  };

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
    statsService.getLabelDetail = jest.fn().mockResolvedValue(detail);

    app = express();
    app.use(
      '/api/v1/stats',
      createStatsRouter(fileStorage, authService, statsService)
    );
  });

  it('returns the label detail, decoding the name', async () => {
    const response = await request(app).get(
      '/api/v1/stats/label/Sub%20Pop%20Records?trendPeriod=week'
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: detail });
    expect(statsService.getLabelDetail).toHaveBeenCalledWith(
      'Sub Pop Records',
      'week',
      expect.any(Array),
      { includeUnowned: true }
    );
  });

  it('defaults the trend period to month and ignores bad values', async () => {
    await request(app).get('/api/v1/stats/label/Merge?trendPeriod=decade');

    expect(statsService.getLabelDetail).toHaveBeenCalledWith(
      'Merge',
      'month',
      expect.any(Array),
      { includeUnowned: true }
    );
  });

  it('can leave out albums you do not own', async () => {
    await request(app).get('/api/v1/stats/label/Merge?includeUnowned=false');

    expect(statsService.getLabelDetail).toHaveBeenCalledWith(
      'Merge',
      'month',
      expect.any(Array),
      { includeUnowned: false }
    );
  });

  it('returns 404 for an unknown or placeholder label', async () => {
    statsService.getLabelDetail.mockResolvedValue(null);

    const response = await request(app).get(
      '/api/v1/stats/label/Not%20On%20Label'
    );

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it('returns 500 when the service fails', async () => {
    statsService.getLabelDetail.mockRejectedValue(new Error('boom'));

    const response = await request(app).get('/api/v1/stats/label/Merge');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, error: 'boom' });
  });
});
