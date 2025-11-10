import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { useSaveStore } from '@/store/saveStore';
import type { GridTile, Level, Portal } from '@/types/level';
import { tileKey } from '@/types/level';

export const useLevelStore = create<{
  levels: Map<string, Level>;
  portals: Map<string, Portal>;
  currentLevelId: string | null;

  createLevel: (name: string) => string;
  setTile: (levelId: string, x: number, y: number, tile: GridTile) => void;
  getTile: (levelId: string, x: number, y: number) => GridTile;
  setCurrentLevel: (id: string) => void;

  createPortalPair: (
    from: { levelId: string; position: { x: number; y: number } },
    to: { levelId: string; position: { x: number; y: number } },
    name: string
  ) => string;

  linkPortals: (
    point1: { levelId: string; position: { x: number; y: number } },
    point2: { levelId: string; position: { x: number; y: number } },
    name: string
  ) => string;

  getUnlinkedPortals: () => Array<{
    levelId: string;
    position: { x: number; y: number };
  }>;
}>()(
  devtools(
    persist(
      (set, get) => ({
        levels: new Map(),
        portals: new Map(),
        currentLevelId: null,

        createLevel: name => {
          const id = nanoid();
          const level: Level = {
            id,
            name,
            tiles: new Map(),
            metadata: {},
            createdAt: Date.now(),
          };
          set(state => ({
            levels: new Map(state.levels).set(id, level),
            currentLevelId: state.currentLevelId ?? id,
          }));
          useSaveStore.getState().markDirty();
          return id;
        },

        setTile: (levelId, x, y, tile) => {
          set(state => {
            const levels = new Map(state.levels);
            const level = levels.get(levelId);
            if (!level) return state;

            level.tiles.set(tileKey(x, y), tile);
            return { levels };
          });
          useSaveStore.getState().markDirty();
        },

        getTile: (levelId, x, y) => {
          const level = get().levels.get(levelId);
          return level?.tiles.get(tileKey(x, y)) ?? { type: 'wall' };
        },

        setCurrentLevel: id => set({ currentLevelId: id }),

        createPortalPair: (from, to, name) => {
          const portalId = nanoid();
          const portal: Portal = {
            id: portalId,
            name,
            endpoints: {
              A: { levelId: from.levelId, position: from.position },
              B: { levelId: to.levelId, position: to.position },
            },
            createdAt: Date.now(),
          };

          set(state => {
            const portals = new Map(state.portals).set(portalId, portal);
            const levels = new Map(state.levels);

            const fromLevel = levels.get(from.levelId);
            const toLevel = levels.get(to.levelId);

            if (fromLevel && toLevel) {
              fromLevel.tiles.set(tileKey(from.position.x, from.position.y), {
                type: 'portal',
                portalId,
              });
              toLevel.tiles.set(tileKey(to.position.x, to.position.y), {
                type: 'portal',
                portalId,
              });
            }

            return { portals, levels };
          });
          useSaveStore.getState().markDirty();
          return portalId;
        },

        linkPortals: (point1, point2, name) => {
          const portalId = nanoid();
          const portal: Portal = {
            id: portalId,
            name,
            endpoints: {
              A: { levelId: point1.levelId, position: point1.position },
              B: { levelId: point2.levelId, position: point2.position },
            },
            createdAt: Date.now(),
          };

          set(state => {
            const portals = new Map(state.portals).set(portalId, portal);
            const levels = new Map(state.levels);

            const level1 = levels.get(point1.levelId);
            const level2 = levels.get(point2.levelId);

            if (level1 && level2) {
              // Проверяем что оба тайла - несвязанные порталы
              const tile1 = level1.tiles.get(tileKey(point1.position.x, point1.position.y));
              const tile2 = level2.tiles.get(tileKey(point2.position.x, point2.position.y));

              if (tile1?.type === 'unlinked-portal' && tile2?.type === 'unlinked-portal') {
                // Заменяем на связанные порталы
                level1.tiles.set(tileKey(point1.position.x, point1.position.y), {
                  type: 'portal',
                  portalId,
                });
                level2.tiles.set(tileKey(point2.position.x, point2.position.y), {
                  type: 'portal',
                  portalId,
                });
              }
            }

            return { portals, levels };
          });
          useSaveStore.getState().markDirty();
          return portalId;
        },

        getUnlinkedPortals: () => {
          const { levels } = get();
          const unlinkedPortals: Array<{
            levelId: string;
            position: { x: number; y: number };
          }> = [];

          levels.forEach((level, levelId) =>
            level.tiles.forEach((tile, key) => {
              if (tile.type !== 'unlinked-portal') return;
              const { 0: x, 1: y } = key.split(',').map(Number);
              unlinkedPortals.push({
                levelId,
                position: { x, y },
              });
            })
          );

          return unlinkedPortals;
        },
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
