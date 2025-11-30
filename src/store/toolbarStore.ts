import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { TileKeys } from '@/types/level';

export const useToolbarStore = defineStore('toolbar', () => {
  const activeTile = ref<TileKeys>('grass0');

  return {
    activeTile,
    setActiveTile: (type: TileKeys) => (activeTile.value = type),
  };
});
