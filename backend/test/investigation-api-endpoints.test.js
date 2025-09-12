const request = require('supertest');
const express = require('express');

// Create a minimal test app to verify endpoint structure
const testApp = express();
testApp.use(express.json());

// Mock middleware
testApp.use((req, res, next) => {
  req.user = { id: 1, email: 'test@example.com' };
  req.tenantId = 1;
  next();
});

// Import the investigation router
const investigationRouter = require('../investigation/api');
testApp.use('/investigations', investigationRouter);

describe('Investigation API Endpoints Structure', () => {
  describe('Required Endpoints', () => {
    it('should have POST /investigations/start endpoint', async () => {
      const response = await request(testApp)
        .post('/investigations/start')
        .send({ alertId: 1 });
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should have GET /investigations/:id/status endpoint', async () => {
      const response = await request(testApp)
        .get('/investigations/test-id/status');
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should have GET /investigations/:id/timeline endpoint', async () => {
      const response = await request(testApp)
        .get('/investigations/test-id/timeline');
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should have POST /investigations/:id/feedback endpoint', async () => {
      const response = await request(testApp)
        .post('/investigations/test-id/feedback')
        .send({ type: 'general', content: 'test' });
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should have GET /investigations/:id/report endpoint', async () => {
      const response = await request(testApp)
        .get('/investigations/test-id/report');
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should have GET /investigations endpoint for listing', async () => {
      const response = await request(testApp)
        .get('/investigations');
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should have GET /investigations/stats endpoint', async () => {
      const response = await request(testApp)
        .get('/investigations/stats');
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should have POST /investigations/:id/pause endpoint', async () => {
      const response = await request(testApp)
        .post('/investigations/test-id/pause');
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should have POST /investigations/:id/resume endpoint', async () => {
      const response = await request(testApp)
        .post('/investigations/test-id/resume');
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });
  });

  describe('Endpoint Response Structure', () => {
    it('should validate feedback input structure', async () => {
      const response = await request(testApp)
        .post('/investigations/test-id/feedback')
        .send('invalid');
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Feedback object is required');
    });

    it('should validate feedback type', async () => {
      const response = await request(testApp)
        .post('/investigations/test-id/feedback')
        .send({ type: 'invalid_type', content: 'test' });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid feedback type');
    });

    it('should require alertId for starting investigation', async () => {
      const response = await request(testApp)
        .post('/investigations/start')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('alertId is required');
    });
  });
});