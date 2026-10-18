import express from 'express';
import request from 'supertest';

import createCratesRouter from '../../../src/backend/routes/crates';
import { registerCrateSuggestionRoutes } from '../../../src/backend/routes/crateSuggestions';
import {
  CrateError,
  CrateService,
} from '../../../src/backend/services/crateService';
import { CrateSuggestionService } from '../../../src/backend/services/crateSuggestionService';
import { CrateSuggestionsResponse } from '../../../src/shared/types';

const RESPONSE: CrateSuggestionsResponse = {
  suggestions: [
    {
      candidateKey: 'artist:the wedding present',
      recipe: 'artist',
      name: 'The Wedding Present shelf',
      description: 'Albums you own by The Wedding Present.',
      reason: 'You own 6 albums by The Wedding Present.',
      rules: [],
      sort: 'lastPlayedAsc',
      count: 6,
      sampleCovers: [],
    },
  ],
  exhausted: false,
};

describe('Crate suggestion routes', () => {
  let app: express.Application;
  let service: jest.Mocked<
    Pick<
      CrateSuggestionService,
      'getSuggestions' | 'reroll' | 'dismiss' | 'resetHistory'
    >
  >;
  let crateService: { evaluate: jest.Mock };

  beforeEach(() => {
    service = {
      getSuggestions: jest.fn().mockResolvedValue(RESPONSE),
      reroll: jest.fn().mockResolvedValue({ suggestions: [], exhausted: true }),
      dismiss: jest.fn().mockResolvedValue(RESPONSE),
      resetHistory: jest.fn().mockResolvedValue(RESPONSE),
    };
    crateService = { evaluate: jest.fn() };
    app = express();
    app.use(express.json());
    app.use(
      '/api/v1/crates',
      createCratesRouter(crateService as unknown as CrateService, router =>
        registerCrateSuggestionRoutes(
          router,
          service as unknown as CrateSuggestionService
        )
      )
    );
  });

  describe('GET /suggestions', () => {
    it('returns today’s batch with limit 3 by default', async () => {
      const res = await request(app).get('/api/v1/crates/suggestions');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: RESPONSE });
      expect(service.getSuggestions).toHaveBeenCalledWith(3);
      // Registered before /:id
      expect(crateService.evaluate).not.toHaveBeenCalled();
    });

    it('accepts limit=1 and limit=3', async () => {
      await request(app).get('/api/v1/crates/suggestions?limit=1').expect(200);
      expect(service.getSuggestions).toHaveBeenLastCalledWith(1);
      await request(app).get('/api/v1/crates/suggestions?limit=3').expect(200);
      expect(service.getSuggestions).toHaveBeenLastCalledWith(3);
    });

    it.each(['2', '0', 'abc', '3.0', ''])('rejects limit=%s', async limit => {
      const res = await request(app).get(
        `/api/v1/crates/suggestions?limit=${limit}`
      );
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(service.getSuggestions).not.toHaveBeenCalled();
    });

    it('rejects a repeated limit', async () => {
      const res = await request(app).get(
        '/api/v1/crates/suggestions?limit=1&limit=3'
      );
      expect(res.status).toBe(400);
    });

    it('maps CrateError statuses and other errors to 500', async () => {
      service.getSuggestions.mockRejectedValueOnce(
        new CrateError('Discogs authentication required', 401)
      );
      await request(app).get('/api/v1/crates/suggestions').expect(401);
      service.getSuggestions.mockRejectedValueOnce(new Error('boom'));
      const res = await request(app).get('/api/v1/crates/suggestions');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'boom' });
    });
  });

  it('POST /suggestions/reroll returns the new batch', async () => {
    const res = await request(app).post('/api/v1/crates/suggestions/reroll');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { suggestions: [], exhausted: true },
    });
  });

  describe('POST /suggestions/:candidateKey/dismiss', () => {
    it('decodes and dismisses a valid key', async () => {
      const res = await request(app).post(
        `/api/v1/crates/suggestions/${encodeURIComponent(
          'artist:the wedding present'
        )}/dismiss`
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: RESPONSE });
      expect(service.dismiss).toHaveBeenCalledWith(
        'artist:the wedding present'
      );
    });

    it('accepts a key with a second colon', async () => {
      await request(app)
        .post('/api/v1/crates/suggestions/short:jazz:40/dismiss')
        .expect(200);
      expect(service.dismiss).toHaveBeenCalledWith('short:jazz:40');
    });

    it.each([
      'nocolon',
      'Artist:upper-recipe',
      'artist:',
      encodeURIComponent('artist:ac/dc'),
      `artist:${'x'.repeat(121)}`,
    ])('rejects %s', async key => {
      const res = await request(app).post(
        `/api/v1/crates/suggestions/${key}/dismiss`
      );
      expect(res.status).toBe(400);
      expect(service.dismiss).not.toHaveBeenCalled();
    });
  });

  it('DELETE /suggestions/history resets and returns a fresh batch', async () => {
    const res = await request(app).delete('/api/v1/crates/suggestions/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: RESPONSE });
    expect(service.resetHistory).toHaveBeenCalled();
  });
});
