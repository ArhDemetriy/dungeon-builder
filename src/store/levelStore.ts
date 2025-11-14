import { defineStore } from 'pinia';
import { ref } from 'vue';

import { useSaveStore } from '@/store/saveStore';
import type { GridTile, Level } from '@/types/level';
import { tileKey } from '@/types/level';

export const useLevelStore = defineStore(
  'level',
  () => {
    const levels = ref<Level[]>([
      {
        name: 'Уровень 1',
        tiles: new Map(),
        metadata: {},
        createdAt: Date.now(),
      },
    ]);
    const currentLevelIndex = ref<number>(0);

    return {
      levels,
      currentLevelIndex,

      getTile: (levelIndex: number, x: number, y: number) => levels.value[levelIndex]?.tiles.get(tileKey(x, y)),

      setTile(levelIndex: number, x: number, y: number, tile: GridTile) {
        const level = levels.value[levelIndex];
        if (!level) return false;
        level.tiles.set(tileKey(x, y), tile);
        useSaveStore().markDirty();
        return true;
      },

      addLevelAtEnd(name: string) {
        levels.value.push({
          name,
          tiles: new Map(),
          metadata: {},
          createdAt: Date.now(),
        });
        useSaveStore().markDirty();
      },

      addLevelAtStart(name: string) {
        levels.value.unshift({
          name,
          tiles: new Map(),
          metadata: {},
          createdAt: Date.now(),
        });
        currentLevelIndex.value += 1;
        useSaveStore().markDirty();
      },

      setCurrentLevel: (index: number) => (currentLevelIndex.value = index),
    };
  },
  {
    persist: {
      key: 'level-store',
    },
  }
);
