import { create } from 'zustand';
import { authApi } from '../services/api';

export type TenantRow = { id: number; name: string; slug: string; role: string };
export type Me = {
  id: number;
  email: string;
  isAdmin: boolean;
  currentTenantId?: number | null;
  currentTenantRole?: string | null;
  tenants?: TenantRow[];
};

type AuthState = {
  token: string | null;
  me: Me | null;
  loading: boolean;
  error: string | null;
  setToken: (t: string | null) => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

export const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  me: null,
  loading: false,
  error: null,
  setToken: (t) => {
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
    set({ token: t });
  },
  refresh: async () => {
    const token = localStorage.getItem('token');
    if (!token) { set({ me: null }); return; }
    set({ loading: true, error: null });
    try {
      const me = await authApi.getMe();
      set({ me, loading: false });
    } catch (e: any) {
      set({ me: null, loading: false, error: e?.message || 'Failed to load user' });
    }
  },
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const r: any = await authApi.login(email, password);
      if (!r?.token) throw new Error('No token');
      get().setToken(r.token);
      await get().refresh();
      set({ loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Login failed' });
      throw e;
    }
  },
  register: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const r: any = await authApi.register(email, password);
      if (r?.token) get().setToken(r.token);
      await get().refresh();
      set({ loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Register failed' });
      throw e;
    }
  },
  logout: () => {
    get().setToken(null);
    set({ me: null });
  }
}));

