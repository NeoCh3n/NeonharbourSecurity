const API_BASE: string = (import.meta as any).env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = localStorage.getItem('token');
  const isFormData = options && typeof (options as any).body !== 'undefined' && (options as any).body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((options as any).headers || {}),
  } as Record<string, string>;

  if (token) {
    (headers as any).Authorization = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = (errorData as any).error || errorMessage;
      } catch {
        // ignore
      }
      if (response.status === 401) {
        try { localStorage.removeItem('token'); } catch {}
      }
      throw new ApiError(errorMessage, response.status);
    }
    return await response.json();
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Network error', 0);
  }
}

export const authApi = {
  register: (email: string, password: string) =>
    apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => apiRequest('/auth/me'),
};

export const alertsApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest('/alerts/upload', {
      method: 'POST',
      headers: {} as any,
      body: formData,
    });
  },

  list: () => apiRequest('/alerts'),
  queue: (params: { assigned?: 'me'|'unassigned'; status?: string; severity?: string; limit?: number; offset?: number; disposition?: string; escalated?: boolean; handled?: boolean; active?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.assigned) qs.set('assigned', params.assigned);
    if (params.status) qs.set('status', params.status);
    if (params.severity) qs.set('severity', params.severity);
    if (params.disposition) qs.set('disposition', params.disposition);
    if (params.escalated != null) qs.set('escalated', String(params.escalated));
    if (params.handled != null) qs.set('handled', String(params.handled));
    if (params.active != null) qs.set('active', String(params.active));
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest(`/alerts/queue${suffix}`);
  },

  get: (id: number) => apiRequest(`/alerts/${id}`),

  feedback: (id: number, feedback: string) =>
    apiRequest(`/alerts/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    }),
};

export const hunterApi = {
  query: (question: string, logs: string[] = []) =>
    apiRequest('/hunter/query', {
      method: 'POST',
      body: JSON.stringify({ question, logs }),
    }),
};

export const metricsApi = {
  get: () => apiRequest('/metrics'),
};

export const planApi = {
  get: (id: number) => apiRequest(`/alerts/${id}/plan`),
  update: (id: number, payload: any) => apiRequest(`/alerts/${id}/plan`, { method: 'POST', body: JSON.stringify(payload) })
};

export const actionsApi = {
  request: (id: number, action: string, reason: string) => apiRequest(`/actions/${id}/request`, { method: 'POST', body: JSON.stringify({ action, reason }) })
};

export const approvalsApi = {
  list: () => apiRequest('/approvals'),
  approve: (id: number) => apiRequest(`/approvals/${id}/approve`, { method: 'POST' }),
  deny: (id: number, reason: string) => apiRequest(`/approvals/${id}/deny`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

export type PolicyItem = {
  id?: number;
  name: string;
  description?: string;
  effect: 'allow' | 'deny' | 'require_approval';
  action_pattern: string;
  resource_pattern?: string;
  conditions?: any;
  risk?: string;
};
export const policiesApi = {
  list: (): Promise<{ policies: PolicyItem[] }> => apiRequest('/policies'),
  create: (p: PolicyItem) => apiRequest('/policies', { method: 'POST', body: JSON.stringify(p) }),
  update: (id: number, p: Partial<PolicyItem>) => apiRequest(`/policies/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  remove: (id: number) => apiRequest(`/policies/${id}`, { method: 'DELETE' }),
  resetDefaults: () => apiRequest('/policies/reset-defaults', { method: 'POST' }),
};

export type IntegrationItem = { provider: string; enabled: boolean; settings?: any };
export const integrationsApi = {
  get: (): Promise<{ integrations: IntegrationItem[] }> => apiRequest('/integrations'),
  save: (integrations: IntegrationItem[]) => apiRequest('/integrations', { method: 'POST', body: JSON.stringify({ integrations }) })
};

export const casesApi = {
  get: (id: number) => apiRequest(`/cases/${id}`),
  getPlan: (id: number) => apiRequest(`/cases/${id}/plan`),
  updatePlan: (id: number, plan: any) => apiRequest(`/cases/${id}/plan`, { method: 'POST', body: JSON.stringify({ plan }) }),
  listMemory: (id: number) => apiRequest(`/cases/${id}/memory`),
  addMemory: (id: number, payload: any) => apiRequest(`/cases/${id}/memory`, { method: 'POST', body: JSON.stringify(payload) }),
  listSessions: (id: number) => apiRequest(`/cases/${id}/sessions`),
  createSession: (id: number, payload: any) => apiRequest(`/cases/${id}/sessions`, { method: 'POST', body: JSON.stringify(payload) }),
  summarize: (id: number) => apiRequest(`/cases/${id}/summarize`, { method: 'POST' }),
};

export default apiRequest;
