import { create } from 'zustand';
import apiRequest from '../services/api';

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
  return apiRequest('/nav/counts');
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
