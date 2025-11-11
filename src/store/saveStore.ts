import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface SaveStore {
  isDirty: boolean;
  markDirty: () => void;
  clearDirty: () => void;
}

export const useSaveStore = create<SaveStore>()(
  devtools(
    (set, get) => ({
      isDirty: false,
      markDirty: () => !get().isDirty && set({ isDirty: true }),
      clearDirty: () => set({ isDirty: false }),
    }),
    { name: 'SaveStore' }
  )
);
