import type { TileIndexes } from '@/types/level';

/** Сохраняемое состояние захвата (IndexedDB) */
export interface CapturingTileSaved {
  X: number;
  Y: number;
  targetIndex: TileIndexes;
  elapsedMs: number; // прогресс захвата (для pause/resume)
  duration: number; // общая длительность
}
