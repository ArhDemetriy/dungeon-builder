import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';

import { getSaveWorker } from '@/workers/saveWorkerProxy';

export const useAttentionStore = defineStore('attention', () => {
  const attentionLimit = shallowRef(0);
  const usedAttention = shallowRef(0);

  const freeAttention = computed(() => attentionLimit.value - usedAttention.value);

  const loadAttentionLimit = async () => {
    attentionLimit.value = await getSaveWorker().getAttentionLimit();
  };

  return {
    attentionLimit,
    usedAttention,
    freeAttention,
    loadAttentionLimit,
  };
});

