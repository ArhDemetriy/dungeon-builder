import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export const useUIStore = create<{
  showGrid: boolean;
  toggleGrid: () => void;
}>()(
  devtools(
    persist(
      set => ({
        showGrid: false,
        toggleGrid: () => set(state => ({ showGrid: !state.showGrid })),
      }),
      { name: 'ui-store' }
    ),
    { name: 'UIStore' }
  )
);
