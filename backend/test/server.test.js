const request = require('supertest');
const { pool } = require('../database');

// Mock the database for testing
jest.mock('../database', () => ({
  pool: {
    query: jest.fn(),
  },
  initDatabase: jest.fn(),
}));

// Mock bcrypt to avoid real hashing/compare during tests
jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed-password')
}));

// Mock environment variables
process.env.JWT_SECRET = 'test-secret';

// Import app after mocking
const app = require('../server');

describe('Server API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should register a new user', async () => {
      const mockUser = { id: 1, email: 'test@example.com' };
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // No existing user
        .mockResolvedValueOnce({ rows: [mockUser] }); // Insert user

      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });

    it('should reject duplicate registration', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Existing user

      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email exists');
    });
  });

  describe('Alerts API', () => {
    it('should require authentication for alerts', async () => {
      const response = await request(app).get('/alerts');
      expect(response.status).toBe(401);
    });

    it('should return empty alerts list', async () => {
      // First get a valid token
      const mockUser = { id: 1, email: 'test@example.com', password: '$2a$10$hashed' };
      // 1) Login user lookup
      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      const token = loginResponse.body.token;

      // 2) /auth/me lookup during auth middleware
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'test@example.com' }] });
      // 3) Alerts query returns empty list
      pool.query.mockResolvedValueOnce({ rows: [] });

      const alertsResponse = await request(app)
        .get('/alerts')
        .set('Authorization', `Bearer ${token}`);

      expect(alertsResponse.status).toBe(200);
      expect(alertsResponse.body.alerts).toEqual([]);
    });
  });

  describe('Health Check', () => {
    it('should add health check endpoint', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });
});
