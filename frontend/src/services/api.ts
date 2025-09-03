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

export default apiRequest;
