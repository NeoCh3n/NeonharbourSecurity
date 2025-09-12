import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWebSocket, useInvestigationUpdates } from './useWebSocket';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection opening after a short delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string) {
    if (this.readyState === MockWebSocket.OPEN) {
      // Echo back for testing
      setTimeout(() => {
        this.onmessage?.(new MessageEvent('message', { data }));
      }, 5);
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    setTimeout(() => {
      this.onclose?.(new CloseEvent('close'));
    }, 5);
  }
}

// Mock global WebSocket
global.WebSocket = MockWebSocket as any;

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to WebSocket and updates connection status', async () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8080', { onConnect })
    );

    expect(result.current.connectionStatus).toBe('connecting');
    expect(result.current.isConnected).toBe(false);

    // Fast-forward to connection
    act(() => {
      vi.advanceTimersByTime(15);
    });

    expect(result.current.connectionStatus).toBe('connected');
    expect(result.current.isConnected).toBe(true);
    expect(onConnect).toHaveBeenCalled();
  });

  it('handles incoming messages', async () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8080', { onMessage })
    );

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(15);
    });

    // Send a message
    const testMessage = { type: 'test', data: 'hello' };
    act(() => {
      result.current.sendMessage(testMessage);
      vi.advanceTimersByTime(10);
    });

    expect(onMessage).toHaveBeenCalledWith(testMessage);
    expect(result.current.lastMessage).toEqual(testMessage);
  });

  it('sends messages when connected', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8080')
    );

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(15);
    });

    const success = result.current.sendMessage({ type: 'test' });
    expect(success).toBe(true);
  });

  it('fails to send messages when not connected', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8080')
    );

    // Don't wait for connection
    const success = result.current.sendMessage({ type: 'test' });
    expect(success).toBe(false);
  });

  it('handles disconnection', async () => {
    const onDisconnect = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8080', { onDisconnect })
    );

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(15);
    });

    expect(result.current.isConnected).toBe(true);

    // Disconnect
    act(() => {
      result.current.disconnect();
      vi.advanceTimersByTime(10);
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionStatus).toBe('disconnected');
    expect(onDisconnect).toHaveBeenCalled();
  });

  it('attempts to reconnect on connection loss', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8080', { 
        reconnectInterval: 1000,
        maxReconnectAttempts: 3
      })
    );

    // Wait for initial connection
    act(() => {
      vi.advanceTimersByTime(15);
    });

    expect(result.current.isConnected).toBe(true);

    // Simulate connection loss
    act(() => {
      // Manually trigger close event
      const ws = (result.current as any).wsRef?.current;
      if (ws) {
        ws.readyState = MockWebSocket.CLOSED;
        ws.onclose?.(new CloseEvent('close'));
      }
      vi.advanceTimersByTime(10);
    });

    expect(result.current.isConnected).toBe(false);

    // Should attempt reconnection after interval
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should be connecting again
    expect(result.current.connectionStatus).toBe('connecting');
  });
});

describe('useInvestigationUpdates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
        host: 'localhost:3000'
      },
      writable: true
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to investigation updates WebSocket', async () => {
    const { result } = renderHook(() => useInvestigationUpdates());

    expect(result.current.connectionStatus).toBe('connecting');

    act(() => {
      vi.advanceTimersByTime(15);
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('handles investigation update messages', async () => {
    const { result } = renderHook(() => useInvestigationUpdates());

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(15);
    });

    // Simulate receiving an investigation update
    act(() => {
      const ws = (global.WebSocket as any).instances?.[0];
      if (ws) {
        const updateMessage = {
          type: 'investigation_update',
          data: {
            investigationId: 'inv-123',
            status: 'executing',
            progress: 50
          }
        };
        ws.onmessage?.(new MessageEvent('message', { 
          data: JSON.stringify(updateMessage) 
        }));
      }
    });

    expect(result.current.updates).toHaveLength(1);
    expect(result.current.updates[0]).toEqual({
      investigationId: 'inv-123',
      status: 'executing',
      progress: 50
    });
  });

  it('subscribes to specific investigation', async () => {
    const { result } = renderHook(() => useInvestigationUpdates());

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(15);
    });

    const success = result.current.subscribeToInvestigation('inv-123');
    expect(success).toBe(true);
  });

  it('unsubscribes from investigation', async () => {
    const { result } = renderHook(() => useInvestigationUpdates());

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(15);
    });

    const success = result.current.unsubscribeFromInvestigation('inv-123');
    expect(success).toBe(true);
  });

  it('connects to specific investigation WebSocket when ID provided', async () => {
    const { result } = renderHook(() => useInvestigationUpdates('inv-123'));

    expect(result.current.connectionStatus).toBe('connecting');

    act(() => {
      vi.advanceTimersByTime(15);
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('limits updates to last 100 entries', async () => {
    const { result } = renderHook(() => useInvestigationUpdates());

    // Wait for connection
    act(() => {
      vi.advanceTimersByTime(15);
    });

    // Simulate receiving 105 updates
    act(() => {
      const ws = (global.WebSocket as any).instances?.[0];
      if (ws) {
        for (let i = 0; i < 105; i++) {
          const updateMessage = {
            type: 'investigation_update',
            data: { investigationId: `inv-${i}`, status: 'executing' }
          };
          ws.onmessage?.(new MessageEvent('message', { 
            data: JSON.stringify(updateMessage) 
          }));
        }
      }
    });

    expect(result.current.updates).toHaveLength(100);
    expect(result.current.updates[0].investigationId).toBe('inv-104'); // Most recent
    expect(result.current.updates[99].investigationId).toBe('inv-5'); // 100th from most recent
  });
});