<script setup lang="ts">
import clsx from 'clsx';

import { useToolbarStore } from '@/store/toolbarStore';

const toolbarStore = useToolbarStore();
</script>

<template>
  <div
    class="fixed bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-lg border border-gray-700 bg-gray-900 p-2 shadow-lg"
  >
    <!-- Радиокнопка Wall -->
    <label
      :class="
        clsx(
          'flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-4 py-2 transition-colors',
          toolbarStore.activeTile === 'wall'
            ? 'border-white bg-gray-700'
            : 'border-transparent bg-gray-800 hover:bg-gray-700'
        )
      "
      title="Wall (1)"
    >
      <input
        type="radio"
        name="tile-type"
        value="wall"
        class="sr-only"
        :checked="toolbarStore.activeTile === 'wall'"
        @change="toolbarStore.setActiveTile('wall')"
      >
      <div class="h-6 w-6 border border-gray-600 bg-black" />
      <span class="text-xs text-gray-400">1</span>
    </label>

    <!-- Радиокнопка Floor -->
    <label
      :class="
        clsx(
          'flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-4 py-2 transition-colors',
          toolbarStore.activeTile === 'floor'
            ? 'border-white bg-gray-700'
            : 'border-transparent bg-gray-800 hover:bg-gray-700'
        )
      "
      title="Floor (2)"
    >
      <input
        type="radio"
        name="tile-type"
        value="floor"
        class="sr-only"
        :checked="toolbarStore.activeTile === 'floor'"
        @change="toolbarStore.setActiveTile('floor')"
      >
      <div class="h-6 w-6 bg-[#8B7355]" />
      <span class="text-xs text-gray-400">2</span>
    </label>

    <!-- Радиокнопка Portal -->
    <label
      :class="
        clsx(
          'flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-4 py-2 transition-colors',
          toolbarStore.activeTile === 'unlinkedPortal'
            ? 'border-white bg-gray-700'
            : 'border-transparent bg-gray-800 hover:bg-gray-700'
        )
      "
      title="Portal (3)"
    >
      <input
        type="radio"
        name="tile-type"
        value="unlinked-portal"
        class="sr-only"
        :checked="toolbarStore.activeTile === 'unlinkedPortal'"
        @change="toolbarStore.setActiveTile('unlinkedPortal')"
      >
      <div class="h-6 w-6 border border-yellow-500 bg-gray-600" />
      <span class="text-xs text-gray-400">3</span>
    </label>
  </div>
</template>
