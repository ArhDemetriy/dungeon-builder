# TypeScript Style Guide - Dungeon Builder

## Принципы типизации

### Inline Types
Описывайте типы по месту использования. Создавайте отдельные типы только если используется 2+ раз или это модель данных.

```typescript
// ✅ Inline
function createTile(data: { position: { x: number; y: number }; type: string }) { }

// ✅ Отдельный тип для моделей
interface Building { id: string; type: BuildingType; }
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

## Код стиль

### Функциональный подход
```typescript
const active = tiles.filter(t => t.type !== 'empty').map(t => ({ ...t, active: true }));
const newState = { ...state, levels: state.levels.map((l, i) => i === idx ? updated : l) };
```

### Неиспользуемые переменные
Префикс `_` для параметров которые нужны для сигнатуры.

```typescript
function render(_timestamp: number, data: Data) { return processData(data); }
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

### Алиас @/* (не относительные пути)
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

## React

### Hooks порядок
```typescript
function Component() {
  const store = useStore();              // 1. Stores
  const [state, setState] = useState(0); // 2. State
  const value = useMemo(() => ..., []);  // 3. Memo
  useEffect(() => { }, []);              // 4. Effects
  return <div />;
}
```

### Props inline
```typescript
function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick}>{children}</button>;
}
```

## ESLint

- Неиспользуемые переменные с `_` игнорируются
- `@ts-ignore` запрещен, используйте `@ts-expect-error` с описанием
- Return types не требуются (type inference)

## Ссылки

- [satisfies](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator)
- [neverthrow](https://github.com/supermacro/neverthrow)
- [Discriminated Unions](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes-func.html#discriminated-unions)
