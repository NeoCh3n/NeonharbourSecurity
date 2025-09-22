import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import { useMemo } from 'react';

// User roles and permissions (matching backend)
export const USER_ROLES = {
  ADMIN: 'admin',
  ANALYST: 'analyst', 
  VIEWER: 'viewer',
  DEMO_USER: 'demo_user'
} as const;

export const PERMISSIONS = {
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
} as const;

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
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export interface AuthUser {
  id: string;
  email?: string;
  role: UserRole;
  permissions: Permission[];
  isDemo: boolean;
}

export function useAuth() {
  const { isSignedIn, getToken, isLoaded, sessionId, userId } = useClerkAuth();
  const { user } = useUser();

  const authUser = useMemo((): AuthUser | null => {
    if (!isSignedIn || !user) return null;

    // Get role from user metadata (check public metadata)
    const role = (user.publicMetadata?.role as UserRole) || 
                 USER_ROLES.VIEWER;

    // Get permissions based on role
    const permissions = [...(ROLE_PERMISSIONS[role] || [])];

    // Check if this is a demo user
    const isDemo = role === USER_ROLES.DEMO_USER || 
                   user.publicMetadata?.isDemo === true;

    return {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      role,
      permissions,
      isDemo
    };
  }, [isSignedIn, user]);

  const hasPermission = (permission: Permission): boolean => {
    return authUser?.permissions.includes(permission) ?? false;
  };

  const hasRole = (role: UserRole): boolean => {
    return authUser?.role === role;
  };

  const hasAnyRole = (roles: UserRole[]): boolean => {
    return authUser ? roles.includes(authUser.role) : false;
  };

  // Enhanced session info
  const getSessionInfo = () => ({
    isSignedIn: isSignedIn ?? false,
    isLoaded,
    sessionId: sessionId || undefined,
    userId: userId || undefined,
    user: authUser
  });

  return {
    isSignedIn,
    isLoaded,
    user: authUser,
    getToken,
    hasPermission,
    hasRole,
    hasAnyRole,
    getSessionInfo,
    sessionId,
    userId
  };
}