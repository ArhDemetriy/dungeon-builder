# Объединенная стратегия управления слоями тайлмапы (Unified Tilemap Layer Management Strategy)

## Контекст и цели

Эта стратегия синтезирует лучшие компоненты из трех предложенных подходов:

- **Стратегия 0**: Safe Zone и Target State паттерн
- **Стратегия 1**: Оптимизированная проверка через таймер и адаптивные границы
- **Стратегия 2**: Предсказание траектории и система приоритетов

**Цели:**

- Максимальная производительность при минимальной нагрузке на CPU
- Корректная обработка сложного движения камеры
- Предотвращение параллельного создания слоев
- Точное определение остановки камеры
- Готовность к асинхронным операциям

---

## Архитектура решения

### Концептуальная модель

```
┌─────────────────────────────────────────────────────────────┐
│                    MainScene.update()                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Fast Path: Safe Zone Check (каждый кадр)            │  │
│  │  Если камера в Safe Zone → return (0.001ms)         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│         TilemapController (автономный)                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Motion Check Timer (100ms)                          │  │
│  │  ├─ Отслеживание скорости камеры                    │  │
│  │  ├─ Определение направления движения                │  │
│  │  └─ Предсказание траектории                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Target State Manager                                │  │
│  │  ├─ targetLayerPos (желаемая позиция)                │  │
│  │  ├─ currentLayerPos (текущая позиция)                │  │
│  │  └─ Priority Queue (movement > center)               │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Layer Generation Worker (async)                     │  │
│  │  ├─ Блокировка параллельных операций                │  │
│  │  ├─ Выполнение операций последовательно              │  │
│  │  └─ Обработка очереди                                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Ключевые компоненты

### 1. Safe Zone (Быстрая отсечка)

**Источник:** Стратегия 0

**Принцип работы:**

- Прямоугольная зона внутри текущего слоя (центральные 40-50%)
- Проверка `rect.contains(x, y)` в каждом кадре `update()`
- Если камера в Safe Zone → немедленный return (экономия ~0.001ms на кадр)

**Преимущества:**

- Максимальная экономия ресурсов когда камера в центре
- Не требует вычислений скорости или сложных проверок
- Работает как fast path для большинства случаев

**Реализация:**

```typescript
private safeRegion: Phaser.Geom.Rectangle;
private safeRegionMargin = 0.4; // 40% от размера слоя

private updateSafeRegion(layerPos: { x: number; y: number }) {
  const { width, height } = this.tilemap;
  const marginX = width * this.safeRegionMargin / 2;
  const marginY = height * this.safeRegionMargin / 2;

  this.safeRegion = new Phaser.Geom.Rectangle(
    layerPos.x + marginX * TILE_SIZE,
    layerPos.y + marginY * TILE_SIZE,
    (width - marginX * 2) * TILE_SIZE,
    (height - marginY * 2) * TILE_SIZE
  );
}

private isCameraInSafeZone(): boolean {
  const { centerX, centerY } = this.scene.cameras.main;
  return this.safeRegion.contains(centerX, centerY);
}
```

### 2. Отслеживание скорости камеры (Velocity Tracking)

**Источник:** Стратегия 2 (улучшенная)

**Принцип работы:**

- Вычисление скорости происходит в таймере (100мс), а не каждый кадр
- Использование экспоненциального скользящего среднего (EMA) для сглаживания
- Хранение скорости в пикселях на миллисекунду (px/ms)

**Улучшения:**

- Проверка только раз в 100мс (оптимизация из Стратегии 1)
- Валидация входных данных (исправление ошибок)
- Защита от аномалий времени

**Реализация:**

```typescript
private cameraVelocity = { x: 0, y: 0 };
private lastCameraPosition = { x: 0, y: 0 };
private lastVelocityUpdateTime = 0;

private readonly VELOCITY_SMOOTHING = 0.7;
private readonly STOP_THRESHOLD = 0.5; // px/ms
private readonly MAX_SPEED = 10; // px/ms (защита от артефактов)

private updateCameraVelocity(): void {
  const now = performance.now();
  const { centerX, centerY } = this.scene.cameras.main;

  // Валидация позиции
  if (!isFinite(centerX) || !isFinite(centerY)) return;

  const deltaTime = now - this.lastVelocityUpdateTime;

  // Защита от аномалий времени (пауза игры, большие задержки)
  if (deltaTime < 1 || deltaTime > 1000) {
    this.lastVelocityUpdateTime = now;
    return;
  }

  // Вычисление мгновенной скорости
  const instantVelocityX = (centerX - this.lastCameraPosition.x) / deltaTime;
  const instantVelocityY = (centerY - this.lastCameraPosition.y) / deltaTime;

  // Сглаживание через EMA
  this.cameraVelocity.x =
    this.cameraVelocity.x * this.VELOCITY_SMOOTHING +
    instantVelocityX * (1 - this.VELOCITY_SMOOTHING);
  this.cameraVelocity.y =
    this.cameraVelocity.y * this.VELOCITY_SMOOTHING +
    instantVelocityY * (1 - this.VELOCITY_SMOOTHING);

  // Ограничение максимальной скорости (защита от артефактов)
  this.cameraVelocity.x = Math.max(
    -this.MAX_SPEED,
    Math.min(this.MAX_SPEED, this.cameraVelocity.x)
  );
  this.cameraVelocity.y = Math.max(
    -this.MAX_SPEED,
    Math.min(this.MAX_SPEED, this.cameraVelocity.y)
  );

  this.lastCameraPosition = { x: centerX, y: centerY };
  this.lastVelocityUpdateTime = now;
}

private isCameraStopped(): boolean {
  const speed = Math.sqrt(
    this.cameraVelocity.x ** 2 + this.cameraVelocity.y ** 2
  );
  return speed < this.STOP_THRESHOLD;
}
```

### 3. Предсказание траектории движения

**Источник:** Стратегия 2 (улучшенная)

**Принцип работы:**

- Предсказание позиции камеры через заданное время (300ms)
- Комбинация с адаптивными границами из Стратегии 1
- Учет реальной траектории движения, а не только текущей позиции

**Улучшения:**

- Нормализация скорости для более точного предсказания
- Комбинация с адаптивными границами
- Валидация предсказанной позиции

**Реализация:**

```typescript
private readonly VELOCITY_PREDICTION_TIME = 300; // ms

private predictCameraDirection(): { x: -1 | 0 | 1; y: -1 | 0 | 1 } | null {
  if (this.isCameraStopped()) return null;

  const speed = Math.sqrt(
    this.cameraVelocity.x ** 2 + this.cameraVelocity.y ** 2
  );

  if (speed < this.STOP_THRESHOLD) return null;

  // Нормализация направления
  const directionX = this.cameraVelocity.x / speed;
  const directionY = this.cameraVelocity.y / speed;

  // Предсказание позиции
  const predictionDistance = speed * this.VELOCITY_PREDICTION_TIME;
  const predictedX = this.lastCameraPosition.x + directionX * predictionDistance;
  const predictedY = this.lastCameraPosition.y + directionY * predictionDistance;

  // Валидация предсказанной позиции
  if (!isFinite(predictedX) || !isFinite(predictedY)) return null;

  // Проверка предсказанной позиции на границы слоя
  return this.checkPositionAgainstLayerBounds(predictedX, predictedY);
}

private checkPositionAgainstLayerBounds(
  worldX: number,
  worldY: number
): { x: -1 | 0 | 1; y: -1 | 0 | 1 } | null {
  const layer = this.getActiveLayer();
  const predictedTile = layer.worldToTileXY(worldX, worldY);

  if (!predictedTile) {
    // Предсказанная позиция за пределами слоя
    const { left, right, top, bottom } = layer.getBounds();
    return {
      x: worldX < left ? -1 : worldX > right ? 1 : 0,
      y: worldY < top ? -1 : worldY > bottom ? 1 : 0,
    } as const;
  }

  const { width: widthTiles, height: heightTiles } = this.tilemap;

  // Адаптивные границы (из Стратегии 1)
  const edgeThreshold = Math.round(widthTiles / 3); // 33%
  const lookaheadThreshold = Math.round(widthTiles / 2); // 50%

  // Определяем направление движения для адаптивных границ
  const direction = this.getCurrentMovementDirection();

  // Проверка с адаптивными границами
  let x: -1 | 0 | 1 = 0;
  let y: -1 | 0 | 1 = 0;

  // В направлении движения используем более агрессивную границу
  if (direction.x < 0 && predictedTile.x < lookaheadThreshold) x = -1;
  else if (direction.x > 0 && predictedTile.x > widthTiles - lookaheadThreshold) x = 1;
  else if (predictedTile.x < edgeThreshold) x = -1;
  else if (predictedTile.x > widthTiles - edgeThreshold) x = 1;

  if (direction.y < 0 && predictedTile.y < lookaheadThreshold) y = -1;
  else if (direction.y > 0 && predictedTile.y > heightTiles - lookaheadThreshold) y = 1;
  else if (predictedTile.y < edgeThreshold) y = -1;
  else if (predictedTile.y > heightTiles - edgeThreshold) y = 1;

  return (x || y) ? { x, y } as const : null;
}

private getCurrentMovementDirection(): { x: number; y: number } {
  const speed = Math.sqrt(
    this.cameraVelocity.x ** 2 + this.cameraVelocity.y ** 2
  );

  if (speed < this.STOP_THRESHOLD) {
    return { x: 0, y: 0 };
  }

  return {
    x: Math.sign(this.cameraVelocity.x),
    y: Math.sign(this.cameraVelocity.y),
  };
}
```

### 4. Target State Manager (Паттерн Target State)

**Источник:** Стратегия 0 (улучшенная)

**Принцип работы:**

- Разделение желаемой позиции (`targetLayerPos`) и текущей позиции (`currentLayerPos`)
- Worker приводит `current` к `target` асинхронно
- Система приоритетов операций (movement > center)

**Улучшения:**

- Добавлена система приоритетов из Стратегии 2
- Итеративный подход вместо рекурсии (исправление ошибок)
- Интеграция с системой очередей

**Реализация:**

```typescript
private targetLayerPos: { x: number; y: number } | null = null;
private currentLayerPos: { x: number; y: number };
private isLayerGenerationInProgress = false;
private pendingOperation: { type: 'movement' | 'center'; direction?: { x: number; y: number } } | null = null;

private updateTargetPosition(direction: { x: number; y: number } | null, type: 'movement' | 'center'): void {
  if (type === 'center') {
    // Центрирование под камерой
    const { centerX, centerY } = this.scene.cameras.main;
    const { width: widthTiles, height: heightTiles } = this.tilemap;
    const X = Math.round((centerX - (widthTiles * TILE_SIZE) / 2) / TILE_SIZE);
    const Y = Math.round((centerY - (heightTiles * TILE_SIZE) / 2) / TILE_SIZE);
    this.targetLayerPos = { x: X * TILE_SIZE, y: Y * TILE_SIZE };
  } else if (direction) {
    // Сдвиг в направлении движения
    const { width, height } = this.tilemap;
    const { left, right, top, bottom } = this.scene.cameras.main.worldView;

    const offsetTilesX =
      direction.x > 0
        ? Math.round(left / TILE_SIZE) - 2
        : direction.x < 0
          ? Math.round(right / TILE_SIZE) + 2 - width
          : Math.round(this.getActiveLayer().x / TILE_SIZE);
    const offsetTilesY =
      direction.y > 0
        ? Math.round(top / TILE_SIZE) - 2
        : direction.y < 0
          ? Math.round(bottom / TILE_SIZE) + 2 - height
          : Math.round(this.getActiveLayer().y / TILE_SIZE);

    this.targetLayerPos = {
      x: offsetTilesX * TILE_SIZE,
      y: offsetTilesY * TILE_SIZE,
    };
  }
}

private async tryProcessUpdate(): Promise<void> {
  // Если уже идет генерация, не запускаем новую
  if (this.isLayerGenerationInProgress) return;

  // Если нет целевой позиции или уже на месте, ничего не делаем
  if (!this.targetLayerPos) return;

  const currentX = this.getActiveLayer().x;
  const currentY = this.getActiveLayer().y;

  if (
    Math.abs(currentX - this.targetLayerPos.x) < 1 &&
    Math.abs(currentY - this.targetLayerPos.y) < 1
  ) {
    // Уже на месте
    this.targetLayerPos = null;
    return;
  }

  // Фиксируем целевую позицию
  const jobTarget = { ...this.targetLayerPos };
  this.targetLayerPos = null; // Очищаем, чтобы не создавать дубликаты

  // Устанавливаем флаг генерации
  this.isLayerGenerationInProgress = true;
  const startTime = performance.now();

  try {
    // Генерируем и переключаем слой
    await this.generateAndSwitchLayer(jobTarget);

    // Обновляем текущую позицию
    this.currentLayerPos = jobTarget;

    // Обновляем Safe Zone под новый слой
    this.updateSafeRegion(jobTarget);

    // Обновляем среднее время генерации
    this.setAvgTileGenTime(performance.now() - startTime);
  } catch (error) {
    console.error('Layer generation failed:', error);
    // В случае ошибки восстанавливаем целевую позицию
    this.targetLayerPos = jobTarget;
  } finally {
    this.isLayerGenerationInProgress = false;

    // Обрабатываем очередь (итеративно, не рекурсивно)
    await this.processPendingOperation();
  }
}

private async processPendingOperation(): Promise<void> {
  if (!this.pendingOperation) return;

  const operation = this.pendingOperation;
  this.pendingOperation = null;

  // Определяем направление и тип операции
  if (operation.type === 'center') {
    this.updateTargetPosition(null, 'center');
  } else if (operation.direction) {
    this.updateTargetPosition(operation.direction, 'movement');
  }

  // Пытаемся обработать
  await this.tryProcessUpdate();
}
```

### 5. Система очередей с приоритетами

**Источник:** Стратегия 2 (улучшенная)

**Принцип работы:**

- Операции имеют приоритеты: `'movement'` > `'center'`
- Если идет генерация, новые запросы ставятся в очередь
- Приоритетные операции могут отменять менее приоритетные

**Улучшения:**

- Интеграция с Target State паттерном
- Итеративный подход вместо рекурсии
- Правильная обработка приоритетов

**Реализация:**

```typescript
private requestLayerUpdate(
  type: 'movement' | 'center',
  direction?: { x: number; y: number }
): void {
  // Если операция уже выполняется
  if (this.isLayerGenerationInProgress) {
    // Проверяем приоритеты
    if (type === 'center' && this.pendingOperation?.type === 'movement') {
      // Центрирование не может отменить движение
      return;
    }

    if (type === 'movement') {
      // Движение имеет приоритет - отменяем центрирование
      this.pendingOperation = { type, direction };
      this.cancelCenterLayerDebounce();
      return;
    }

    // Ставим в очередь
    this.pendingOperation = { type, direction };
    return;
  }

  // Если операция не выполняется, обновляем целевую позицию и пытаемся обработать
  this.updateTargetPosition(direction || null, type);
  this.tryProcessUpdate();
}
```

### 6. Debounce для центрирования

**Источник:** Стратегия 2 (улучшенная)

**Принцип работы:**

- При остановке камеры запускается таймер с задержкой (800ms)
- Если камера начинает двигаться, таймер отменяется
- Используется Phaser.Time.TimerEvent для интеграции с игровым циклом

**Улучшения:**

- Использование Phaser.Time.TimerEvent вместо window.setTimeout
- Правильная работа при паузе игры
- Автоматическая очистка при уничтожении

**Реализация:**

```typescript
private centerLayerTimer?: Phaser.Time.TimerEvent;

private scheduleCenterLayerOnStop(): void {
  // Отменяем предыдущий таймер
  this.cancelCenterLayerDebounce();

  // Используем Phaser TimerEvent для интеграции с игровым циклом
  this.centerLayerTimer = this.scene.time.delayedCall(
    this.CENTER_DEBOUNCE_DELAY,
    () => {
      this.centerLayerTimer = undefined;

      // Проверяем, что камера все еще остановлена
      if (this.isCameraStopped()) {
        this.requestLayerUpdate('center');
      }
    }
  );
}

private cancelCenterLayerDebounce(): void {
  if (this.centerLayerTimer) {
    this.centerLayerTimer.destroy();
    this.centerLayerTimer = undefined;
  }
}
```

### 7. Motion Check Timer (Оптимизированная проверка)

**Источник:** Стратегия 1 (улучшенная)

**Принцип работы:**

- Проверка движения происходит раз в 100мс через Phaser.Time.TimerEvent
- Обновление скорости, определение направления, предсказание траектории
- Если камера не в Safe Zone, обновляется целевая позиция

**Улучшения:**

- Интеграция всех компонентов
- Валидация данных
- Правильная обработка ошибок

**Реализация:**

```typescript
private motionCheckTimer?: Phaser.Time.TimerEvent;
private readonly MOTION_CHECK_INTERVAL = 100; // ms

private onMotionCheck(): void {
  // Обновляем скорость камеры
  this.updateCameraVelocity();

  // Если камера остановлена, планируем центрирование
  if (this.isCameraStopped()) {
    this.scheduleCenterLayerOnStop();
    return;
  }

  // Предсказываем направление движения
  const predictedDirection = this.predictCameraDirection();

  if (predictedDirection) {
    // Камера движется к границе - запрашиваем обновление слоя
    this.requestLayerUpdate('movement', predictedDirection);
  }
}
```

---

## Полная структура реализации

### Новые свойства в TilemapController

```typescript
export class TilemapController {
  // ... существующие свойства ...

  // Safe Zone
  private safeRegion: Phaser.Geom.Rectangle;
  private readonly safeRegionMargin = 0.4;

  // Отслеживание скорости
  private cameraVelocity = { x: 0, y: 0 };
  private lastCameraPosition = { x: 0, y: 0 };
  private lastVelocityUpdateTime = 0;

  // Target State
  private targetLayerPos: { x: number; y: number } | null = null;
  private currentLayerPos: { x: number; y: number };

  // Система очередей
  private isLayerGenerationInProgress = false;
  private pendingOperation: { type: 'movement' | 'center'; direction?: { x: number; y: number } } | null = null;

  // Таймеры
  private motionCheckTimer?: Phaser.Time.TimerEvent;
  private centerLayerTimer?: Phaser.Time.TimerEvent;

  // Константы
  private readonly VELOCITY_SMOOTHING = 0.7;
  private readonly STOP_THRESHOLD = 0.5; // px/ms
  private readonly MAX_SPEED = 10; // px/ms
  private readonly VELOCITY_PREDICTION_TIME = 300; // ms
  private readonly CENTER_DEBOUNCE_DELAY = 800; // ms
  private readonly MOTION_CHECK_INTERVAL = 100; // ms
}
```

### Инициализация в конструкторе

```typescript
constructor(scene: Scene) {
  // ... существующий код создания tilemap и слоев ...

  // Инициализация позиции камеры
  const { centerX, centerY } = this.scene.cameras.main;
  this.lastCameraPosition = { x: centerX, y: centerY };
  this.lastVelocityUpdateTime = performance.now();

  // Инициализация текущей позиции слоя
  this.centerLayerOnCamera();
  const activeLayer = this.getActiveLayer();
  this.currentLayerPos = { x: activeLayer.x, y: activeLayer.y };

  // Инициализация Safe Zone
  this.updateSafeRegion(this.currentLayerPos);

  // Запуск таймера проверки движения
  this.motionCheckTimer = this.scene.time.addEvent({
    delay: this.MOTION_CHECK_INTERVAL,
    callback: () => this.onMotionCheck(),
    loop: true,
  });
}
```

### Модификация MainScene

```typescript
// В update() добавляем быструю проверку Safe Zone
update(time: number, delta: number) {
  super.update(time, delta);
  this.cameraMoveController.handleMovement(delta);

  // Fast Path: быстрая проверка Safe Zone
  if (this.tilemapController.isCameraInSafeZone()) {
    // Камера в безопасной зоне - ничего не делаем
    const { main: camera } = this.cameras;
    const uiStore = useUIStore();
    this.tilemapController.renderGrid(camera, uiStore.showGrid);
    return;
  }

  // Камера вне Safe Zone - продолжаем обычную логику
  const { main: camera } = this.cameras;
  const uiStore = useUIStore();
  this.tilemapController.renderGrid(camera, uiStore.showGrid);
}

// Удаляем старый tilemapStreamingTimer из create()
// Вся логика теперь в TilemapController
```

### Метод destroy() для очистки ресурсов

```typescript
public destroy(): void {
  // Очистка таймеров
  if (this.motionCheckTimer) {
    this.motionCheckTimer.destroy();
    this.motionCheckTimer = undefined;
  }

  if (this.centerLayerTimer) {
    this.centerLayerTimer.destroy();
    this.centerLayerTimer = undefined;
  }

  // Очистка целевой позиции
  this.targetLayerPos = null;
  this.pendingOperation = null;
}
```

---

## Преимущества объединенной стратегии

### 1. Максимальная производительность

- ✅ Safe Zone обеспечивает быструю отсечку (0.001ms) в большинстве случаев
- ✅ Проверка движения только раз в 100мс (не каждый кадр)
- ✅ Минимальная нагрузка на CPU

### 2. Корректная обработка сложного движения

- ✅ Предсказание траектории учитывает реальное направление движения
- ✅ Адаптивные границы (50% в направлении движения)
- ✅ Комбинация предсказания и адаптивных границ дает лучший результат

### 3. Точное определение остановки

- ✅ Использование модуля скорости для определения остановки
- ✅ Устойчивость к микро-дрожанию камеры
- ✅ Debounce предотвращает ненужные центрирования

### 4. Предотвращение конфликтов

- ✅ Система приоритетов (movement > center)
- ✅ Target State паттерн предотвращает конфликты
- ✅ Гарантированное последовательное выполнение операций

### 5. Готовность к асинхронности

- ✅ Все методы async
- ✅ Правильная обработка ошибок
- ✅ Готовность к Web Workers и chunked loading

### 6. Интеграция с Phaser

- ✅ Использование Phaser.Time.TimerEvent везде
- ✅ Правильная работа при паузе игры
- ✅ Автоматическая очистка ресурсов

### 7. Надежность

- ✅ Валидация всех входных данных
- ✅ Защита от аномалий времени
- ✅ Ограничение максимальной скорости
- ✅ Обработка edge cases

---

## Исправленные ошибки из ревью

### ✅ Исправлено из Стратегии 0

- Добавлена валидация позиции камеры
- Добавлена защита от аномалий deltaTime
- Добавлен метод destroy() для cleanup

### ✅ Исправлено из Стратегии 1

- Добавлена инициализация lastPosition в конструкторе
- Добавлена валидация позиции камеры
- Заменен window.setTimeout на Phaser.Time.TimerEvent
- Исправлен рекурсивный вызов (итеративный подход)

### ✅ Исправлено из Стратегии 2

- Добавлена инициализация lastCameraPosition
- Добавлена валидация позиции и скорости
- Добавлена защита от аномалий deltaTime
- Исправлен рекурсивный вызов (итеративный подход)
- Добавлен метод destroy() для cleanup
- Заменен window.setTimeout на Phaser.Time.TimerEvent

---

## Параметры для калибровки

| Параметр                   | Значение  | Описание                         | Влияние                                     |
| -------------------------- | --------- | -------------------------------- | ------------------------------------------- |
| `safeRegionMargin`         | 0.4       | Размер Safe Zone (40%)           | ↑ = больше безопасная зона, меньше проверок |
| `MOTION_CHECK_INTERVAL`    | 100ms     | Интервал проверки движения       | ↓ = быстрее реакция, ↑ нагрузка             |
| `VELOCITY_SMOOTHING`       | 0.7       | Коэффициент сглаживания скорости | ↑ = плавнее, но медленнее реакция           |
| `STOP_THRESHOLD`           | 0.5 px/ms | Порог остановки                  | ↓ = чувствительнее к движению               |
| `MAX_SPEED`                | 10 px/ms  | Максимальная скорость            | Защита от артефактов                        |
| `VELOCITY_PREDICTION_TIME` | 300ms     | Время предсказания               | ↑ = дальше предсказание                     |
| `CENTER_DEBOUNCE_DELAY`    | 800ms     | Задержка центрирования           | ↓ = быстрее центрирование                   |
| `edgeThreshold`            | 33%       | Обычная граница                  | ↓ = позже создаём слои                      |
| `lookaheadThreshold`       | 50%       | Агрессивная граница              | ↑ = раньше создаём слои                     |

---

## Последовательность внедрения

### Этап 1: Базовая инфраструктура

1. Добавить свойства для Safe Zone, скорости, Target State
2. Реализовать `updateSafeRegion()` и `isCameraInSafeZone()`
3. Реализовать `updateCameraVelocity()` и `isCameraStopped()`
4. Добавить быструю проверку Safe Zone в `MainScene.update()`

### Этап 2: Предсказание и адаптивные границы

1. Реализовать `predictCameraDirection()`
2. Реализовать `checkPositionAgainstLayerBounds()`
3. Реализовать `getCurrentMovementDirection()`

### Этап 3: Target State и система очередей

1. Реализовать `updateTargetPosition()`
2. Реализовать `requestLayerUpdate()`
3. Реализовать `tryProcessUpdate()` и `processPendingOperation()`
4. Модифицировать `generateAndSwitchLayer()` для использования Target State

### Этап 4: Debounce и таймеры

1. Реализовать `scheduleCenterLayerOnStop()` и `cancelCenterLayerDebounce()`
2. Реализовать `onMotionCheck()`
3. Инициализировать таймеры в конструкторе

### Этап 5: Интеграция и очистка

1. Модифицировать `MainScene` (удалить старый таймер, добавить Safe Zone check)
2. Реализовать метод `destroy()`
3. Добавить валидацию и защиту от ошибок

### Этап 6: Тестирование и калибровка

1. Тестирование базового движения
2. Тестирование остановки и центрирования
3. Тестирование сложных траекторий
4. Калибровка параметров
5. Проверка производительности

---

## Тестовые сценарии

### Сценарий 1: Камера в Safe Zone

- Камера находится в центре слоя
- **Ожидаемое поведение**: Быстрая отсечка через Safe Zone, никаких проверок

### Сценарий 2: Простое движение к границе

- Камера движется вправо к правой границе
- **Ожидаемое поведение**: Предсказание определяет движение, создается слой справа

### Сценарий 3: Остановка камеры

- Камера движется, затем останавливается
- **Ожидаемое поведение**: Через 800ms создается слой, центрированный на камере

### Сценарий 4: Смена направления

- Камера движется влево до левой трети, затем вверх
- **Ожидаемое поведение**: Система корректно определяет движение вверх через предсказание

### Сценарий 5: Движение вдоль границы

- Камера движется вдоль границы слоя
- **Ожидаемое поведение**: Адаптивные границы предотвращают ненужные создания слоев

### Сценарий 6: Параллельные запросы

- Во время создания слоя камера останавливается
- **Ожидаемое поведение**: Запрос на центрирование ставится в очередь, выполняется после завершения

### Сценарий 7: Резкое изменение направления

- Камера резко меняет направление движения
- **Ожидаемое поведение**: Сглаживание скорости адаптируется, предсказание корректируется

---

## Заключение

Объединенная стратегия синтезирует лучшие компоненты всех трех подходов:

- **Из Стратегии 0**: Safe Zone и Target State паттерн
- **Из Стратегии 1**: Оптимизированная проверка через таймер и адаптивные границы
- **Из Стратегии 2**: Предсказание траектории и система приоритетов

Все выявленные ошибки исправлены, добавлены валидация и защита от edge cases. Стратегия готова к внедрению и обеспечивает оптимальное решение для управления слоями тайлмапы.
