import type { TILE_INDEX, TILE_KEYS } from '@/game/constants';

export type TileIndexes = keyof typeof TILE_KEYS;
export type TileKeys = keyof typeof TILE_INDEX;

export interface Level {
  name: string;
  metadata: {
    description?: string;
    depth?: number;
    color?: number;
  };
  createdAt: number;
}
