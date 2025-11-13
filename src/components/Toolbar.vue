<script setup lang="ts">
import clsx from 'clsx';

import { useToolbarStore } from '@/store/toolbarStore';
import { useUIStore } from '@/store/uiStore';

const toolbarStore = useToolbarStore();
const uiStore = useUIStore();
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
        :checked="toolbarStore.activeTile === 'wall'"
        @change="toolbarStore.setActiveTile('wall')"
        class="sr-only"
      />
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
        :checked="toolbarStore.activeTile === 'floor'"
        @change="toolbarStore.setActiveTile('floor')"
        class="sr-only"
      />
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
        :checked="toolbarStore.activeTile === 'unlinkedPortal'"
        @change="toolbarStore.setActiveTile('unlinkedPortal')"
        class="sr-only"
      />
      <div class="h-6 w-6 border border-yellow-500 bg-gray-600" />
      <span class="text-xs text-gray-400">3</span>
    </label>

    <!-- Разделитель -->
    <div class="w-px bg-gray-700" />

    <!-- Toggle сетки -->
    <label
      :class="
        clsx(
          'cursor-pointer rounded border-2 px-4 py-2 transition-all',
          uiStore.showGrid
            ? 'border-blue-400 bg-blue-600 shadow-inner'
            : 'border-transparent bg-gray-800 hover:bg-gray-700'
        )
      "
      title="Toggle Grid (G)"
    >
      <input type="checkbox" :checked="uiStore.showGrid" @change="uiStore.toggleGrid()" class="sr-only" />
      <svg class="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 3v8h8V3H3zm0 10v8h8v-8H3zm10-10v8h8V3h-8zm0 10v8h8v-8h-8z" />
      </svg>
    </label>
  </div>
</template>

