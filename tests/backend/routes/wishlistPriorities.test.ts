import express from 'express';
import request from 'supertest';

import createWishlistRouter from '../../../src/backend/routes/wishlist';
import { AuthService } from '../../../src/backend/services/authService';
import { BuyingShortlistService } from '../../../src/backend/services/buyingShortlistService';
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

  describe('shortlist', () => {
    const getShortlist = jest.fn();
    const shortlistApp = (withService = true) => {
      const app = express();
      app.use(
        '/wishlist',
        createWishlistRouter(
          {} as FileStorage,
          {} as AuthService,
          {} as WishlistService,
          undefined,
          undefined,
          undefined,
          withService
            ? ({ getShortlist } as unknown as BuyingShortlistService)
            : undefined
        )
      );
      return app;
    };

    beforeEach(() => getShortlist.mockResolvedValue({ picks: [] }));

    it('returns picks, not caught by the /:masterId routes', async () => {
      const res = await request(shortlistApp()).get(
        '/wishlist/shortlist?budget=100&count=4'
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ picks: [] });
      expect(getShortlist).toHaveBeenCalledWith({ budget: 100, count: 4 });
    });

    it('leaves the count to the service when absent', async () => {
      await request(shortlistApp()).get('/wishlist/shortlist?budget=12.5');
      expect(getShortlist).toHaveBeenCalledWith({
        budget: 12.5,
        count: undefined,
      });
    });

    it.each([
      [''],
      ['?budget=abc'],
      ['?budget=0'],
      ['?budget=-5'],
      ['?budget=Infinity'],
      ['?budget=10&budget=20'],
      ['?budget=10&count=2'],
      ['?budget=10&count=6'],
      ['?budget=10&count=3.5'],
    ])('rejects "%s"', async query => {
      await request(shortlistApp())
        .get(`/wishlist/shortlist${query}`)
        .expect(400);
      expect(getShortlist).not.toHaveBeenCalled();
    });

    it('says 503 for a damaged ranking or a missing service', async () => {
      getShortlist.mockRejectedValueOnce(
        new WishlistPriorityError('damaged', 'corrupt')
      );
      const res = await request(shortlistApp()).get(
        '/wishlist/shortlist?budget=10'
      );
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('damaged');
      await request(shortlistApp(false))
        .get('/wishlist/shortlist?budget=10')
        .expect(503);
    });
  });

  it('says 503 when the service is missing', async () => {
    await request(appWith()).get('/wishlist/priorities').expect(503);
  });
});
