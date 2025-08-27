const { pool } = require('../database');

async function auditLog(action, userId, details = {}) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (action, user_id, details, ip_address) VALUES ($1, $2, $3, $4)',
      [action, userId, JSON.stringify(details), details.ipAddress || 'unknown']
    );
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

function auditMiddleware(action) {
  return async (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(data) {
      // Log after response is sent
      setTimeout(async () => {
        try {
          await auditLog(action, req.user?.id, {
            endpoint: req.originalUrl,
            method: req.method,
            statusCode: res.statusCode,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            response: res.statusCode < 400 ? 'success' : 'error'
          });
        } catch (error) {
          console.error('Audit logging error:', error);
        }
      }, 0);
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

module.exports = { auditLog, auditMiddleware };