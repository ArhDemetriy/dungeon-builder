<script setup lang="ts">
import type { TaskSaved } from '@/store/attentionStore';

defineProps<{ task: TaskSaved }>();
</script>

<template>
  <div class="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
    <div class="min-w-0 flex-1">
      <span class="text-sm text-white">{{ task.type }}</span>
      <span class="ml-2 text-xs text-neutral-500">{{ task.id }}</span>
    </div>
    <div class="flex shrink-0 gap-1">
      <slot name="actions" />
    </div>
  </div>
</template>
