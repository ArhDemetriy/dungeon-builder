import type { PrimitiveTile } from '@/types/level';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export const useToolbarStore = create<{
  activeTile: PrimitiveTile['type'];
  setActiveTile: (type: PrimitiveTile['type']) => void;
}>()(
  devtools(
    set => ({
      activeTile: 'wall',
      setActiveTile: activeTile => set({ activeTile }),
    }),
    { name: 'ToolbarStore' }
  )
);
