import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUIStore = defineStore(
  'ui',
  () => {
    // State
    const showGrid = ref(false);

    // Actions
    function toggleGrid() {
      showGrid.value = !showGrid.value;
    }

    return {
      showGrid,
      toggleGrid,
    };
  },
  {
    persist: true, // Автоматический persist через плагин
  }
);
