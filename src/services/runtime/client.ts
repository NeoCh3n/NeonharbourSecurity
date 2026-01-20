import { runtimeStore } from './store';
import type { RuntimeEvent } from './types';
import type { RuntimeConnectionSettings } from './settings';

const REQUEST_TIMEOUT_MS = 20000;

const normalizeEndpoint = (endpoint: string, authToken?: string): string => {
  if (!endpoint) return '';

  let normalized = endpoint.trim();
  const hasScheme = /^(wss?|https?):\/\//i.test(normalized);
  if (!hasScheme) {
    normalized = `ws://${normalized}`;
  }

  if (normalized.startsWith('http://')) {
    normalized = normalized.replace('http://', 'ws://');
  }
  if (normalized.startsWith('https://')) {
    normalized = normalized.replace('https://', 'wss://');
  }

  if (authToken) {
    try {
      const url = new URL(normalized);
      url.searchParams.set('token', authToken);
      return url.toString();
    } catch {
      const separator = normalized.includes('?') ? '&' : '?';
      return `${normalized}${separator}token=${encodeURIComponent(authToken)}`;
    }
  }

  return normalized;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

class RuntimeClient {
  private socket?: WebSocket;
  private requestId = 1;
  private pending = new Map<number, PendingRequest>();
  private settings: RuntimeConnectionSettings;

  constructor(settings: RuntimeConnectionSettings) {
    this.settings = settings;
  }

  setSettings(settings: RuntimeConnectionSettings) {
    this.settings = settings;
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect(settings?: RuntimeConnectionSettings): Promise<void> {
    const nextSettings = settings ?? this.settings;
    this.settings = nextSettings;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const endpoint = normalizeEndpoint(nextSettings.endpoint, nextSettings.authToken);
    if (!endpoint) {
      runtimeStore.updateConnection({ status: 'error', lastError: 'Runtime endpoint is required.' });
      throw new Error('Runtime endpoint is required.');
    }

    runtimeStore.updateConnection({
      status: 'connecting',
      lastError: undefined,
      mode: nextSettings.mode,
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      try {
        this.socket = new WebSocket(endpoint);
      } catch (error) {
        runtimeStore.updateConnection({ status: 'error', lastError: 'Failed to open runtime connection.' });
        reject(error instanceof Error ? error : new Error('Failed to open runtime connection.'));
        return;
      }

      if (!this.socket) {
        reject(new Error('Failed to initialize runtime socket.'));
        return;
      }

      this.socket.onopen = async () => {
        try {
          await this.sendRequest('initialize', {
            client: {
              name: 'NeoHarbor Control Plane',
              version: '1.0.0',
            },
            capabilities: {
              approvals: true,
              artifacts: true,
              resume: true,
            },
            routing: {
              mode: nextSettings.mode,
              role: 'control-plane',
              org_id: nextSettings.orgId,
              environment: nextSettings.environment,
              runtime_id: nextSettings.runtimeId,
            },
          });
          this.sendNotification('initialized', {});
          runtimeStore.updateConnection({
            status: 'connected',
            lastConnectedAt: new Date().toISOString(),
            mode: nextSettings.mode,
          });
          settled = true;
          resolve();
        } catch (error) {
          runtimeStore.updateConnection({
            status: 'error',
            lastError: error instanceof Error ? error.message : 'Initialization failed.',
          });
          settled = true;
          reject(error instanceof Error ? error : new Error('Initialization failed.'));
        }
      };

      this.socket.onmessage = (message) => {
        this.handleMessage(message.data);
      };

      this.socket.onerror = () => {
        runtimeStore.updateConnection({ status: 'error', lastError: 'Runtime connection error.' });
        if (!settled) {
          settled = true;
          reject(new Error('Runtime connection error.'));
        }
      };

      this.socket.onclose = () => {
        runtimeStore.updateConnection({ status: 'disconnected' });
        if (!settled) {
          settled = true;
          reject(new Error('Runtime connection closed before initialization.'));
        }
      };
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
    }
    this.socket = undefined;
    runtimeStore.updateConnection({ status: 'disconnected' });
  }

  async sendRequest<T = any>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Runtime connection is not open.');
    }

    const id = this.requestId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params: params ?? {},
    };

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Runtime request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timeoutId });
      this.socket?.send(JSON.stringify(payload));
    });
  }

  sendNotification(method: string, params?: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = {
      jsonrpc: '2.0',
      method,
      params: params ?? {},
    };

    this.socket.send(JSON.stringify(payload));
  }

  startRun(alert: Record<string, unknown>, options?: Record<string, unknown>) {
    return this.sendRequest<{ run_id: string }>('run/start', {
      alert,
      ...options,
    });
  }

  stopRun(runId: string) {
    return this.sendRequest('run/cancel', { run_id: runId });
  }

  executeAgent(
    agentId: string,
    input: Record<string, unknown>,
    runId?: string,
    options?: Record<string, unknown>,
  ) {
    return this.sendRequest('agent/execute', {
      agent_id: agentId,
      ...(runId ? { run_id: runId } : {}),
      input,
      ...options,
    });
  }

  respondToServerRequest(requestId: string, decision: 'approved' | 'rejected', comment?: string) {
    return this.sendRequest('respond_to_server_request', {
      request_id: requestId,
      decision,
      comment,
    });
  }

  subscribeToRun(runId: string, resumeFromSequence?: number) {
    return this.sendRequest('run/subscribe', {
      run_id: runId,
      resume_from_sequence: resumeFromSequence,
    });
  }

  private handleMessage(raw: any) {
    let payload: any;
    try {
      payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return;
    }

    if (Array.isArray(payload)) {
      payload.forEach((entry) => this.handleMessage(entry));
      return;
    }

    if (payload.id != null && payload.method) {
      this.handleServerRequest(payload);
      return;
    }

    if (payload.id != null) {
      const pending = this.pending.get(payload.id);
      if (!pending) return;
      clearTimeout(pending.timeoutId);
      this.pending.delete(payload.id);
      if (payload.error) {
        pending.reject(new Error(payload.error.message || 'Runtime request failed.'));
      } else {
        pending.resolve(payload.result as any);
      }
      return;
    }

    if (payload.method) {
      runtimeStore.handleEvent(payload as RuntimeEvent);
    }
  }

  private handleServerRequest(payload: any) {
    const event: RuntimeEvent = {
      method: payload.method,
      params: {
        ...(payload.params || {}),
        request_id: payload.params?.request_id ?? String(payload.id),
      },
    };
    runtimeStore.handleEvent(event);

    const response = {
      jsonrpc: '2.0',
      id: payload.id,
      result: { received: true },
    };

    try {
      this.socket?.send(JSON.stringify(response));
    } catch {
      // ignore response failures
    }
  }
}

export const runtimeClient = new RuntimeClient({
  endpoint: '',
  authToken: '',
  autoConnect: false,
});
