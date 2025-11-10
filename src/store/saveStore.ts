import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export const useSaveStore = create<{
  isDirty: boolean;
  markDirty(): void;
  clearDirty(): void;
}>()(
  devtools(
    set => ({
      isDirty: false,
      markDirty() {
        if (!this.isDirty) set({ isDirty: true });
      },
      clearDirty() {
        if (this.isDirty) set({ isDirty: false });
      },
    }),
    { name: 'SaveStore' }
  )
);
