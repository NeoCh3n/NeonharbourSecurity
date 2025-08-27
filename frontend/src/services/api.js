const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    
    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // Unable to parse error response
      }
      throw new ApiError(errorMessage, response.status);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Network error', 0);
  }
}

export const authApi = {
  register: (email, password) => 
    apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email, password) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => apiRequest('/auth/me'),
};

export const alertsApi = {
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest('/alerts/upload', {
      method: 'POST',
      headers: {},
      body: formData,
    });
  },

  list: () => apiRequest('/alerts'),

  get: (id) => apiRequest(`/alerts/${id}`),

  feedback: (id, feedback) =>
    apiRequest(`/alerts/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    }),
};

export const hunterApi = {
  query: (question, logs = []) =>
    apiRequest('/hunter/query', {
      method: 'POST',
      body: JSON.stringify({ question, logs }),
    }),
};

export const metricsApi = {
  get: () => apiRequest('/metrics'),
};

export default apiRequest;