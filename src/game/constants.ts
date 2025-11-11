import type { PrimitiveTile } from '@/types/level';

export const TILE_SIZE = 32;

export const TILE_COLORS = {
  wall: 0x000000,
  floor: 0x8b7355,
  portal: 0x00ffff,
  'unlinked-portal': 0x666666,
} as const;

export const DEFAULT_TILE = { type: 'wall' } satisfies PrimitiveTile;

export const GRID_CONFIG = {
  color: 0x333333,
  alpha: 0.2,
} as const;

export const CAMERA_CONFIG = {
  minZoom: 0.2,
  maxZoom: 3,
  zoomSpeed: 0.2,
  moveSpeed: 0.25,
} as const;

export const MOVEMENT_CONFIG = {
  moveInput: 'wasd' as 'wasd' | 'cursor',
} as const;

export const SAVE_CONFIG = {
  autoSaveInterval: 30000,
} as const;
