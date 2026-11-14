import express from 'express';
import request from 'supertest';

import createAlbumLabelsRouter from '../../../src/backend/routes/albumLabels';
import {
  AlbumLabelCandidate,
  AlbumLabelService,
} from '../../../src/backend/services/albumLabelService';

describe('/api/v1/album-labels', () => {
  let app: express.Application;
  let service: jest.Mocked<
    Pick<
      AlbumLabelService,
      | 'get'
      | 'getStatus'
      | 'setOverride'
      | 'clearOverride'
      | 'confirm'
      | 'reject'
    >
  >;
  const candidates: AlbumLabelCandidate[] = [
    { artist: 'spoon', album: 'gimme fiction', playCount: 5, lastPlayed: 1 },
  ];

  beforeEach(() => {
    service = {
      get: jest.fn().mockResolvedValue({
        labels: ['Merge'],
        source: 'musicbrainz',
        status: 'found',
      }),
      getStatus: jest.fn().mockResolvedValue({ total: 1, pending: 1 }),
      setOverride: jest.fn().mockResolvedValue(undefined),
      clearOverride: jest.fn().mockResolvedValue(undefined),
      confirm: jest.fn().mockResolvedValue(undefined),
      reject: jest.fn().mockResolvedValue(undefined),
    };
    app = express();
    app.use(express.json());
    app.use(
      '/api/v1/album-labels',
      createAlbumLabelsRouter(service, async () => candidates)
    );
  });

  it('reports lookup progress over the albums due a lookup', async () => {
    const response = await request(app).get('/api/v1/album-labels/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { total: 1, pending: 1 },
    });
    expect(service.getStatus).toHaveBeenCalledWith(candidates);
  });

  it("returns an album's label, or null", async () => {
    const response = await request(app)
      .get('/api/v1/album-labels')
      .query({ artist: 'Spoon', album: 'Gimme Fiction' });

    expect(response.body.data).toMatchObject({ labels: ['Merge'] });
    expect(service.get).toHaveBeenCalledWith('Spoon', 'Gimme Fiction');

    service.get.mockResolvedValue(null);
    const none = await request(app)
      .get('/api/v1/album-labels')
      .query({ artist: 'A', album: 'B' });
    expect(none.body).toEqual({ success: true, data: null });
  });

  it('sets, clears, confirms and rejects labels', async () => {
    await request(app)
      .put('/api/v1/album-labels')
      .send({ artist: 'a', album: 'b', labels: ['Merge', 'Sub Pop'] })
      .expect(200);
    expect(service.setOverride).toHaveBeenCalledWith('a', 'b', [
      'Merge',
      'Sub Pop',
    ]);

    await request(app)
      .delete('/api/v1/album-labels')
      .query({ artist: 'a', album: 'b' })
      .expect(200);
    expect(service.clearOverride).toHaveBeenCalledWith('a', 'b');

    await request(app)
      .post('/api/v1/album-labels/confirm')
      .send({ artist: 'a', album: 'b' })
      .expect(200);
    expect(service.confirm).toHaveBeenCalledWith('a', 'b');

    await request(app)
      .post('/api/v1/album-labels/reject')
      .send({ artist: 'a', album: 'b' })
      .expect(200);
    expect(service.reject).toHaveBeenCalledWith('a', 'b');
  });

  it('rejects requests without an artist and album, or with bad labels', async () => {
    await request(app).get('/api/v1/album-labels').expect(400);
    await request(app)
      .put('/api/v1/album-labels')
      .send({ artist: 'a', album: 'b', labels: 'Merge' })
      .expect(400);
    await request(app)
      .put('/api/v1/album-labels')
      .send({ artist: 'a', album: 'b', labels: ['x'.repeat(201)] })
      .expect(400);
    await request(app)
      .post('/api/v1/album-labels/confirm')
      .send({ artist: 'a' })
      .expect(400);
    expect(service.setOverride).not.toHaveBeenCalled();
  });

  it('returns 500 when the service fails', async () => {
    service.get.mockRejectedValue(new Error('disk'));

    const response = await request(app)
      .get('/api/v1/album-labels')
      .query({ artist: 'a', album: 'b' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, error: 'disk' });
  });
});
