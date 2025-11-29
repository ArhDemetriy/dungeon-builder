# TypeScript Style Guide - Dungeon Builder

> Vue 3 + Composition API + Pinia + Phaser

## Принципы типизации

### Inline Types

Описывайте типы по месту использования. Создавайте отдельные типы только если используется 2+ раз или это модель данных.

```typescript
// ✅ Inline
function createTile(data: { position: { x: number; y: number }; type: string }) { }

// ✅ Отдельный тип для моделей
interface Level { id: string; name: string; tiles: Map<string, GridTile>; }
```

### Type Inference

Не указывайте явно типы возвращаемых значений - TypeScript выведет их автоматически.

```typescript
function getTileColor(type: string) {
  return type === 'floor' ? 0x8B7355 : null; // Выведет: number | null
}
```

### satisfies > as

Используйте `satisfies` для проверки типов без потери точности. `as` отключает проверку.

```typescript
const config = { tileSize: 32, gridWidth: 30 } satisfies GameConfig;
```

### interface > type

Предпочитайте `interface` для объектов. `type` только для unions и сложных типов.

```typescript
interface Building { id: string; }
type TileType = 'empty' | 'floor' | 'wall';
```

### as const для литералов

```typescript
const COLORS = { floor: 0x8B7355, wall: 0x4A4A4A } as const;
```

## Обработка ошибок

### neverthrow для Result-based errors

```typescript
import { ok, err, type Result } from 'neverthrow';

function loadLevel(id: number): Result<Level, { type: 'not_found'; id: number }> {
  const level = levels.find(l => l.id === id);
  return level ? ok(level) : err({ type: 'not_found' as const, id });
}

loadLevel(5).map(renderLevel).mapErr(error => console.error(error));
```

### Exhaustive checks с ts-expect

```typescript
import { expectNever } from 'ts-expect';

function handle(error: { type: 'a' } | { type: 'b' }) {
  switch (error.type) {
    case 'a': return handleA();
    case 'b': return handleB();
    default: expectNever(error.type); // Ошибка если добавим новый тип
  }
}
```

## Деструктуризация

### В параметрах функций

```typescript
// ✅ Config object с деструктуризацией
function updateSafeZone({ centerX, centerY, width, height }: Geom.Rectangle) { }
function getTileAtWorld({ worldX, worldY }: { worldX: number; worldY: number }) { }

// ❌ Много позиционных параметров
function updateSafeZone(centerX: number, centerY: number, width: number, height: number) { }
```

### В начале метода — извлечение из конфигов и состояния

```typescript
private predictLayerNeed() {
  const { predictionTime, baseThreshold } = TILEMAP_STREAMING_CONFIG;
  const { centerX, centerY } = this.scene.cameras.main;
  const { velocity, acceleration, speed } = this.velocityState;
  // ...
}
```

## Код стиль

### Функциональный подход

```typescript
const active = tiles.filter(t => t.type !== 'empty').map(t => ({ ...t, active: true }));
const newState = { ...state, levels: state.levels.map((l, i) => i === idx ? updated : l) };
```

### Early return (Guard Clauses)

```typescript
// ✅ Early return
private updateVelocity() {
  if (!Number.isFinite(centerX)) return this.velocityState;
  if (deltaTime < 1 || deltaTime > 1000) return this.velocityState;
  // основная логика
}

// ❌ Вложенные if
private updateVelocity() {
  if (Number.isFinite(centerX)) {
    if (deltaTime >= 1 && deltaTime <= 1000) {
      // основная логика
    }
  }
}
```

### Вложенные тернарные операторы

Допустимы для вычисления значений с несколькими ветками. Форматируйте с отступами.

```typescript
// ✅ Читаемые вложенные тернарники
const x: Direction =
  Math.abs(dirX) > 0.1
    ? dirX < 0 && predictedTile.x < edgeX
      ? -1
      : dirX > 0 && predictedTile.x > w - edgeX
        ? 1
        : 0
    : 0;

// ❌ if/else для простых вычислений
let x: Direction = 0;
if (Math.abs(dirX) > 0.1) {
  if (dirX < 0 && predictedTile.x < edgeX) x = -1;
  else if (dirX > 0 && predictedTile.x > w - edgeX) x = 1;
}
```

### Method chaining (Phaser)

```typescript
this.tileLayers[1]
  .setVisible(false)
  .setPosition(x, y)
  .putTilesAt(data, 0, 0)
  .setVisible(true);
```

### void для игнорируемых Promise

```typescript
// ✅ Явное игнорирование результата
void this.generateLayerData(offset).then(data => this.applyLayerData(data));

// ❌ Floating promise без void
this.generateLayerData(offset).then(data => this.applyLayerData(data));
```

### Неиспользуемые переменные

Префикс `_` для параметров которые нужны для сигнатуры.

```typescript
function render(_timestamp: number, data: Data) { return processData(data); }
```

## Комментарии

### Секционные разделители для группировки методов

```typescript
// ============================================================
// === VELOCITY TRACKING ===
// ============================================================
```

### JSDoc с семантическими секциями

Используйте секции для сложных методов:

- **ЗАЧЕМ** — цель и польза
- **ЛОГИКА/АЛГОРИТМ** — как работает
- **ГРАНИЧНЫЕ СЛУЧАИ** — edge cases и защита
- **ВЗАИМОДЕЙСТВИЕ** — связь с другими частями системы

```typescript
/**
 * Вычисляет скорость камеры с EMA сглаживанием.
 *
 * АЛГОРИТМ:
 * 1. Мгновенная скорость = (pos - lastPos) / deltaTime
 * 2. EMA: newVel = oldVel * α + instantVel * (1 - α)
 *
 * ГРАНИЧНЫЕ СЛУЧАИ:
 * - deltaTime < 1ms → пропуск (защита от деления на ~0)
 * - instantSpeed > threshold → телепортация → сброс
 *
 * ВЗАИМОДЕЙСТВИЕ:
 * - Вызывается из motionTimer каждые 50-200мс
 * - Результат используется в predictLayerNeed()
 */
```

### Inline комментарии для неочевидной логики

```typescript
if (!this.pendingDirection || !isCenter) this.pendingDirection = direction; // center не может вытеснить movement
```

## Импорты

### Именованные импорты (не default)

```typescript
// ✅ Именованные
import { Game, Scene, type Types } from 'phaser';
export function App() { }

// ❌ Default
import Phaser from 'phaser';
export default function App() { }
```

### Алиас @/\* (не относительные пути)

```typescript
// ✅ Алиас
import { useCameraZoomStore } from '@/store/cameraStore';
import { MainScene } from '@/game/scenes/MainScene';

// ❌ Относительные
import { useCameraZoomStore } from '../../store/cameraStore';
```

**Исключение:** CSS modules могут использовать `./styles.module.css`

### type для импорта типов

```typescript
import { Game, type Types } from 'phaser';
import { create, type StateCreator } from 'zustand';
```

### Порядок (автосортировка Prettier)

1. Внешние библиотеки
2. Внутренние (utils, services, stores, hooks)
3. Компоненты
4. Стили

## Именование

- **Компоненты**: PascalCase (`Toolbar`)
- **Функции/переменные**: camelCase (`getTileColor`)
- **Типы**: PascalCase (`GameError`)
- **Константы**: UPPER_SNAKE_CASE или camelCase с `as const`

## Vue Composition API

### Script setup

Используйте `<script setup lang="ts">` для всех компонентов.

```vue
<script setup lang="ts">
import { useToolbarStore } from '@/store/toolbarStore';

const toolbarStore = useToolbarStore();
</script>

<template>
  <button @click="toolbarStore.setActiveTile('wall')">Wall</button>
</template>
```

### Props inline

```typescript
// Для простых компонентов
defineProps<{
  tileType: string;
  position: { x: number; y: number };
}>();

// С дефолтами
withDefaults(
  defineProps<{ size?: number }>(),
  { size: 32 }
);
```

## Pinia Stores

### Структура store (Composition API style)

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLevelStore = defineStore('level', () => {
  // State
  const levels = ref(new Map<string, Level>());
  const currentLevelId = ref<string | null>(null);

  return {
    levels,
    currentLevelId,

    // Геттеры - стрелочные функции
    getTile: (levelId: string, x: number, y: number) =>
      levels.value.get(levelId)?.tiles.get(`${x},${y}`),

    // Экшены - обычные функции
    createLevel(name: string) {
      const id = nanoid();
      levels.value.set(id, { id, name, tiles: new Map() });
      return id;
    },

    // Простые сеттеры - стрелочные функции
    setCurrentLevel: (id: string) => (currentLevelId.value = id),
  };
});
```

### Мутабельность

Pinia - мутабельный state manager. Изменяйте состояние напрямую.

```typescript
// ✅ Прямая мутация
level.tiles.set(key, tile);
map.value.delete(id);

// ❌ Иммутабельный подход не нужен
map.value = new Map(map.value).set(key, value);
```

### Persistence

Используйте Map/Set для больших коллекций. Сериализация настроена глобально.

```typescript
export const useLevelStore = defineStore(
  'level',
  () => { /* ... */ },
  { persist: { key: 'level-store' } }
);
```

## Phaser

### Координаты — соглашение об именовании

| Формат             | Значение                     | Пример                                      |
| ------------------ | ---------------------------- | ------------------------------------------- |
| `x`, `y`           | непрерывные значения (float) | `velocity: { x, y }`, `direction: { x, y }` |
| `X`, `Y`           | тайловые координаты (int)    | `offsetTiles: { X, Y }`                     |
| `worldX`, `worldY` | пиксели (явно названы, int)  | `getTileAtWorld({ worldX, worldY })`        |

```typescript
// ✅ Тайловые координаты — источник истины (целые числа)
const offsetTiles = { X: 10, Y: 20 };
const worldPos = { x: offsetTiles.X * TILE_SIZE, y: offsetTiles.Y * TILE_SIZE };

// ❌ Пиксели как источник истины (ошибки округления при делении)
const worldPos = { x: 320, y: 640 };
const tiles = { X: worldPos.x / TILE_SIZE, Y: worldPos.y / TILE_SIZE }; // может быть 9.999...
```

### Tilemap для статичных слоев

Используйте Phaser Tilemap для сеток тайлов (автоматический culling, WebGL батчинг).

```typescript
this.tilemap = scene.make.tilemap({ tileWidth: 32, tileHeight: 32 });
this.tileset = this.tilemap.addTilesetImage('tiles', 'tiles', 32, 32, 0, 2);
this.layer = this.tilemap.createBlankLayer('main', this.tileset);
```

### Texture spacing

Добавляйте spacing между тайлами в атласе для предотвращения texture bleeding.

```typescript
const TILE_SPACING = 2;
ctx.fillRect((TILE_SIZE + TILE_SPACING) * index, 0, TILE_SIZE, TILE_SIZE);
```

## Архитектура

### YAGNI - не добавляйте неиспользуемый код

Удаляйте фичи, которые мешают разработке текущей архитектуры. Вернете когда понадобятся.

### Map/Set для больших коллекций

```typescript
// ✅ Map для O(1) доступа
tiles: Map<string, GridTile>
levels: Map<string, Level>

// ❌ Array для поиска по ID требует O(n)
tiles: Array<{ id: string; data: GridTile }>
```

## ESLint

- Неиспользуемые переменные с `_` игнорируются
- `@ts-ignore` запрещен, используйте `@ts-expect-error` с описанием
- Return types не требуются (type inference)
- Vue SFC должны использовать `script-setup`

## Ссылки

- [Vue Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Pinia](https://pinia.vuejs.org/)
- [Phaser Tilemap](https://newdocs.phaser.io/docs/3.80.0/Phaser.Tilemaps.Tilemap)
- [satisfies](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator)
- [neverthrow](https://github.com/supermacro/neverthrow)
