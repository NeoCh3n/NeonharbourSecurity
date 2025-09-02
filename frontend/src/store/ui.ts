import { create } from 'zustand';

type Density = 'compact' | 'normal' | 'cozy';

interface UIState {
  navExpanded: boolean;
  toggleNav: () => void;
  rightPanelOpen: boolean;
  setRightPanelOpen: (v: boolean) => void;
  tableDensity: Density;
  setTableDensity: (d: Density) => void;
}

export const useUI = create<UIState>((set) => ({
  navExpanded: true,
  toggleNav: () => set((s) => ({ navExpanded: !s.navExpanded })),
  rightPanelOpen: false,
  setRightPanelOpen: (v) => set({ rightPanelOpen: v }),
  tableDensity: (localStorage.getItem('tableDensity') as Density) || 'normal',
  setTableDensity: (d) => {
    localStorage.setItem('tableDensity', d);
    set({ tableDensity: d });
  }
}));

