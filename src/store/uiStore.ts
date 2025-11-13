import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUIStore = defineStore(
  'ui',
  () => {
    const showGrid = ref(false);

    return {
      showGrid,
      toggleGrid: () => (showGrid.value = !showGrid.value),
    };
  },
  {
    persist: true,
  }
);
