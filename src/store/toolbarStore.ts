import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { PrimitiveTile } from '@/types/level';

export const useToolbarStore = defineStore('toolbar', () => {
  const activeTile = ref<PrimitiveTile['type']>('grass0');

  return {
    activeTile,
    setActiveTile: (type: PrimitiveTile['type']) => (activeTile.value = type),
  };
});
