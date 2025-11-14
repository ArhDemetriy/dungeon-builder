import { defineStore } from 'pinia';
import { ref } from 'vue';

import { DEFAULT_TILE } from '@/game/constants';
import { useSaveStore } from '@/store/saveStore';
import type { GridTile, Level } from '@/types/level';
import { tileKey } from '@/types/level';

type TAddLevelConfig = Partial<Omit<Level, 'name' | 'createdAt'>> & Required<Pick<Level, 'name'>>;

export const useLevelStore = defineStore(
  'level',
  () => {
    const levels = ref<Level[]>([]);
    const currentLevelIndex = ref<number>(0);

    return {
      levels,
      currentLevelIndex,

      getTile: (levelIndex: number, x: number, y: number) => levels.value[levelIndex]?.tiles.get(tileKey(x, y)),

      setTile(levelIndex: number, x: number, y: number, tile: GridTile) {
        const level = levels.value[levelIndex];
        if (!level) return false;

        const { type: currentType } = level.tiles.get(tileKey(x, y)) ?? DEFAULT_TILE;
        if (currentType === 'empty' && tile.type !== 'empty' && !hasNonEmptyNeighbor(level, x, y)) return false;

        level.tiles.set(tileKey(x, y), tile);
        useSaveStore().markDirty();
        return true;
      },

      addLevelAtEnd({ name, tiles, metadata }: TAddLevelConfig) {
        levels.value.push({
          name,
          tiles: tiles ?? new Map(),
          metadata: metadata ?? {},
          createdAt: Date.now(),
        });
        if (levels.value.length <= 1) currentLevelIndex.value = 0;
        useSaveStore().markDirty();
      },
      addLevelAtStart({ name, tiles, metadata }: TAddLevelConfig) {
        levels.value.unshift({
          name,
          tiles: tiles ?? new Map(),
          metadata: metadata ?? {},
          createdAt: Date.now(),
        });
        if (levels.value.length <= 1) currentLevelIndex.value = 0;
        else currentLevelIndex.value += 1;
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

function hasNonEmptyNeighbor(level: Level, x: number, y: number) {
  const neighbors = [
    level.tiles.get(tileKey(x - 1, y)),
    level.tiles.get(tileKey(x + 1, y)),
    level.tiles.get(tileKey(x, y - 1)),
    level.tiles.get(tileKey(x, y + 1)),
  ];
  return neighbors.some(tile => tile && tile.type !== 'empty');
}
