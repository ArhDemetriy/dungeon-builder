import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { useLevelStore } from '@/store/levelStore';
import { useSaveStore } from '@/store/saveStore';
import type { Portal } from '@/types/level';

export const usePortalStore = create<{
  portals: Map<string, Portal>;

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
      (set, _get) => ({
        portals: new Map(),

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

          set(state => ({
            portals: new Map(state.portals).set(portalId, portal),
          }));

          // Обновляем тайлы в уровнях
          const { setTile } = useLevelStore.getState();
          setTile(from.levelId, from.position.x, from.position.y, {
            type: 'portal',
            portalId,
          });
          setTile(to.levelId, to.position.x, to.position.y, {
            type: 'portal',
            portalId,
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

          // Проверяем что оба тайла - несвязанные порталы
          const { getTile, setTile } = useLevelStore.getState();
          const tile1 = getTile(point1.levelId, point1.position.x, point1.position.y);
          const tile2 = getTile(point2.levelId, point2.position.x, point2.position.y);

          if (tile1.type === 'unlinkedPortal' && tile2.type === 'unlinkedPortal') {
            set(state => ({
              portals: new Map(state.portals).set(portalId, portal),
            }));

            // Заменяем на связанные порталы
            setTile(point1.levelId, point1.position.x, point1.position.y, {
              type: 'portal',
              portalId,
            });
            setTile(point2.levelId, point2.position.x, point2.position.y, {
              type: 'portal',
              portalId,
            });

            useSaveStore.getState().markDirty();
          }

          return portalId;
        },

        getUnlinkedPortals: () => {
          const { levels } = useLevelStore.getState();
          const unlinkedPortals: Array<{
            levelId: string;
            position: { x: number; y: number };
          }> = [];

          levels.forEach((level, levelId) =>
            level.tiles.forEach((tile, key) => {
              if (tile.type !== 'unlinkedPortal') return;
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
        name: 'portal-store',
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
    { name: 'PortalStore' }
  )
);
