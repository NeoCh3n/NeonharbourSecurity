// import React from 'react';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Badge,
  StatusIndicator,
  ColumnLayout,
  Button
} from '@cloudscape-design/components';
import { useAuth, PERMISSIONS } from '../hooks/useAuth';
import { useSessionManager } from '../hooks/useSessionManager';
import { AuthStatus } from './AuthStatus';

export function AuthTest() {
  const { user, hasPermission, isSignedIn, isLoaded, getToken } = useAuth();
  const sessionManager = useSessionManager();
  const sessionInfo = sessionManager.getSessionInfo();

  const testTokenRetrieval = async () => {
    try {
      const token = await getToken();
      console.log('Token retrieved successfully:', token ? 'Present' : 'Null');
      alert(`Token retrieval: ${token ? 'Success' : 'Failed'}`);
    } catch (error) {
      console.error('Token retrieval failed:', error);
      alert(`Token retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (!isLoaded) {
    return (
      <Container header={<Header variant="h2">Authentication Test</Header>}>
        <StatusIndicator type="loading">Loading authentication...</StatusIndicator>
      </Container>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <Container header={<Header variant="h2">Authentication Test</Header>}>
        <StatusIndicator type="warning">Not authenticated</StatusIndicator>
      </Container>
    );
  }

  return (
    <SpaceBetween size="l">
      <AuthStatus />
      
      <Container 
        header={
          <Header 
            variant="h2"
            actions={
              <Button onClick={testTokenRetrieval}>
                Test Token Retrieval
              </Button>
            }
          >
            Permission Tests
          </Header>
        }
      >
        <SpaceBetween size="l">
        <ColumnLayout columns={2} variant="text-grid">
          <Box>
            <Box variant="awsui-key-label">User ID</Box>
            <Box variant="p">{user.id}</Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Email</Box>
            <Box variant="p">{user.email || '—'}</Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Role</Box>
            <Badge color={user.role === 'admin' ? 'red' : user.role === 'analyst' ? 'blue' : 'grey'}>
              {user.role}
            </Badge>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Demo User</Box>
            <StatusIndicator type={user.isDemo ? 'warning' : 'success'}>
              {user.isDemo ? 'Yes' : 'No'}
            </StatusIndicator>
          </Box>
        </ColumnLayout>

        <Box>
          <Box variant="awsui-key-label">Permissions</Box>
          <SpaceBetween direction="horizontal" size="xs">
            {user.permissions.map(permission => (
              <Badge key={permission} color="blue">
                {permission}
              </Badge>
            ))}
          </SpaceBetween>
        </Box>

        <Box>
          <Box variant="awsui-key-label">Permission Checks</Box>
          <ColumnLayout columns={3} variant="text-grid">
            <Box>
              <Box variant="small">View Investigations</Box>
              <StatusIndicator type={hasPermission(PERMISSIONS.VIEW_INVESTIGATIONS) ? 'success' : 'error'}>
                {hasPermission(PERMISSIONS.VIEW_INVESTIGATIONS) ? 'Allowed' : 'Denied'}
              </StatusIndicator>
            </Box>
            <Box>
              <Box variant="small">Manage Users</Box>
              <StatusIndicator type={hasPermission(PERMISSIONS.MANAGE_USERS) ? 'success' : 'error'}>
                {hasPermission(PERMISSIONS.MANAGE_USERS) ? 'Allowed' : 'Denied'}
              </StatusIndicator>
            </Box>
            <Box>
              <Box variant="small">Start Demo</Box>
              <StatusIndicator type={hasPermission(PERMISSIONS.START_DEMO) ? 'success' : 'error'}>
                {hasPermission(PERMISSIONS.START_DEMO) ? 'Allowed' : 'Denied'}
              </StatusIndicator>
            </Box>
          </ColumnLayout>
        </Box>

        <Box>
          <Box variant="awsui-key-label">Session Info</Box>
          <ColumnLayout columns={2} variant="text-grid">
            <Box>
              <Box variant="small">Session Valid</Box>
              <StatusIndicator type={sessionManager.isSessionValid() ? 'success' : 'error'}>
                {sessionManager.isSessionValid() ? 'Valid' : 'Invalid'}
              </StatusIndicator>
            </Box>
            <Box>
              <Box variant="small">Session ID</Box>
              <Box variant="p">{sessionInfo.sessionId || '—'}</Box>
            </Box>
          </ColumnLayout>
        </Box>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}