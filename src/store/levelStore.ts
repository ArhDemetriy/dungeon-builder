import { nanoid } from 'nanoid';
import { defineStore } from 'pinia';
import { ref } from 'vue';

import { DEFAULT_TILE } from '@/game/constants';
import { useSaveStore } from '@/store/saveStore';
import type { GridTile, Level } from '@/types/level';
import { tileKey } from '@/types/level';

export const useLevelStore = defineStore(
  'level',
  () => {
    // State
    const levels = ref(new Map<string, Level>());
    const currentLevelId = ref<string | null>(null);

    // Actions
    function createLevel(name: string) {
      const id = nanoid();
      levels.value.set(id, {
        id,
        name,
        tiles: new Map(),
        metadata: {},
        createdAt: Date.now(),
      });

      if (!currentLevelId.value) {
        currentLevelId.value = id;
      }

      useSaveStore().markDirty();
      return id;
    }

    function setTile(levelId: string, x: number, y: number, tile: GridTile) {
      const level = levels.value.get(levelId);
      if (!level) return;

      // Прямая мутация Map - работает реактивно в Pinia!
      level.tiles.set(tileKey(x, y), tile);
      useSaveStore().markDirty();
    }

    function getTile(levelId: string, x: number, y: number): GridTile {
      return levels.value.get(levelId)?.tiles.get(tileKey(x, y)) ?? DEFAULT_TILE;
    }

    function setCurrentLevel(id: string) {
      currentLevelId.value = id;
    }

    return {
      levels,
      currentLevelId,
      createLevel,
      setTile,
      getTile,
      setCurrentLevel,
    };
  },
  {
    persist: {
      key: 'level-store',
      // Сериализация Map уже настроена в глобальном persist плагине
    },
  }
);
