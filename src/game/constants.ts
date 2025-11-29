export const TILE_SIZE = 64;
export const TILE_SPACING = 0;
export const TILE_MARGIN = 2;

export const TILE_TEXTURE_KEY = 'tiles';

export type TileIndexes = keyof typeof TILE_KEYS;
export const TILE_KEYS = {
  0: 'grass0',
  1: 'grass1',
} as const;
export const TILE_INDEX = {
  grass0: 0,
  grass1: 1,
} as const;

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

/**
 * Конфигурация системы стриминга тайлмапа.
 *
 * АРХИТЕКТУРА:
 * - Fast Path (Safe Zone) → 80% кадров без работы
 * - Motion Timer → адаптивная проверка 50-200мс
 * - Predictive Analysis → квадратичная экстраполяция
 * - Priority Queue → movement вытесняет center
 */
export const TILEMAP_STREAMING_CONFIG = {
  /** Safe Zone занимает 40% от размера слоя — камера внутри = Fast Path */
  baseSafeZoneRatio: 0.4,
  /** EMA коэффициент: 0.7 = 70% старого + 30% нового значения */
  velocitySmoothing: 0.7,
  /** Скорость ниже этого порога = камера остановлена (px/ms) */
  stopThreshold: 0.5,
  /** Защита от артефактов телепортации (px/ms) */
  maxSpeed: 10,
  /** Порог телепортации — скорость выше = сброс и center (px/ms) */
  teleportThreshold: 20,
  /** Горизонт предсказания позиции камеры (ms) */
  predictionTime: 300,
  /** Граница срабатывания при движении по диагонали (доля от размера слоя) */
  baseThreshold: 0.33,
  /** Граница срабатывания при движении вдоль оси (доля от размера слоя) */
  aggressiveThreshold: 0.5,
  /** Порог для определения доминирующего направления */
  directionDominanceRatio: 1.2,
  /** Debounce центрирования при остановке (ms) */
  centerDebounceDelay: 600,
  /** Типы операций: movement вытесняет center (используется для вывода типа OperationType) */
  priority: { movement: 10, center: 1 } as const,
  /** Адаптивные интервалы таймера по скорости (ms) */
  timerIntervals: { fast: 50, medium: 100, slow: 200 } as const,
} as const;
