import { useState, useEffect } from 'react';
import {
  Box,
  StatusIndicator,
  SpaceBetween,
  Badge,
  Button,
  Container,
  Header,
  ColumnLayout
} from '@cloudscape-design/components';
import { useAuth } from '../hooks/useAuth';
import { useSessionManager } from '../hooks/useSessionManager';
import { formatTokenInfo } from '../lib/tokenValidator';

export function AuthStatus() {
  const { user, isSignedIn, isLoaded, getSessionInfo, getToken } = useAuth();
  const { 
    lastRefresh, 
    refreshError, 
    isRefreshing, 
    refreshToken,
    isSessionValid 
  } = useSessionManager();

  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const sessionInfo = getSessionInfo();

  const handleRefreshToken = async () => {
    await refreshToken();
    await updateTokenInfo();
  };

  const updateTokenInfo = async () => {
    try {
      const token = await getToken();
      if (token) {
        setTokenInfo(formatTokenInfo(token));
      } else {
        setTokenInfo(null);
      }
    } catch (error) {
      console.error('Failed to get token for analysis:', error);
      setTokenInfo(null);
    }
  };

  useEffect(() => {
    if (isSignedIn) {
      updateTokenInfo();
    }
  }, [isSignedIn, lastRefresh]);

  if (!isLoaded) {
    return (
      <Container header={<Header variant="h3">Authentication Status</Header>}>
        <StatusIndicator type="loading">Loading authentication...</StatusIndicator>
      </Container>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <Container header={<Header variant="h3">Authentication Status</Header>}>
        <StatusIndicator type="warning">Not authenticated</StatusIndicator>
      </Container>
    );
  }

  return (
    <Container 
      header={
        <Header 
          variant="h3"
          actions={
            <Button
              onClick={handleRefreshToken}
              loading={isRefreshing}
              disabled={isRefreshing}
              iconName="refresh"
            >
              Refresh Token
            </Button>
          }
        >
          Authentication Status
        </Header>
      }
    >
      <SpaceBetween size="m">
        <ColumnLayout columns={2} variant="text-grid">
          <Box>
            <Box variant="awsui-key-label">Status</Box>
            <StatusIndicator type={isSessionValid() ? "success" : "error"}>
              {isSessionValid() ? "Authenticated" : "Session Invalid"}
            </StatusIndicator>
          </Box>
          <Box>
            <Box variant="awsui-key-label">User ID</Box>
            <Box variant="p">{user.id}</Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Email</Box>
            <Box variant="p">{user.email || 'Not provided'}</Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Role</Box>
            <Badge color={user.isDemo ? "blue" : "green"}>
              {user.role} {user.isDemo && "(Demo)"}
            </Badge>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Session ID</Box>
            <Box variant="p">{sessionInfo.sessionId || 'Not available'}</Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Last Token Refresh</Box>
            <Box variant="p">
              {lastRefresh ? lastRefresh.toLocaleString() : 'Never'}
            </Box>
          </Box>
        </ColumnLayout>

        {refreshError && (
          <StatusIndicator type="error">
            Token refresh error: {refreshError}
          </StatusIndicator>
        )}

        {isRefreshing && (
          <StatusIndicator type="loading">
            Refreshing authentication token...
          </StatusIndicator>
        )}

        <Box>
          <Box variant="awsui-key-label">Permissions</Box>
          <SpaceBetween size="xs" direction="horizontal">
            {user.permissions.map(permission => (
              <Badge key={permission} color="blue">
                {permission}
              </Badge>
            ))}
          </SpaceBetween>
        </Box>

        {tokenInfo && (
          <Container header={<Header variant="h3">JWT Token Information</Header>}>
            <ColumnLayout columns={2} variant="text-grid">
              <Box>
                <Box variant="awsui-key-label">Token Status</Box>
                <StatusIndicator type={tokenInfo.isExpired ? "error" : "success"}>
                  {tokenInfo.isExpired ? "Expired" : "Valid"}
                </StatusIndicator>
              </Box>
              <Box>
                <Box variant="awsui-key-label">Expires At</Box>
                <Box variant="p">{tokenInfo.expiresAt || 'Unknown'}</Box>
              </Box>
              <Box>
                <Box variant="awsui-key-label">Time Until Expiry</Box>
                <Box variant="p">{tokenInfo.timeUntilExpiry || 'Unknown'}</Box>
              </Box>
              <Box>
                <Box variant="awsui-key-label">Issuer</Box>
                <Box variant="p">{tokenInfo.issuer || 'Unknown'}</Box>
              </Box>
            </ColumnLayout>
          </Container>
        )}
      </SpaceBetween>
    </Container>
  );
}