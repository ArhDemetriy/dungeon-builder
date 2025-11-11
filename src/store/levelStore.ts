import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { DEFAULT_TILE } from '@/game/constants';
import { useSaveStore } from '@/store/saveStore';
import type { GridTile, Level } from '@/types/level';
import { tileKey } from '@/types/level';

export const useLevelStore = create<{
  levels: Map<string, Level>;
  currentLevelId: string | null;

  createLevel: (name: string) => string;
  setTile: (levelId: string, x: number, y: number, tile: GridTile) => void;
  getTile: (levelId: string, x: number, y: number) => GridTile;
  setCurrentLevel: (id: string) => void;
}>()(
  devtools(
    persist(
      (set, get) => ({
        levels: new Map(),
        currentLevelId: null,

        createLevel: name => {
          const id = nanoid();
          set(state => ({
            levels: new Map(state.levels).set(id, {
              id,
              name,
              tiles: new Map(),
              metadata: {},
              createdAt: Date.now(),
            }),
            currentLevelId: state.currentLevelId ?? id,
          }));
          useSaveStore.getState().markDirty();
          return id;
        },

        setTile: (levelId, x, y, tile) => {
          if (!get().levels.has(levelId)) return;
          set(state => {
            const levels = new Map(state.levels);
            const level = levels.get(levelId);
            if (!level) return state;
            level.tiles.set(tileKey(x, y), tile);
            return { levels };
          });
          useSaveStore.getState().markDirty();
        },
        getTile: (levelId, x, y) => get().levels.get(levelId)?.tiles.get(tileKey(x, y)) ?? DEFAULT_TILE,

        setCurrentLevel: id => set({ currentLevelId: id }),
      }),
      {
        name: 'level-store',
        storage: createJSONStorage(() => localStorage, {
          replacer: (_key, value) => {
            // Сериализуем Map в массивы для JSON
            if (value instanceof Map) {
              return {
                __type: 'Map',
                value: Array.from(value.entries()),
              };
            }
            return value;
          },
          reviver: (_key, value) => {
            // Восстанавливаем Map из массивов
            if (
              typeof value === 'object' &&
              value !== null &&
              '__type' in value &&
              value.__type === 'Map' &&
              'value' in value
            ) {
              return new Map(value.value as [unknown, unknown][]);
            }
            return value;
          },
        }),
      }
    ),
    { name: 'LevelStore' }
  )
);
