<script setup lang="ts">
import AttentionDisplay from '@/components/AttentionDisplay.vue';
import ToastManager from '@/components/ToastManager.vue';
import Toolbar from '@/components/Toolbar.vue';
</script>

<template>
  <div class="relative h-full w-full">
    <Toolbar />
    <AttentionDisplay />
    <ToastManager />
  </div>
</template>
