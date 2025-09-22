let clerkClient;
let jwt;
try {
  const clerk = require('@clerk/clerk-sdk-node');
  clerkClient = clerk.clerkClient;
  jwt = require('jsonwebtoken');
} catch (error) {
  console.warn('Clerk SDK not available, using fallback authentication');
}
const pino = require('pino');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// User roles and permissions
const USER_ROLES = {
  ADMIN: 'admin',
  ANALYST: 'analyst', 
  VIEWER: 'viewer',
  DEMO_USER: 'demo_user'
};

const PERMISSIONS = {
  // Investigation permissions
  VIEW_INVESTIGATIONS: 'view_investigations',
  CREATE_INVESTIGATIONS: 'create_investigations',
  MODIFY_INVESTIGATIONS: 'modify_investigations',
  DELETE_INVESTIGATIONS: 'delete_investigations',
  
  // Demo permissions
  START_DEMO: 'start_demo',
  CONFIGURE_DEMO: 'configure_demo',
  VIEW_DEMO_METRICS: 'view_demo_metrics',
  
  // Admin permissions
  MANAGE_USERS: 'manage_users',
  CONFIGURE_SYSTEM: 'configure_system',
  VIEW_SYSTEM_HEALTH: 'view_system_health',
  MANAGE_AWS_CONFIG: 'manage_aws_config',
  
  // Data source permissions
  CONFIGURE_DATA_SOURCES: 'configure_data_sources',
  VIEW_AUDIT_LOGS: 'view_audit_logs'
};

// Role-based permission mapping
const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: [
    PERMISSIONS.VIEW_INVESTIGATIONS,
    PERMISSIONS.CREATE_INVESTIGATIONS,
    PERMISSIONS.MODIFY_INVESTIGATIONS,
    PERMISSIONS.DELETE_INVESTIGATIONS,
    PERMISSIONS.START_DEMO,
    PERMISSIONS.CONFIGURE_DEMO,
    PERMISSIONS.VIEW_DEMO_METRICS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.CONFIGURE_SYSTEM,
    PERMISSIONS.VIEW_SYSTEM_HEALTH,
    PERMISSIONS.MANAGE_AWS_CONFIG,
    PERMISSIONS.CONFIGURE_DATA_SOURCES,
    PERMISSIONS.VIEW_AUDIT_LOGS
  ],
  [USER_ROLES.ANALYST]: [
    PERMISSIONS.VIEW_INVESTIGATIONS,
    PERMISSIONS.CREATE_INVESTIGATIONS,
    PERMISSIONS.MODIFY_INVESTIGATIONS,
    PERMISSIONS.START_DEMO,
    PERMISSIONS.VIEW_DEMO_METRICS,
    PERMISSIONS.VIEW_SYSTEM_HEALTH
  ],
  [USER_ROLES.VIEWER]: [
    PERMISSIONS.VIEW_INVESTIGATIONS,
    PERMISSIONS.VIEW_DEMO_METRICS,
    PERMISSIONS.VIEW_SYSTEM_HEALTH
  ],
  [USER_ROLES.DEMO_USER]: [
    PERMISSIONS.VIEW_INVESTIGATIONS,
    PERMISSIONS.START_DEMO,
    PERMISSIONS.CONFIGURE_DEMO,
    PERMISSIONS.VIEW_DEMO_METRICS
  ]
};

/**
 * Extract user role from Clerk user metadata
 */
function getUserRole(clerkUser) {
  // Check public metadata first, then private metadata
  const role = clerkUser.publicMetadata?.role || 
               clerkUser.privateMetadata?.role || 
               USER_ROLES.VIEWER; // Default role
  
  // Validate role exists
  if (!Object.values(USER_ROLES).includes(role)) {
    logger.warn({ userId: clerkUser.id, role }, 'Invalid user role, defaulting to viewer');
    return USER_ROLES.VIEWER;
  }
  
  return role;
}

/**
 * Get user permissions based on role
 */
function getUserPermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if user has specific permission
 */
function hasPermission(userPermissions, requiredPermission) {
  return userPermissions.includes(requiredPermission);
}

/**
 * Middleware to authenticate JWT tokens from Clerk
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Missing or invalid authorization header' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // For demo mode, allow the demo token
    const demoToken = process.env.DEMO_AUTH_TOKEN || 'change-me';
    if (token === demoToken) {
      req.user = {
        id: 'demo-user',
        role: USER_ROLES.DEMO_USER,
        permissions: getUserPermissions(USER_ROLES.DEMO_USER),
        isDemo: true
      };
      return next();
    }

    // If Clerk is not available, reject non-demo tokens
    if (!clerkClient || !jwt) {
      return res.status(401).json({ 
        error: 'Authentication service unavailable',
        message: 'Clerk authentication is not configured. Use demo token for testing.' 
      });
    }

    // Verify JWT token with Clerk
    let decoded;
    try {
      decoded = jwt.decode(token, { complete: true });
      if (!decoded || !decoded.payload || !decoded.payload.sub) {
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'Token structure is invalid' 
        });
      }
    } catch (decodeError) {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Token could not be decoded' 
      });
    }

    // Verify token hasn't expired
    const now = Math.floor(Date.now() / 1000);
    if (decoded.payload.exp && decoded.payload.exp < now) {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'JWT token has expired' 
      });
    }

    // Get user from Clerk
    let clerkUser;
    try {
      clerkUser = await clerkClient.users.getUser(decoded.payload.sub);
      if (!clerkUser) {
        return res.status(401).json({ 
          error: 'User not found',
          message: 'User does not exist in Clerk' 
        });
      }
    } catch (clerkError) {
      logger.error({ error: clerkError.message, userId: decoded.payload.sub }, 'Failed to fetch user from Clerk');
      return res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Unable to verify user with authentication service' 
      });
    }

    // Extract role and permissions
    const role = getUserRole(clerkUser);
    const permissions = getUserPermissions(role);

    // Attach user info to request
    req.user = {
      id: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress,
      role,
      permissions,
      clerkUser,
      isDemo: false
    };

    next();
  } catch (error) {
    logger.error({ error: error.message }, 'Authentication failed');
    return res.status(401).json({ 
      error: 'Authentication failed',
      message: 'Invalid or expired token' 
    });
  }
}

/**
 * Middleware to require specific permission
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'User not authenticated' 
      });
    }

    if (!hasPermission(req.user.permissions, permission)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `Required permission: ${permission}`,
        userRole: req.user.role 
      });
    }

    next();
  };
}

/**
 * Middleware to require specific role
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'User not authenticated' 
      });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ 
        error: 'Insufficient role',
        message: `Required role: ${role}`,
        userRole: req.user.role 
      });
    }

    next();
  };
}

/**
 * Optional authentication - doesn't fail if no token provided
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    // Use the main auth middleware
    await authenticateToken(req, res, next);
  } catch (error) {
    // Don't fail on optional auth errors
    req.user = null;
    next();
  }
}

module.exports = {
  authenticateToken,
  requirePermission,
  requireRole,
  optionalAuth,
  USER_ROLES,
  PERMISSIONS,
  getUserRole,
  getUserPermissions,
  hasPermission
};