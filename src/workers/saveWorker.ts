import { expose } from 'comlink';

import { DEFAULT_TILE, TILE_INDEX } from '@/game/constants';
import type { GridTile } from '@/types/level';

export type SaveWorkerApi = typeof api;

// Внутреннее хранилище воркера
const levels = new Map<number, Map<string, GridTile>>();
let currentLevelIndex = 0;

const tileKey = (x: number, y: number) => `${x},${y}` as const;

// const _parseTileKey = (key: ReturnType<typeof tileKey>) => {
//   const [x, y] = key.split(',').map(Number);
//   return { x, y };
// };

const api = {
  // Получить данные для тайл-слоя (аналог buildTileLayerData)
  async getTileLayerData({
    levelIndex = currentLevelIndex,
    widthTiles,
    heightTiles,
    offsetTilesX,
    offsetTilesY,
  }: {
    levelIndex?: number;
    widthTiles: number;
    heightTiles: number;
    offsetTilesX: number;
    offsetTilesY: number;
  }) {
    const levelTiles = levels.get(levelIndex);
    if (!levelTiles) return [];
    return Array.from({ length: heightTiles }, (_, y) =>
      Array.from(
        { length: widthTiles },
        (_, x) => TILE_INDEX[(levelTiles.get(tileKey(x + offsetTilesX, y + offsetTilesY)) ?? DEFAULT_TILE).type]
      )
    );
  },

  // Установить тайл
  async getTile({ levelIndex = currentLevelIndex, x, y }: { levelIndex?: number; x: number; y: number }) {
    return levels.get(levelIndex)?.get(tileKey(x, y));
  },
  // Установить тайл
  async setTile({
    levelIndex = currentLevelIndex,
    x,
    y,
    tile,
  }: {
    levelIndex?: number;
    x: number;
    y: number;
    tile: GridTile;
  }) {
    if (!levels.has(levelIndex)) levels.set(levelIndex, new Map());
    levels.get(levelIndex)!.set(tileKey(x, y), tile);
    return true;
  },
  // Установить несколько тайлов
  async setTiles({
    levelIndex = currentLevelIndex,
    tiles,
  }: {
    levelIndex?: number;
    tiles: Array<{ x: number; y: number; tile: GridTile }>;
  }) {
    if (!levels.has(levelIndex)) levels.set(levelIndex, new Map());
    const levelMap = levels.get(levelIndex)!;

    tiles.forEach(({ x, y, tile }) => levelMap.set(tileKey(x, y), tile));
  },

  // Получить индекс активного уровня
  async getCurrentLevelIndex() {
    return currentLevelIndex;
  },
  // Установить активный уровень
  async setCurrentLevelIndex(levelIndex: number) {
    currentLevelIndex = levelIndex;
  },

  async getTilesCountInLevel({ levelIndex = currentLevelIndex }: { levelIndex?: number } = {}) {
    return levels.get(levelIndex)?.size ?? 0;
  },

  // Загрузить данные из localStorage
  async loadFromStorage() {
    // TODO: Реализовать загрузку
  },

  // Сохранить в localStorage
  async saveToStorage() {
    // TODO: Реализовать сохранение
  },
};

expose(api);
