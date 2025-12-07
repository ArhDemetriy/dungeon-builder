<script setup lang="ts">
import AttentionDisplay from '@/components/AttentionDisplay.vue';
import TaskMenu from '@/components/TaskMenu.vue';
import ToastManager from '@/components/ToastManager.vue';
import Toolbar from '@/components/Toolbar.vue';
</script>

<template>
  <div class="relative h-full w-full">
    <TaskMenu />
    <Toolbar />
    <AttentionDisplay />
    <ToastManager />
  </div>
</template>
