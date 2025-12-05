<script setup lang="ts">
import { useAttentionStore } from '@/store/attentionStore';
import { computed, onMounted } from 'vue';

const attentionStore = useAttentionStore();
const freeAttentionPercent = computed(() =>
  Math.round(attentionStore.freeAttention * 100)
);

onMounted(() => {
  void attentionStore.loadFromWorker();
});
</script>

<template>
  <div
    class="fixed right-4 top-4 rounded-lg border border-white/10 bg-neutral-900/95 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-sm"
  >
    Свободно внимания: {{ freeAttentionPercent }} %
  </div>
</template>

