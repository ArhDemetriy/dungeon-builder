<script setup lang="ts">
import clsx from 'clsx';

import { useToolbarStore } from '@/store/toolbarStore';

const toolbarStore = useToolbarStore();
</script>

<template>
  <div
    class="fixed bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-lg border border-gray-700 bg-gray-900 p-2 shadow-lg"
  >
    <!-- Радиокнопка Grass -->
    <label
      :class="
        clsx(
          'flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-4 py-2 transition-colors',
          toolbarStore.activeTile === 'grass0'
            ? 'border-white bg-gray-700'
            : 'border-transparent bg-gray-800 hover:bg-gray-700'
        )
      "
      title="Grass (1)"
    >
      <input
        type="radio"
        name="tile-type"
        value="grass0"
        class="sr-only"
        :checked="toolbarStore.activeTile === 'grass0'"
        @change="toolbarStore.setActiveTile('grass0')"
      >
      <div class="h-6 w-6 border border-gray-600 bg-black" />
      <span class="text-xs text-gray-400">1</span>
    </label>

    <!-- Радиокнопка Grass1 -->
    <label
      :class="
        clsx(
          'flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-4 py-2 transition-colors',
          toolbarStore.activeTile === 'grass1'
            ? 'border-white bg-gray-700'
            : 'border-transparent bg-gray-800 hover:bg-gray-700'
        )
      "
      title="Grass1 (2)"
    >
      <input
        type="radio"
        name="tile-type"
        value="grass1"
        class="sr-only"
        :checked="toolbarStore.activeTile === 'grass1'"
        @change="toolbarStore.setActiveTile('grass1')"
      >
      <div class="h-6 w-6 bg-[#8B7355]" />
      <span class="text-xs text-gray-400">2</span>
    </label>
  </div>
</template>
