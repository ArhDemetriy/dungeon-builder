import { nanoid } from 'nanoid';
import { defineStore } from 'pinia';
import { ref } from 'vue';

import { useLevelStore } from '@/store/levelStore';
import { useSaveStore } from '@/store/saveStore';
import type { Portal } from '@/types/level';

export const usePortalStore = defineStore(
  'portal',
  () => {
    const portals = ref(new Map<string, Portal>());

    return {
      portals,

      createPortalPair(
        from: { levelId: string; position: { x: number; y: number } },
        to: { levelId: string; position: { x: number; y: number } },
        name: string
      ) {
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

        portals.value.set(portalId, portal);

        const levelStore = useLevelStore();
        levelStore.setTile(from.levelId, from.position.x, from.position.y, {
          type: 'portal',
          portalId,
        });
        levelStore.setTile(to.levelId, to.position.x, to.position.y, {
          type: 'portal',
          portalId,
        });

        useSaveStore().markDirty();
        return portalId;
      },

      linkPortals(
        point1: { levelId: string; position: { x: number; y: number } },
        point2: { levelId: string; position: { x: number; y: number } },
        name: string
      ) {
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

        const levelStore = useLevelStore();
        const tile1 = levelStore.getTile(point1.levelId, point1.position.x, point1.position.y);
        const tile2 = levelStore.getTile(point2.levelId, point2.position.x, point2.position.y);

        if (tile1.type === 'unlinkedPortal' && tile2.type === 'unlinkedPortal') {
          portals.value.set(portalId, portal);

          levelStore.setTile(point1.levelId, point1.position.x, point1.position.y, {
            type: 'portal',
            portalId,
          });
          levelStore.setTile(point2.levelId, point2.position.x, point2.position.y, {
            type: 'portal',
            portalId,
          });

          useSaveStore().markDirty();
        }

        return portalId;
      },

      getUnlinkedPortals() {
        const levelStore = useLevelStore();
        const unlinkedPortals: Array<{
          levelId: string;
          position: { x: number; y: number };
        }> = [];

        levelStore.levels.forEach((level, levelId) =>
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
    };
  },
  {
    persist: {
      key: 'portal-store',
    },
  }
);
