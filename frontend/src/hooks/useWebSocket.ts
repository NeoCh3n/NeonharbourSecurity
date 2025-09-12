import { useEffect, useRef, useState } from 'react';

type WebSocketMessage = {
  type: string;
  data: any;
  timestamp: string;
};

type WebSocketOptions = {
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
};

export function useWebSocket(url: string, options: WebSocketOptions = {}) {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');
    
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setConnectionStatus('disconnected');
        onDisconnect?.();
        
        // Attempt to reconnect if we haven't exceeded max attempts
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (error) => {
        setConnectionStatus('error');
        onError?.(error);
      };
    } catch (error) {
      setConnectionStatus('error');
      console.error('Failed to create WebSocket connection:', error);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
  };

  const sendMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  };

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [url]);

  return {
    isConnected,
    connectionStatus,
    lastMessage,
    sendMessage,
    connect,
    disconnect
  };
}

// Hook specifically for investigation updates
export function useInvestigationUpdates(investigationId?: string) {
  const [updates, setUpdates] = useState<any[]>([]);
  
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/investigations${investigationId ? `/${investigationId}` : ''}`;
  
  const { isConnected, connectionStatus, sendMessage } = useWebSocket(wsUrl, {
    onMessage: (message) => {
      if (message.type === 'investigation_update') {
        setUpdates(prev => [message.data, ...prev.slice(0, 99)]); // Keep last 100 updates
      }
    },
    onConnect: () => {
      console.log('Connected to investigation updates');
    },
    onDisconnect: () => {
      console.log('Disconnected from investigation updates');
    },
    onError: (error) => {
      console.error('Investigation WebSocket error:', error);
    }
  });

  const subscribeToInvestigation = (id: string) => {
    return sendMessage({
      type: 'subscribe',
      investigationId: id
    });
  };

  const unsubscribeFromInvestigation = (id: string) => {
    return sendMessage({
      type: 'unsubscribe',
      investigationId: id
    });
  };

  return {
    isConnected,
    connectionStatus,
    updates,
    subscribeToInvestigation,
    unsubscribeFromInvestigation
  };
}