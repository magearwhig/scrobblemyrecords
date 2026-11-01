import express from 'express';
import request from 'supertest';

import createWishlistRouter from '../../../src/backend/routes/wishlist';
import { AuthService } from '../../../src/backend/services/authService';
import {
  WishlistPriorityError,
  WishlistPriorityService,
} from '../../../src/backend/services/wishlistPriorityService';
import { WishlistService } from '../../../src/backend/services/wishlistService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

jest.mock('../../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const snapshot = { ranked: [], unranked: [] };

describe('wishlist priority routes', () => {
  const getSnapshot = jest.fn();
  const applyChange = jest.fn();

  const appWith = (service?: WishlistPriorityService) => {
    const app = express();
    app.use(express.json());
    app.use(
      '/wishlist',
      createWishlistRouter(
        {} as FileStorage,
        {} as AuthService,
        {} as WishlistService,
        undefined,
        undefined,
        service
      )
    );
    return app;
  };
  const app = () =>
    appWith({ getSnapshot, applyChange } as unknown as WishlistPriorityService);

  beforeEach(() => {
    jest.resetAllMocks();
    getSnapshot.mockResolvedValue(snapshot);
    applyChange.mockResolvedValue(snapshot);
  });

  it('returns the snapshot, not caught by the /:masterId routes', async () => {
    const res = await request(app()).get('/wishlist/priorities');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(snapshot);
  });

  it('applies a move and an unrank', async () => {
    const move = { action: 'move', key: 'master:1', position: 2 };
    const unrank = { action: 'unrank', key: 'master:1' };
    await request(app()).patch('/wishlist/priorities').send(move).expect(200);
    await request(app()).patch('/wishlist/priorities').send(unrank).expect(200);
    expect(applyChange).toHaveBeenNthCalledWith(1, move);
    expect(applyChange).toHaveBeenNthCalledWith(2, unrank);
  });

  it.each([
    [{}],
    [{ action: 'delete', key: 'master:1' }],
    [{ action: 'move', key: 'master:1' }],
    [{ action: 'move', key: 'master:1', position: 0 }],
    [{ action: 'move', key: 'master:1', position: 1.5 }],
    [{ action: 'move', key: 'master:1', position: '1' }],
    [{ action: 'move', key: '', position: 1 }],
    [{ action: 'unrank', key: 7 }],
  ])('rejects %j', async body => {
    await request(app()).patch('/wishlist/priorities').send(body).expect(400);
    expect(applyChange).not.toHaveBeenCalled();
  });

  it('says 404 for an unknown record and 503 for a damaged file', async () => {
    applyChange.mockRejectedValueOnce(
      new WishlistPriorityError('gone', 'not_found')
    );
    await request(app())
      .patch('/wishlist/priorities')
      .send({ action: 'unrank', key: 'master:1' })
      .expect(404);

    getSnapshot.mockRejectedValueOnce(
      new WishlistPriorityError('damaged', 'corrupt')
    );
    const res = await request(app()).get('/wishlist/priorities');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('damaged');
  });

  it('says 503 when the service is missing', async () => {
    await request(appWith()).get('/wishlist/priorities').expect(503);
  });
});
