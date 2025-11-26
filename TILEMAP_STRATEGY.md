# Финальная стратегия управления динамическими слоями тайлмапа

> **Версия:** 1.1 FINAL | **Дата:** 2025-11-26 | **Статус:** Готов к имплементации

---

## Обзор

Гибридная система с многоуровневой оптимизацией для управления слоями тайлмапа.

**Ключевые решения:**

- **Fast Path** — 80% случаев за ~0.001мс (Safe Zone check)
- **Phaser-native** — TimerEvent, Geom.Rectangle, Math.Clamp
- **Save Worker** — параллельная генерация через существующий `saveWorker.ts`
- **Predictive** — квадратичная экстраполяция траектории
- **Target State** — самовосстановление при конфликтах

**Архитектура:**

```
MainScene.update() ─► Fast Path: isCameraInSafeZone() → return (80%)
        │
        ▼
TilemapController (автономный)
├─ Motion Timer (50-200мс адаптивно)
│  ├─ Velocity Tracking (EMA)
│  ├─ Predictive Analysis
│  └─ Target State Update
├─ State Manager
│  ├─ currentLayerPos / targetLayerPos
│  └─ Priority Queue (movement > center)
└─ Save Worker Integration
   └─ getSaveWorker().getTileLayerData()
```

**Файлы:**

- `src/game/scenes/TilemapController.ts` — основные изменения
- `src/game/scenes/MainScene.ts` — Fast Path
- `src/workers/saveWorker.ts` — существующий API

---

## Компоненты

### 1. Dynamic Safe Zone

Прямоугольник в центре слоя (40%), расширяющийся в направлении движения.

```typescript
private dynamicSafeZone!: Phaser.Geom.Rectangle;

private updateDynamicSafeZone(): void {
  const bounds = this.getActiveLayer().getBounds();
  const baseWidth = bounds.width * this.BASE_SAFE_ZONE_RATIO;
  const baseHeight = bounds.height * this.BASE_SAFE_ZONE_RATIO;
  const speed = this.getSpeed();

  if (speed > this.STOP_THRESHOLD) {
    const lookahead = speed * this.LOOKAHEAD_TIME;
    const offsetX = (this.velocity.x / speed) * lookahead;
    const offsetY = (this.velocity.y / speed) * lookahead;
    this.dynamicSafeZone.setTo(
      bounds.centerX + offsetX - baseWidth / 2,
      bounds.centerY + offsetY - baseHeight / 2,
      baseWidth, baseHeight
    );
  } else {
    this.dynamicSafeZone.setTo(
      bounds.centerX - baseWidth / 2,
      bounds.centerY - baseHeight / 2,
      baseWidth, baseHeight
    );
  }
}

public isCameraInSafeZone(): boolean {
  const { centerX, centerY } = this.scene.cameras.main;
  return this.dynamicSafeZone.contains(centerX, centerY);
}
```

### 2. Velocity Tracking (EMA)

```typescript
private velocity = { x: 0, y: 0 };
private acceleration = { x: 0, y: 0 };
private lastPosition = { x: 0, y: 0 };
private lastUpdateTime = 0;

private updateVelocityAndAcceleration(): void {
  const now = performance.now();
  const { centerX, centerY } = this.scene.cameras.main;

  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;

  const deltaTime = now - this.lastUpdateTime;
  if (deltaTime < 1 || deltaTime > 1000) {
    this.lastUpdateTime = now;
    this.lastPosition = { x: centerX, y: centerY };
    return;
  }

  const instantVelX = (centerX - this.lastPosition.x) / deltaTime;
  const instantVelY = (centerY - this.lastPosition.y) / deltaTime;
  const instantSpeed = Math.sqrt(instantVelX ** 2 + instantVelY ** 2);

  // Телепортация — сброс и центрирование
  if (instantSpeed > 20) {
    this.velocity = { x: 0, y: 0 };
    this.acceleration = { x: 0, y: 0 };
    this.updateTargetPosition('center');
    return;
  }

  // EMA сглаживание
  const alpha = this.VELOCITY_SMOOTHING;
  const newVelX = this.velocity.x * alpha + instantVelX * (1 - alpha);
  const newVelY = this.velocity.y * alpha + instantVelY * (1 - alpha);

  this.acceleration.x = (newVelX - this.velocity.x) / deltaTime;
  this.acceleration.y = (newVelY - this.velocity.y) / deltaTime;

  this.velocity.x = Phaser.Math.Clamp(newVelX, -this.MAX_SPEED, this.MAX_SPEED);
  this.velocity.y = Phaser.Math.Clamp(newVelY, -this.MAX_SPEED, this.MAX_SPEED);

  this.lastPosition = { x: centerX, y: centerY };
  this.lastUpdateTime = now;
  this.updateDynamicSafeZone();
}

private getSpeed(): number {
  return Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
}

private isCameraStopped(): boolean {
  return this.getSpeed() < this.STOP_THRESHOLD;
}
```

### 3. Predictive Analysis

```typescript
private predictCameraPosition(timeAheadMs: number): { x: number; y: number } {
  const { centerX, centerY } = this.scene.cameras.main;
  const t = timeAheadMs;
  // pos = pos₀ + v*t + 0.5*a*t²
  return {
    x: centerX + this.velocity.x * t + 0.5 * this.acceleration.x * t * t,
    y: centerY + this.velocity.y * t + 0.5 * this.acceleration.y * t * t,
  };
}

private predictLayerNeed(): { direction: { x: -1|0|1; y: -1|0|1 } } | null {
  if (this.isCameraStopped()) return null;

  const predicted = this.predictCameraPosition(this.PREDICTION_TIME);
  const layer = this.getActiveLayer();
  const predictedTile = layer.worldToTileXY(predicted.x, predicted.y);

  // За пределами слоя
  if (!predictedTile) {
    const bounds = layer.getBounds();
    return {
      direction: {
        x: predicted.x < bounds.left ? -1 : predicted.x > bounds.right ? 1 : 0,
        y: predicted.y < bounds.top ? -1 : predicted.y > bounds.bottom ? 1 : 0,
      },
    };
  }

  const speed = this.getSpeed();
  const dirX = this.velocity.x / speed;
  const dirY = this.velocity.y / speed;
  const { width: w, height: h } = this.tilemap;

  // Адаптивные границы
  const isHDominant = Math.abs(dirX) > Math.abs(dirY) * this.DIRECTION_DOMINANCE_RATIO;
  const isVDominant = Math.abs(dirY) > Math.abs(dirX) * this.DIRECTION_DOMINANCE_RATIO;

  const direction: { x: -1|0|1; y: -1|0|1 } = { x: 0, y: 0 };
  let needsUpdate = false;

  if (Math.abs(dirX) > 0.1) {
    const threshold = isHDominant ? this.AGGRESSIVE_THRESHOLD : this.BASE_THRESHOLD;
    const edge = Math.round(w * threshold);
    if (dirX < 0 && predictedTile.x < edge) { direction.x = -1; needsUpdate = true; }
    else if (dirX > 0 && predictedTile.x > w - edge) { direction.x = 1; needsUpdate = true; }
  }

  if (Math.abs(dirY) > 0.1) {
    const threshold = isVDominant ? this.AGGRESSIVE_THRESHOLD : this.BASE_THRESHOLD;
    const edge = Math.round(h * threshold);
    if (dirY < 0 && predictedTile.y < edge) { direction.y = -1; needsUpdate = true; }
    else if (dirY > 0 && predictedTile.y > h - edge) { direction.y = 1; needsUpdate = true; }
  }

  return needsUpdate ? { direction } : null;
}
```

### 4. Target State + Priority Queue

```typescript
interface LayerOperation {
  type: 'movement' | 'center';
  priority: number;
  direction?: { x: -1|0|1; y: -1|0|1 };
  timestamp: number;
}

private targetLayerPos: { x: number; y: number } | null = null;
private currentLayerPos!: { x: number; y: number };
private isGenerating = false;
private operationQueue: LayerOperation[] = [];

private updateTargetPosition(type: 'movement' | 'center', direction?: { x: -1|0|1; y: -1|0|1 }): void {
  const priority = type === 'movement' ? this.PRIORITY.MOVEMENT : this.PRIORITY.CENTER;

  // Movement вытесняет center
  if (priority === this.PRIORITY.MOVEMENT) {
    this.operationQueue = this.operationQueue.filter(op => op.priority >= this.PRIORITY.MOVEMENT);
  }

  this.operationQueue.push({ type, priority, direction, timestamp: performance.now() });
  this.operationQueue.sort((a, b) => b.priority - a.priority);
  if (this.operationQueue.length > this.MAX_QUEUE_SIZE) {
    this.operationQueue = this.operationQueue.slice(0, this.MAX_QUEUE_SIZE);
  }

  // Вычисляем целевую позицию
  if (type === 'center') {
    const { centerX, centerY } = this.scene.cameras.main;
    const { width: w, height: h } = this.tilemap;
    const X = Math.round((centerX - (w * TILE_SIZE) / 2) / TILE_SIZE);
    const Y = Math.round((centerY - (h * TILE_SIZE) / 2) / TILE_SIZE);
    this.targetLayerPos = { x: X * TILE_SIZE, y: Y * TILE_SIZE };
  } else if (direction) {
    const { width, height } = this.tilemap;
    const { left, right, top, bottom } = this.scene.cameras.main.worldView;
    const offsetX = direction.x > 0 ? Math.round(left / TILE_SIZE) - 2
      : direction.x < 0 ? Math.round(right / TILE_SIZE) + 2 - width
      : Math.round(this.getActiveLayer().x / TILE_SIZE);
    const offsetY = direction.y > 0 ? Math.round(top / TILE_SIZE) - 2
      : direction.y < 0 ? Math.round(bottom / TILE_SIZE) + 2 - height
      : Math.round(this.getActiveLayer().y / TILE_SIZE);
    this.targetLayerPos = { x: offsetX * TILE_SIZE, y: offsetY * TILE_SIZE };
  }
}
```

### 5. Save Worker Integration

Используем существующий `saveWorker.ts` через comlink API.

```typescript
import { getSaveWorker } from '@/workers/saveWorkerProxy';

private async generateLayerData(targetPos: { x: number; y: number }) {
  const { width: widthTiles, height: heightTiles } = this.tilemap;
  const offsetTilesX = Math.round(targetPos.x / TILE_SIZE);
  const offsetTilesY = Math.round(targetPos.y / TILE_SIZE);

  const tileLayerData = await getSaveWorker().getTileLayerData({
    widthTiles, heightTiles, offsetTilesX, offsetTilesY,
  });

  return { X: offsetTilesX * TILE_SIZE, Y: offsetTilesY * TILE_SIZE, tileLayerData };
}

private applyLayerData(data: { X: number; Y: number; tileLayerData: number[][] }): void {
  const inactiveLayer = this.tileLayers[1];
  inactiveLayer.setVisible(false).setPosition(data.X, data.Y)
    .putTilesAt(data.tileLayerData, 0, 0).setVisible(true);
  this.tileLayers.reverse();
  this.offsetTiles.X = data.X / TILE_SIZE;
  this.offsetTiles.Y = data.Y / TILE_SIZE;
  this.tileLayers[1].setVisible(false);
}
```

### 6. Motion Check & Debounce

```typescript
private motionTimer?: Phaser.Time.TimerEvent;
private centerDebounceTimer?: Phaser.Time.TimerEvent;

private getAdaptiveCheckInterval(): number {
  const speed = this.getSpeed();
  if (speed > 2.0) return 50;   // быстрое
  if (speed > 0.8) return 100;  // умеренное
  return 200;                    // покой
}

private onMotionCheck(): void {
  this.updateVelocityAndAcceleration();

  if (this.isCameraStopped()) {
    this.scheduleCenterOnStop();
    return;
  }

  this.cancelCenterDebounce();
  const prediction = this.predictLayerNeed();
  if (prediction) {
    this.updateTargetPosition('movement', prediction.direction);
  }
  this.tryProcessTargetState();
  this.adaptMotionTimerInterval();
}

private scheduleCenterOnStop(): void {
  if (this.centerDebounceTimer) {
    this.centerDebounceTimer.destroy();
  }
  this.centerDebounceTimer = this.scene.time.delayedCall(
    this.CENTER_DEBOUNCE_DELAY,
    () => {
      if (this.isCameraStopped()) {
        this.updateTargetPosition('center');
        this.tryProcessTargetState();
      }
      this.centerDebounceTimer = undefined;
    }
  );
}

private cancelCenterDebounce(): void {
  this.centerDebounceTimer?.destroy();
  this.centerDebounceTimer = undefined;
}

private adaptMotionTimerInterval(): void {
  const newInterval = this.getAdaptiveCheckInterval();
  if (this.motionTimer && this.motionTimer.delay !== newInterval) {
    this.motionTimer.destroy();
    this.motionTimer = this.scene.time.addEvent({
      delay: newInterval, callback: () => this.onMotionCheck(), loop: true,
    });
  }
}
```

### 7. Target State Processing

```typescript
private async tryProcessTargetState(): Promise<void> {
  if (this.isGenerating || !this.targetLayerPos) return;
  if (Math.abs(this.currentLayerPos.x - this.targetLayerPos.x) < 1 &&
      Math.abs(this.currentLayerPos.y - this.targetLayerPos.y) < 1) return;

  const operation = this.operationQueue.shift();
  if (!operation) return;

  this.isGenerating = true;
  try {
    const layerData = await this.generateLayerData(this.targetLayerPos);
    this.applyLayerData(layerData);
    this.currentLayerPos = { ...this.targetLayerPos };
    this.updateDynamicSafeZone();
  } catch (error) {
    console.error('Layer generation failed:', error);
  } finally {
    this.isGenerating = false;
    if (this.operationQueue.length > 0) {
      this.scene.time.delayedCall(16, () => this.tryProcessTargetState());
    }
  }
}
```

---

## Структура TilemapController

### Новые свойства

```typescript
// Safe Zone
private dynamicSafeZone!: Phaser.Geom.Rectangle;

// Velocity
private velocity = { x: 0, y: 0 };
private acceleration = { x: 0, y: 0 };
private lastPosition = { x: 0, y: 0 };
private lastUpdateTime = 0;

// Target State
private targetLayerPos: { x: number; y: number } | null = null;
private currentLayerPos!: { x: number; y: number };
private isGenerating = false;
private operationQueue: LayerOperation[] = [];

// Timers
private motionTimer?: Phaser.Time.TimerEvent;
private centerDebounceTimer?: Phaser.Time.TimerEvent;
```

### Константы

| Константа                   | Значение  | Описание                |
| --------------------------- | --------- | ----------------------- |
| `BASE_SAFE_ZONE_RATIO`      | 0.4       | Размер Safe Zone (40%)  |
| `LOOKAHEAD_TIME`            | 200 мс    | Расширение зоны         |
| `VELOCITY_SMOOTHING`        | 0.7       | EMA коэффициент         |
| `STOP_THRESHOLD`            | 0.5 px/ms | Порог остановки         |
| `MAX_SPEED`                 | 10 px/ms  | Защита от артефактов    |
| `PREDICTION_TIME`           | 300 мс    | Время предсказания      |
| `BASE_THRESHOLD`            | 0.33      | Обычная граница         |
| `AGGRESSIVE_THRESHOLD`      | 0.50      | Агрессивная граница     |
| `DIRECTION_DOMINANCE_RATIO` | 1.2       | Доминанта направления   |
| `MAX_QUEUE_SIZE`            | 3         | Размер очереди          |
| `CENTER_DEBOUNCE_DELAY`     | 600 мс    | Задержка центрирования  |
| `PRIORITY.MOVEMENT`         | 10        | Приоритет движения      |
| `PRIORITY.CENTER`           | 1         | Приоритет центрирования |

### Конструктор

```typescript
constructor(scene: Scene) {
  // ... существующая инициализация ...

  const { centerX, centerY } = this.scene.cameras.main;
  this.lastPosition = { x: centerX, y: centerY };
  this.lastUpdateTime = performance.now();

  this.centerLayerOnCamera();
  const activeLayer = this.getActiveLayer();
  this.currentLayerPos = { x: activeLayer.x, y: activeLayer.y };

  this.dynamicSafeZone = new Phaser.Geom.Rectangle(0, 0, 0, 0);
  this.updateDynamicSafeZone();

  this.motionTimer = this.scene.time.addEvent({
    delay: this.getAdaptiveCheckInterval(),
    callback: () => this.onMotionCheck(),
    loop: true,
  });
}
```

### destroy()

```typescript
public destroy(): void {
  this.motionTimer?.destroy();
  this.centerDebounceTimer?.destroy();
  this.motionTimer = undefined;
  this.centerDebounceTimer = undefined;
  this.targetLayerPos = null;
  this.operationQueue = [];
}
```

---

## Изменения в MainScene

**УДАЛИТЬ:** `tilemapStreamingTimer` и связанный код.

**update():**

```typescript
update(time: number, delta: number) {
  super.update(time, delta);

  // Fast Path — 80% выходят здесь
  if (this.tilemapController.isCameraInSafeZone()) {
    this.renderGameplay();
    return;
  }
  this.renderGameplay();
}

private renderGameplay(): void {
  this.cameraMoveController.handleMovement(delta);
  this.tilemapController.renderGrid(this.cameras.main, useUIStore().showGrid);
}
```

**destroy():**

```typescript
destroy() {
  this.tilemapController?.destroy();
  super.destroy();
}
```

---

## Edge Cases

| Случай                       | Обработка                                        |
| ---------------------------- | ------------------------------------------------ |
| **Телепортация** (>20 px/ms) | Сброс velocity, немедленное center               |
| **Низкий FPS** (<20)         | deltaTime > 50мс → alpha = 0.9                   |
| **Пауза**                    | Phaser TimerEvent автоматически                  |
| **Ошибка Worker**            | Comlink обрабатывает, повтор при следующем check |

---

## План имплементации

| Этап              | Задачи                                                               | Время |
| ----------------- | -------------------------------------------------------------------- | ----- |
| 1. Инфраструктура | Добавить свойства, типы, интерфейсы                                  | 2ч    |
| 2. Safe Zone      | `updateDynamicSafeZone()`, `isCameraInSafeZone()`                    | 1ч    |
| 3. Velocity       | `updateVelocityAndAcceleration()`, `getSpeed()`, `isCameraStopped()` | 2ч    |
| 4. Prediction     | `predictCameraPosition()`, `predictLayerNeed()`                      | 2ч    |
| 5. Target State   | `updateTargetPosition()`, очередь приоритетов                        | 2ч    |
| 6. Worker         | `generateLayerData()`, `applyLayerData()`, `tryProcessTargetState()` | 1ч    |
| 7. Timer/Debounce | `onMotionCheck()`, `scheduleCenterOnStop()`                          | 2ч    |
| 8. Cleanup        | Удалить старый код, `destroy()`, edge cases                          | 1ч    |
| 9. Тестирование   | 10 сценариев (см. ниже)                                              | 2ч    |
| 10. Калибровка    | Настройка констант по метрикам                                       | 1ч    |

**Тестовые сценарии:**

1. Движение вправо → слой создаётся проактивно
2. Остановка → центрирование через 600мс
3. Поворот (влево→вверх) → корректное направление
4. Движение вдоль границы → нет ложных срабатываний
5. Быстрое движение → адаптивный интервал
6. Параллельные запросы → очередь работает
7. Краткая остановка → нет центрирования
8. Телепортация → сброс и центрирование
9. Низкий FPS → адаптация
10. Ошибка Worker → восстановление

---

## Возможные улучшения saveWorker (опционально)

После профилирования можно добавить:

1. **Кэширование слоёв** — `Map<cacheKey, { data, timestamp }>` с TTL
2. **Prefetch соседних областей** — `prefetchNeighborLayers(direction)`
3. **Приоритеты в воркере** — параметр `priority: 'high' | 'normal' | 'low'`
4. **Batch операции** — `getTileLayerDataBatch(requests[])`

---

## Контрольный список

При потере контекста:

1. Изучить "Обзор" и архитектурную схему
2. Просмотреть "Компоненты" (7 разделов с кодом)
3. Проверить этап в "План имплементации"
4. При проблемах — "Edge Cases"
5. Диагностика через `getMetrics()`
