import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSaveStore = defineStore('save', () => {
  // State
  const isDirty = ref(false);

  // Actions
  function markDirty() {
    if (!isDirty.value) {
      isDirty.value = true;
    }
  }

  function clearDirty() {
    isDirty.value = false;
  }

  return {
    isDirty,
    markDirty,
    clearDirty,
  };
});
