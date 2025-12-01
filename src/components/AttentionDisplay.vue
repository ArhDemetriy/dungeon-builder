<script setup lang="ts">
import { useAttentionStore } from '@/store/attentionStore';
import { onMounted } from 'vue';

const attentionStore = useAttentionStore();

onMounted(() => {
  void attentionStore.loadAttentionLimit();
});
</script>

<template>
  <div
    class="fixed right-4 top-4 rounded-lg border border-white/10 bg-neutral-900/95 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-sm"
  >
    Свободно внимания: {{ attentionStore.freeAttention }} / {{ attentionStore.attentionLimit }}
  </div>
</template>

