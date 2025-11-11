import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface SaveStore {
  isDirty: boolean;
  markDirty: () => void;
  clearDirty: () => void;
}

export const useSaveStore = create<SaveStore>()(
  devtools(
    (set) => ({
      isDirty: false,
      markDirty: () => set({ isDirty: true }),
      clearDirty: () => set({ isDirty: false }),
    }),
    { name: 'SaveStore' }
  )
);
