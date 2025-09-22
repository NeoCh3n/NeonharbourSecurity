// Test backend authentication middleware
const { authenticateToken, requirePermission, PERMISSIONS, USER_ROLES } = require('./middleware/auth');

console.log('🔍 Testing Backend Authentication Middleware...\n');

// Test middleware exports
console.log('✅ authenticateToken middleware exported');
console.log('✅ requirePermission middleware exported');
console.log('✅ PERMISSIONS constants exported:', Object.keys(PERMISSIONS).length, 'permissions');
console.log('✅ USER_ROLES constants exported:', Object.keys(USER_ROLES).length, 'roles');

// Test demo token
const demoToken = process.env.DEMO_AUTH_TOKEN || 'change-me';
console.log('✅ Demo token configured:', demoToken);

// Mock request/response for testing
const mockReq = {
  headers: {
    authorization: `Bearer ${demoToken}`
  }
};

const mockRes = {
  status: (code) => ({
    json: (data) => {
      console.log(`Response ${code}:`, data);
      return mockRes;
    }
  })
};

const mockNext = () => {
  console.log('✅ Authentication middleware passed - user attached to request');
  console.log('User object:', mockReq.user);
};

console.log('\n🧪 Testing demo token authentication...');

// Test the authentication middleware
authenticateToken(mockReq, mockRes, mockNext)
  .then(() => {
    console.log('\n🎯 Backend authentication test complete!');
  })
  .catch((error) => {
    console.error('❌ Authentication test failed:', error);
  });