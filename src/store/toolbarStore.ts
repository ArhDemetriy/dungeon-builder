import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { PrimitiveTile } from '@/types/level';

export const useToolbarStore = defineStore('toolbar', () => {
  // State
  const activeTile = ref<PrimitiveTile['type']>('wall');

  // Actions
  function setActiveTile(type: PrimitiveTile['type']) {
    activeTile.value = type;
  }

  return {
    activeTile,
    setActiveTile,
  };
});
