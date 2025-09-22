import React from 'react';
import { useAuth, type Permission, type UserRole } from '../hooks/useAuth';
import { Box, StatusIndicator } from '@cloudscape-design/components';

interface ProtectedComponentProps {
  children: React.ReactNode;
  permission?: Permission;
  role?: UserRole;
  roles?: UserRole[];
  fallback?: React.ReactNode;
  showFallback?: boolean;
}

export function ProtectedComponent({
  children,
  permission,
  role,
  roles,
  fallback,
  showFallback = false
}: ProtectedComponentProps) {
  const { user, hasPermission, hasRole, hasAnyRole } = useAuth();

  // If no user is authenticated, don't show protected content
  if (!user) {
    return showFallback ? (
      fallback || (
        <Box textAlign="center" padding="s">
          <StatusIndicator type="warning">
            Authentication required
          </StatusIndicator>
        </Box>
      )
    ) : null;
  }

  // Check permission if specified
  if (permission && !hasPermission(permission)) {
    return showFallback ? (
      fallback || (
        <Box textAlign="center" padding="s">
          <StatusIndicator type="error">
            Insufficient permissions
          </StatusIndicator>
        </Box>
      )
    ) : null;
  }

  // Check single role if specified
  if (role && !hasRole(role)) {
    return showFallback ? (
      fallback || (
        <Box textAlign="center" padding="s">
          <StatusIndicator type="error">
            Access restricted to {role} role
          </StatusIndicator>
        </Box>
      )
    ) : null;
  }

  // Check multiple roles if specified
  if (roles && !hasAnyRole(roles)) {
    return showFallback ? (
      fallback || (
        <Box textAlign="center" padding="s">
          <StatusIndicator type="error">
            Access restricted to {roles.join(', ')} roles
          </StatusIndicator>
        </Box>
      )
    ) : null;
  }

  return <>{children}</>;
}

// Convenience components for common use cases
export function AdminOnly({ children, fallback, showFallback }: Omit<ProtectedComponentProps, 'role'>) {
  return (
    <ProtectedComponent role="admin" fallback={fallback} showFallback={showFallback}>
      {children}
    </ProtectedComponent>
  );
}

export function AnalystOrAdmin({ children, fallback, showFallback }: Omit<ProtectedComponentProps, 'roles'>) {
  return (
    <ProtectedComponent roles={['analyst', 'admin']} fallback={fallback} showFallback={showFallback}>
      {children}
    </ProtectedComponent>
  );
}

export function RequirePermission({ 
  permission, 
  children, 
  fallback, 
  showFallback 
}: { permission: Permission } & Omit<ProtectedComponentProps, 'permission'>) {
  return (
    <ProtectedComponent permission={permission} fallback={fallback} showFallback={showFallback}>
      {children}
    </ProtectedComponent>
  );
}