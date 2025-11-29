import { expose } from 'comlink';
import { type DBSchema, openDB } from 'idb';
import { throttle } from 'lodash-es';

import { SAVE_CONFIG, type TileIndexes } from '@/game/constants';

export type SaveWorkerApi = typeof api;

// Схема базы данных IndexedDB
interface DungeonDB extends DBSchema {
  levels: {
    key: number;
    value: { tiles: Array<{ key: ReturnType<typeof tileKey>; index: TileIndexes }> };
  };
  meta: {
    key: 'state';
    value: { currentLevelIndex: number };
  };
}

// Внутреннее хранилище воркера
let currentLevelIndex = 0;
const levels = new Map<number, Map<ReturnType<typeof tileKey>, TileIndexes>>();
const dirtyLevels = new Set<number>();

// Автоинициализация при загрузке модуля
const dungeonDB = (async () => {
  const db = await openDB<DungeonDB>('dungeon-builder', 1, {
    upgrade(database) {
      database.createObjectStore('levels');
      database.createObjectStore('meta');
    },
  });

  currentLevelIndex = (await db.get('meta', 'state'))?.currentLevelIndex ?? 0;
  const data = await db.get('levels', currentLevelIndex);
  if (data) levels.set(currentLevelIndex, new Map(data.tiles.map(({ key, index }) => [key, index])));
  else levels.set(currentLevelIndex, new Map());

  return db;
})();

// Загрузка конкретного уровня из IndexedDB
const loadLevelFromDB = async (levelIndex: number) =>
  dungeonDB
    .then(db => db.get('levels', levelIndex))
    .then(level => {
      levels.set(levelIndex, new Map(level?.tiles.map(({ key, index }) => [key, index])));
    });
async function getLevel(levelIndex: number) {
  if (!levels.has(levelIndex)) await loadLevelFromDB(levelIndex);
  const level = levels.get(levelIndex);
  if (!level) throw new Error('unknown load level error');
  return level;
}

const tileKey = (x: number, y: number) => `${x},${y}` as const;

// Сохранение грязных уровней в IndexedDB
async function persistDirtyLevels() {
  if (!dirtyLevels.size) return;
  const db = await dungeonDB;
  if (!dirtyLevels.size) return;

  const data = Array.from(dirtyLevels, levelIndex => ({
    levelIndex,
    tiles: Array.from(levels.get(levelIndex)?.entries() ?? []).map(([key, index]) => ({ key, index })),
  }));
  dirtyLevels.clear();

  const tx = db.transaction('levels', 'readwrite');
  for (const { tiles, levelIndex } of data) {
    if (tiles.length) tx.objectStore('levels').put({ tiles }, levelIndex);
    else tx.objectStore('levels').delete(levelIndex);
  }
  await tx.done;
}
const throttledSave = throttle(persistDirtyLevels, SAVE_CONFIG.autoSaveInterval, {
  leading: false,
  trailing: true,
});

function markDirty(levelIndex: number) {
  dirtyLevels.add(levelIndex);
  throttledSave();
}

// Сохранение currentLevelIndex в IndexedDB
async function persistCurrentLevelIndex() {
  const db = await dungeonDB;
  await db.put('meta', { currentLevelIndex }, 'state');
}
const throttledSaveCurrentLevelIndex = throttle(persistCurrentLevelIndex, SAVE_CONFIG.autoSaveInterval, {
  leading: false,
  trailing: true,
});

const api = {
  async waitForReady() {
    await dungeonDB;
  },

  // Принудительное сохранение
  async flush() {
    throttledSave.cancel();
    throttledSaveCurrentLevelIndex.cancel();
    await Promise.all([persistDirtyLevels(), persistCurrentLevelIndex()]);
  },

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
    await dungeonDB;
    const levelMap = await getLevel(levelIndex);
    return Array.from({ length: heightTiles }, (_, y) =>
      Array.from({ length: widthTiles }, (_, x) => levelMap.get(tileKey(x + offsetTilesX, y + offsetTilesY)) ?? -1)
    );
  },

  // Получить тайл
  async getTile({ levelIndex = currentLevelIndex, x, y }: { levelIndex?: number; x: number; y: number }) {
    await dungeonDB;
    const levelMap = await getLevel(levelIndex);
    return levelMap.get(tileKey(x, y));
  },

  // Установить тайл
  async setTile({
    levelIndex = currentLevelIndex,
    x,
    y,
    index,
  }: {
    levelIndex?: number;
    x: number;
    y: number;
    index: TileIndexes;
  }) {
    await dungeonDB;
    const levelMap = await getLevel(levelIndex);
    levelMap.set(tileKey(x, y), index);
    markDirty(levelIndex);
  },

  // Установить несколько тайлов
  async setTiles({
    levelIndex = currentLevelIndex,
    tiles,
  }: {
    levelIndex?: number;
    tiles: Array<{ x: number; y: number; index: TileIndexes }>;
  }) {
    await dungeonDB;
    const levelMap = await getLevel(levelIndex);
    tiles.forEach(({ x, y, index }) => levelMap.set(tileKey(x, y), index));
    markDirty(levelIndex);
  },

  // Получить индекс активного уровня
  async getCurrentLevelIndex() {
    await dungeonDB;
    return currentLevelIndex;
  },

  // Установить активный уровень
  async setCurrentLevelIndex(levelIndex: number) {
    await dungeonDB;
    currentLevelIndex = levelIndex;
    if (!levels.has(levelIndex)) await loadLevelFromDB(levelIndex);
    throttledSaveCurrentLevelIndex();
  },

  async getTilesCountInLevel({ levelIndex = currentLevelIndex }: { levelIndex?: number } = {}) {
    await dungeonDB;
    return (await getLevel(levelIndex)).size;
  },
};

expose(api);
