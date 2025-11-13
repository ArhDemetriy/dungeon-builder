import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSaveStore = defineStore('save', () => {
  const isDirty = ref(false);

  return {
    isDirty,

    markDirty() {
      if (!isDirty.value) {
        isDirty.value = true;
      }
    },

    clearDirty: () => (isDirty.value = false),
  };
});
