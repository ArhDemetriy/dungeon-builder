import { expose } from 'comlink';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { throttle } from 'lodash-es';

import { SAVE_CONFIG } from '@/game/constants';
import type { CapturingTileSaved } from '@/types/dungeon';
import type { TileIndexes } from '@/types/level';

export type SaveWorkerApi = typeof api;
type LevelIndex = number;

/** допустимые значения координат от 0 до 65535 */
// const tileKey = (x: number, y: number) => `${Math.floor(x)}_${Math.floor(y)}` as const;
const tileKey = (x: number, y: number) => (Math.floor(x) << 16) | (Math.floor(y) & 0xffff);
// const getX = (key: ReturnType<typeof tileKey>) => key >> 16;
// const getY = (key: ReturnType<typeof tileKey>) => key & 0xffff;

interface DungeonDB extends DBSchema {
  levels: {
    key: LevelIndex;
    value: { tiles: Array<{ key: ReturnType<typeof tileKey>; index: TileIndexes }> };
  };
  meta: {
    key: 'state';
    value: { currentLevelIndex: LevelIndex };
  };
  capturing: {
    key: LevelIndex;
    value: { tiles: Array<{ key: ReturnType<typeof tileKey>; data: CapturingTileSaved }> };
  };
  dungeonState: {
    key: 'attention';
    value: { attentionLimit: number };
  };
}

// Внутреннее хранилище воркера
let currentLevelIndex: LevelIndex = 0;
const levels = new Map<LevelIndex, Map<ReturnType<typeof tileKey>, TileIndexes>>();
const dirtyLevels = new Set<LevelIndex>();

// Capturing tiles хранилище
const capturingTiles = new Map<LevelIndex, Map<ReturnType<typeof tileKey>, CapturingTileSaved>>();
const dirtyCapturingLevels = new Set<LevelIndex>();
let attentionLimit = 8;

// Dirty-флаги для атомарного сохранения
let dirtyMeta = false;
let dirtyAttention = false;

const loadLevel = async (dungeonDB: PromiseLike<IDBPDatabase<DungeonDB>>, levelIndex: LevelIndex) =>
  dungeonDB
    .then(db => Promise.all([db.get('levels', levelIndex), db.get('capturing', levelIndex)]))
    .then(([level, capturing]) => {
      levels.set(levelIndex, new Map(level?.tiles.map(({ key, index }) => [key, index])));
      capturingTiles.set(currentLevelIndex, new Map(capturing?.tiles.map(({ key, data }) => [key, data])));
    });
// Автоинициализация при загрузке модуля
const dungeonDB = (() => {
  const dbPromise = openDB<DungeonDB>('dungeon-builder', 2, {
    upgrade(database, oldVersion) {
      // v0 → v1: базовые сторы
      if (oldVersion < 1) {
        database.createObjectStore('levels');
        database.createObjectStore('meta');
      }
      // v1 → v2: capturing и dungeonState
      if (oldVersion < 2) {
        database.createObjectStore('capturing');
        database.createObjectStore('dungeonState');
      }
    },
  });

  return Promise.all([
    dbPromise
      .then(db => db.get('meta', 'state'))
      .then(state => (currentLevelIndex = state?.currentLevelIndex ?? 0))
      .then(currentLevelIndex => loadLevel(dbPromise, currentLevelIndex)),
    dbPromise
      .then(db => db.get('dungeonState', 'attention'))
      .then(attention => (attentionLimit = attention?.attentionLimit ?? 8)),
  ]).then(() => dbPromise);
})();
const loadLevelFromDB = loadLevel.bind(undefined, dungeonDB);

async function getLevel(levelIndex: LevelIndex) {
  if (!levels.has(levelIndex)) await loadLevelFromDB(levelIndex);
  const level = levels.get(levelIndex);
  if (!level) throw new Error('unknown load level error');
  return level;
}

// ============================================================
// === ЕДИНОЕ АТОМАРНОЕ СОХРАНЕНИЕ ===
// ============================================================

async function persistAll() {
  const hasDirty = dirtyLevels.size || dirtyCapturingLevels.size || dirtyMeta || dirtyAttention;
  if (!hasDirty) return;

  const db = await dungeonDB;
  // Повторная проверка после await
  if (!dirtyLevels.size && !dirtyCapturingLevels.size && !dirtyMeta && !dirtyAttention) return;

  // Собрать данные ДО очистки флагов
  const levelData = Array.from(dirtyLevels, levelIndex => ({
    levelIndex,
    tiles: Array.from(levels.get(levelIndex)?.entries() ?? []).map(([key, index]) => ({ key, index })),
  }));
  const capturingData = Array.from(dirtyCapturingLevels, levelIndex => ({
    levelIndex,
    tiles: Array.from(capturingTiles.get(levelIndex)?.entries() ?? []).map(([key, data]) => ({ key, data })),
  }));
  const saveMeta = dirtyMeta;
  const saveAttention = dirtyAttention;
  const metaValue = currentLevelIndex;
  const attentionValue = attentionLimit;

  // Очистить флаги
  dirtyLevels.clear();
  dirtyCapturingLevels.clear();
  dirtyMeta = false;
  dirtyAttention = false;

  // Одна транзакция для всех store
  const tx = db.transaction(['levels', 'capturing', 'meta', 'dungeonState'], 'readwrite');

  // Levels
  for (const { tiles, levelIndex } of levelData) {
    if (tiles.length) tx.objectStore('levels').put({ tiles }, levelIndex);
    else tx.objectStore('levels').delete(levelIndex);
  }

  // Capturing
  for (const { levelIndex, tiles } of capturingData) {
    if (tiles.length) tx.objectStore('capturing').put({ tiles }, levelIndex);
    else tx.objectStore('capturing').delete(levelIndex);
  }

  // Meta
  if (saveMeta) {
    tx.objectStore('meta').put({ currentLevelIndex: metaValue }, 'state');
  }

  // Attention
  if (saveAttention) {
    tx.objectStore('dungeonState').put({ attentionLimit: attentionValue }, 'attention');
  }

  await tx.done;
}

const throttledPersist = throttle(persistAll, SAVE_CONFIG.autoSaveInterval, {
  leading: false,
  trailing: true,
});

function markDirty(levelIndex: LevelIndex) {
  dirtyLevels.add(levelIndex);
  throttledPersist();
}

function markCapturingDirty(levelIndex: LevelIndex) {
  dirtyCapturingLevels.add(levelIndex);
  throttledPersist();
}

function markMetaDirty() {
  dirtyMeta = true;
  throttledPersist();
}

function markAttentionDirty() {
  dirtyAttention = true;
  throttledPersist();
}

const api = {
  async waitForReady() {
    await dungeonDB;
  },

  // Принудительное сохранение
  async flush() {
    throttledPersist.cancel();
    await persistAll();
  },

  // Получить данные для тайл-слоя
  async getTileLayerData({
    levelIndex = currentLevelIndex,
    widthTiles,
    heightTiles,
    offsetTilesX,
    offsetTilesY,
  }: {
    levelIndex?: LevelIndex;
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
  async getTile({ levelIndex = currentLevelIndex, x, y }: { levelIndex?: LevelIndex; x: number; y: number }) {
    await dungeonDB;
    const levelMap = await getLevel(levelIndex);
    return levelMap.get(tileKey(x, y));
  },

  // Установить тайл
  async setTile({
    levelIndex = currentLevelIndex,
    X,
    Y,
    index,
  }: {
    levelIndex?: LevelIndex;
    X: number;
    Y: number;
    index: TileIndexes;
  }) {
    await dungeonDB;
    const levelMap = await getLevel(levelIndex);
    levelMap.set(tileKey(X, Y), index);
    markDirty(levelIndex);
  },

  // Установить несколько тайлов
  async setTiles({
    levelIndex = currentLevelIndex,
    tiles,
  }: {
    levelIndex?: LevelIndex;
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
  async setCurrentLevelIndex(levelIndex: LevelIndex) {
    await dungeonDB;
    currentLevelIndex = levelIndex;
    if (!levels.has(levelIndex)) await loadLevelFromDB(levelIndex);
    markMetaDirty();
  },

  async getTilesCountInLevel({ levelIndex = currentLevelIndex }: { levelIndex?: LevelIndex } = {}) {
    await dungeonDB;
    return (await getLevel(levelIndex)).size;
  },

  // ============================================================
  // === CAPTURING TILES API ===
  // ============================================================

  async getCapturingTiles({ levelIndex = currentLevelIndex }: { levelIndex?: LevelIndex } = {}) {
    await dungeonDB;
    const map = capturingTiles.get(levelIndex);
    if (!map) return [];
    return Array.from(map.values());
  },

  async setCapturingTile({
    levelIndex = currentLevelIndex,
    X,
    Y,
    targetIndex,
    elapsedMs,
    duration,
  }: {
    levelIndex?: LevelIndex;
    X: number;
    Y: number;
    targetIndex: TileIndexes;
    elapsedMs: number;
    duration: number;
  }) {
    await dungeonDB;
    if (!capturingTiles.has(levelIndex)) capturingTiles.set(levelIndex, new Map());
    capturingTiles.get(levelIndex)!.set(tileKey(X, Y), { X, Y, targetIndex, elapsedMs, duration });
    markCapturingDirty(levelIndex);
  },

  async updateCapturingProgress({
    levelIndex = currentLevelIndex,
    X,
    Y,
    elapsedMs,
  }: {
    levelIndex?: LevelIndex;
    X: number;
    Y: number;
    elapsedMs: number;
  }) {
    await dungeonDB;
    const tile = capturingTiles.get(levelIndex)?.get(tileKey(X, Y));
    if (tile) {
      tile.elapsedMs = elapsedMs;
      markCapturingDirty(levelIndex);
    }
  },

  async removeCapturingTile({
    levelIndex = currentLevelIndex,
    X,
    Y,
  }: {
    levelIndex?: LevelIndex;
    X: number;
    Y: number;
  }) {
    await dungeonDB;
    capturingTiles.get(levelIndex)?.delete(tileKey(X, Y));
    markCapturingDirty(levelIndex);
  },

  // ============================================================
  // === ATTENTION LIMIT API ===
  // ============================================================

  async getAttentionLimit() {
    await dungeonDB;
    return attentionLimit;
  },

  async setAttentionLimit(newLimit: number) {
    await dungeonDB;
    attentionLimit = newLimit;
    markAttentionDirty();
  },
};

expose(api);
