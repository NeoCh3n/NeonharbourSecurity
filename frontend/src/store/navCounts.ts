import { create } from 'zustand';

type Counts = {
  approvalsPending: number;
  casesOpen: number;
  triageTotal: number;
  triageUnassigned: number;
  triageAssignedToMe: number;
};

type NavCountsState = Counts & {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startAutoRefresh: () => void;
};

async function fetchCounts(): Promise<Counts> {
  const base = (import.meta as any).env.VITE_API_BASE_URL || '/api';
  let token: string | null = null;
  try { token = await ((window as any).Clerk?.session?.getToken?.()); } catch {}
  if (!token) token = localStorage.getItem('token');
  const r = await fetch(`${base}/nav/counts`, { headers: token ? { Authorization: `Bearer ${token}` } as any : {} });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export const useNavCounts = create<NavCountsState>((set, get) => ({
  approvalsPending: 0,
  casesOpen: 0,
  triageTotal: 0,
  triageUnassigned: 0,
  triageAssignedToMe: 0,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const d = await fetchCounts();
      set({ ...d, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Failed to load counts' });
    }
  },
  startAutoRefresh: () => {
    if ((window as any).__navCountsTimer) return;
    (window as any).__navCountsTimer = setInterval(() => {
      const hasSession = !!((window as any).Clerk?.session);
      if (!hasSession) return; // skip when logged out
      get().refresh().catch(()=>{});
    }, 30000);
  }
}));
