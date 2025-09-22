import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useEffect, useCallback, useState } from 'react';

export interface SessionManager {
  refreshToken: () => Promise<string | null>;
  isSessionValid: () => boolean;
  getSessionInfo: () => {
    isSignedIn: boolean;
    isLoaded: boolean;
    sessionId?: string;
    userId?: string;
  };
  lastRefresh: Date | null;
  refreshError: string | null;
  isRefreshing: boolean;
}

export function useSessionManager(): SessionManager {
  const { getToken, isSignedIn, isLoaded, sessionId, userId } = useClerkAuth();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Automatically refresh token before expiration
  useEffect(() => {
    if (!isSignedIn) return;

    const refreshInterval = setInterval(async () => {
      try {
        setIsRefreshing(true);
        setRefreshError(null);
        await getToken({ skipCache: true });
        setLastRefresh(new Date());
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to refresh token:', error);
        setRefreshError(errorMessage);
      } finally {
        setIsRefreshing(false);
      }
    }, 50 * 60 * 1000); // Refresh every 50 minutes (tokens expire in 60 minutes)

    return () => clearInterval(refreshInterval);
  }, [isSignedIn, getToken]);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    try {
      if (!isSignedIn) {
        setRefreshError('User not signed in');
        return null;
      }
      
      setIsRefreshing(true);
      setRefreshError(null);
      const token = await getToken({ skipCache: true });
      setLastRefresh(new Date());
      return token;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to refresh token:', error);
      setRefreshError(errorMessage);
      return null;
    } finally {
      setIsRefreshing(false);
    }
  }, [isSignedIn, getToken]);

  const isSessionValid = useCallback((): boolean => {
    return isLoaded && isSignedIn;
  }, [isLoaded, isSignedIn]);

  const getSessionInfo = useCallback(() => {
    return {
      isSignedIn: isSignedIn ?? false,
      isLoaded,
      sessionId: sessionId || undefined,
      userId: userId || undefined
    };
  }, [isSignedIn, isLoaded, sessionId, userId]);

  return {
    refreshToken,
    isSessionValid,
    getSessionInfo,
    lastRefresh,
    refreshError,
    isRefreshing
  };
}