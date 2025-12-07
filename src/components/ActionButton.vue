<script setup lang="ts">
import { Pause, X, Play } from 'lucide-vue-next';

defineProps<{ icon: 'pause' | 'cancel' | 'resume' }>();
defineEmits<{ click: [] }>();

const icons = {
  pause: Pause,
  cancel: X,
  resume: Play,
};
</script>

<template>
  <button
    type="button"
    class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
    @click="$emit('click')"
  >
    <component
      :is="icons[icon]"
      class="size-4"
    />
  </button>
</template>
