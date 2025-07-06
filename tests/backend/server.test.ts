import request from 'supertest';
import app from '../../src/server';

describe('Server', () => {
  it('should respond to health check', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
  });

  it('should return 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/unknown-route')
      .expect(404);
    
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Route not found');
  });

  it('should respond to API v1 endpoint', async () => {
    const response = await request(app)
      .get('/api/v1')
      .expect(200);
    
    expect(response.body.message).toBe('Discogs to Last.fm Scrobbler API');
    expect(response.body.version).toBe('1.0.0');
  });
});