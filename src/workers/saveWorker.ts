import { expose } from 'comlink';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { throttle } from 'lodash-es';

import { SAVE_CONFIG } from '@/game/constants';
import type { TaskSaved } from '@/store/attentionStore';
import type { TileIndexes } from '@/types/level';

export type SaveWorkerApi = typeof api;
type LevelIndex = number;
type TaskPool = 'active' | 'paused' | 'resumed' | 'pending';

/** допустимые значения координат от 0 до 65535 */
// const tileKey = (x: number, y: number) => `${Math.floor(x)}_${Math.floor(y)}` as const;
const tileKey = (x: number, y: number) => (Math.floor(x) << 16) | (Math.floor(y) & 0xffff);
// const getX = (key: ReturnType<typeof tileKey>) => key >> 16;
// const getY = (key: ReturnType<typeof tileKey>) => key & 0xffff;

type Schema<T extends DBSchema> = T;
type DungeonDB = Schema<{
  levels: {
    key: LevelIndex;
    value: { tiles: Array<{ key: ReturnType<typeof tileKey>; index: TileIndexes }> };
  };
  meta: {
    key: 'state';
    value: { currentLevelIndex: LevelIndex };
  };
  tasks: {
    key: TaskPool;
    value: { tasks: TaskSaved[] };
  };
  dungeonState: {
    key: 'attention';
    value: { attentionLimit: number };
  };
}>;

// Внутреннее хранилище воркера
let currentLevelIndex: LevelIndex = 0;
const levels = new Map<LevelIndex, Map<ReturnType<typeof tileKey>, TileIndexes>>();
const dirtyLevels = new Set<LevelIndex>();

// Tasks хранилище
const activeTasks = new Map<string, TaskSaved>();
const pausedTasks = new Map<string, TaskSaved>();
const resumedTasks: TaskSaved[] = [];
const pendingTasks: TaskSaved[] = [];

// Dirty-флаги для атомарного сохранения
let dirtyMeta = false;
let dirtyAttention = false;
let dirtyActiveTasks = false;
let dirtyPausedTasks = false;
let dirtyResumedTasks = false;
let dirtyPendingTasks = false;

let attentionLimit = 8;

const loadLevel = async (dungeonDB: PromiseLike<IDBPDatabase<DungeonDB>>, levelIndex: LevelIndex) =>
  dungeonDB
    .then(db => db.get('levels', levelIndex))
    .then(level => {
      levels.set(levelIndex, new Map(level?.tiles.map(({ key, index }) => [key, index])));
    });
// Автоинициализация при загрузке модуля
const dungeonDB = (() => {
  const dbPromise = openDB<DungeonDB>('dungeon-builder', 3, {
    upgrade(database, oldVersion) {
      // v0 → v1: базовые сторы
      if (oldVersion < 1) {
        database.createObjectStore('levels');
        database.createObjectStore('meta');
      }
      // v1 → v2: capturing и dungeonState
      if (oldVersion < 2) {
        database.createObjectStore('capturing' as never);
        database.createObjectStore('dungeonState');
      }
      // v2 → v3: tasks (удаляем capturing)
      if (oldVersion < 3) {
        if (database.objectStoreNames.contains('capturing' as never)) {
          database.deleteObjectStore('capturing' as never);
        }
        database.createObjectStore('tasks');
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
    dbPromise.then(async db => {
      const [active, paused, resumed, pending] = await Promise.all([
        db.get('tasks', 'active'),
        db.get('tasks', 'paused'),
        db.get('tasks', 'resumed'),
        db.get('tasks', 'pending'),
      ]);
      if (active?.tasks) {
        active.tasks.forEach(task => activeTasks.set(task.id, task));
      }
      if (paused?.tasks) {
        paused.tasks.forEach(task => pausedTasks.set(task.id, task));
      }
      if (resumed?.tasks) {
        resumedTasks.push(...resumed.tasks);
      }
      if (pending?.tasks) {
        pendingTasks.push(...pending.tasks);
      }
    }),
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
  const hasDirty =
    dirtyLevels.size ||
    dirtyMeta ||
    dirtyAttention ||
    dirtyActiveTasks ||
    dirtyPausedTasks ||
    dirtyResumedTasks ||
    dirtyPendingTasks;
  if (!hasDirty) return;

  const db = await dungeonDB;
  // Повторная проверка после await
  if (
    !dirtyLevels.size &&
    !dirtyMeta &&
    !dirtyAttention &&
    !dirtyActiveTasks &&
    !dirtyPausedTasks &&
    !dirtyResumedTasks &&
    !dirtyPendingTasks
  )
    return;

  // Собрать данные ДО очистки флагов
  const levelData = Array.from(dirtyLevels, levelIndex => ({
    levelIndex,
    tiles: Array.from(levels.get(levelIndex)?.entries() ?? []).map(([key, index]) => ({ key, index })),
  }));
  const saveMeta = dirtyMeta;
  const saveAttention = dirtyAttention;
  const saveActiveTasks = dirtyActiveTasks;
  const savePausedTasks = dirtyPausedTasks;
  const saveResumedTasks = dirtyResumedTasks;
  const savePendingTasks = dirtyPendingTasks;
  const metaValue = currentLevelIndex;
  const attentionValue = attentionLimit;

  // Очистить флаги
  dirtyLevels.clear();
  dirtyMeta = false;
  dirtyAttention = false;
  dirtyActiveTasks = false;
  dirtyPausedTasks = false;
  dirtyResumedTasks = false;
  dirtyPendingTasks = false;

  // Собрать блокируемые сторы
  const keys: Set<keyof DungeonDB> = new Set();
  if (levelData.length) keys.add('levels');
  if (saveMeta) keys.add('meta');
  if (saveAttention) keys.add('dungeonState');
  if (saveActiveTasks || savePausedTasks || saveResumedTasks || savePendingTasks) keys.add('tasks');

  // Одна транзакция для всех store
  const tx = db.transaction(Array.from(keys), 'readwrite');

  // Levels
  for (const { tiles, levelIndex } of levelData) {
    if (tiles.length) tx.objectStore('levels').put({ tiles }, levelIndex);
    else tx.objectStore('levels').delete(levelIndex);
  }

  // Meta
  if (saveMeta) {
    tx.objectStore('meta').put({ currentLevelIndex: metaValue }, 'state');
  }

  // Attention
  if (saveAttention) {
    tx.objectStore('dungeonState').put({ attentionLimit: attentionValue }, 'attention');
  }

  // Tasks
  if (saveActiveTasks) {
    const tasks = Array.from(activeTasks.values());
    if (tasks.length) tx.objectStore('tasks').put({ tasks }, 'active');
    else tx.objectStore('tasks').delete('active');
  }
  if (savePausedTasks) {
    const tasks = Array.from(pausedTasks.values());
    if (tasks.length) tx.objectStore('tasks').put({ tasks }, 'paused');
    else tx.objectStore('tasks').delete('paused');
  }
  if (saveResumedTasks) {
    if (resumedTasks.length) tx.objectStore('tasks').put({ tasks: resumedTasks }, 'resumed');
    else tx.objectStore('tasks').delete('resumed');
  }
  if (savePendingTasks) {
    if (pendingTasks.length) tx.objectStore('tasks').put({ tasks: pendingTasks }, 'pending');
    else tx.objectStore('tasks').delete('pending');
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

function markMetaDirty() {
  dirtyMeta = true;
  throttledPersist();
}

function markAttentionDirty() {
  dirtyAttention = true;
  throttledPersist();
}

function markTasksDirty(pool: TaskPool) {
  if (pool === 'active') dirtyActiveTasks = true;
  else if (pool === 'paused') dirtyPausedTasks = true;
  else if (pool === 'resumed') dirtyResumedTasks = true;
  else if (pool === 'pending') dirtyPendingTasks = true;
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
  // === TASKS API ===
  // ============================================================

  async getAllTasks() {
    await dungeonDB;
    return {
      active: Array.from(activeTasks.values()),
      paused: Array.from(pausedTasks.values()),
      resumed: [...resumedTasks],
      pending: [...pendingTasks],
    };
  },

  async moveTask({ id, from, to }: { id: string; from: TaskPool; to: TaskPool }) {
    await dungeonDB;
    let task: TaskSaved | undefined;

    // Извлечь из исходного пула
    if (from === 'active') {
      task = activeTasks.get(id);
      if (task) activeTasks.delete(id);
    } else if (from === 'paused') {
      task = pausedTasks.get(id);
      if (task) pausedTasks.delete(id);
    } else if (from === 'resumed') {
      const index = resumedTasks.findIndex(t => t.id === id);
      if (index >= 0) {
        task = resumedTasks[index];
        resumedTasks.splice(index, 1);
      }
    } else if (from === 'pending') {
      const index = pendingTasks.findIndex(t => t.id === id);
      if (index >= 0) {
        task = pendingTasks[index];
        pendingTasks.splice(index, 1);
      }
    }

    if (!task) return;

    // Добавить в целевой пул
    if (to === 'active') {
      activeTasks.set(id, task);
    } else if (to === 'paused') {
      pausedTasks.set(id, task);
    } else if (to === 'resumed') {
      resumedTasks.push(task);
    } else if (to === 'pending') {
      pendingTasks.push(task);
    }

    markTasksDirty(from);
    markTasksDirty(to);
  },

  async pushTasks({ tasks }: { tasks: TaskSaved[] }) {
    await dungeonDB;
    pendingTasks.push(...tasks);
    markTasksDirty('pending');
    return tasks.map(t => t.id);
  },

  async removeTask({ id, from }: { id: string; from: TaskPool }) {
    await dungeonDB;
    if (from === 'active') {
      activeTasks.delete(id);
    } else if (from === 'paused') {
      pausedTasks.delete(id);
    } else if (from === 'resumed') {
      const index = resumedTasks.findIndex(t => t.id === id);
      if (index >= 0) resumedTasks.splice(index, 1);
    } else if (from === 'pending') {
      const index = pendingTasks.findIndex(t => t.id === id);
      if (index >= 0) pendingTasks.splice(index, 1);
    }
    markTasksDirty(from);
  },

  async updateActiveProgress(updates: Array<{ id: string; elapsedMs: number }>) {
    await dungeonDB;
    for (const { id, elapsedMs } of updates) {
      const task = activeTasks.get(id);
      if (task) task.elapsedMs = elapsedMs;
    }
    markTasksDirty('active');
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
