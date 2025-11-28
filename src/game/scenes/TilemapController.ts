import { isEqual } from 'lodash-es';
import Phaser from 'phaser';
import type { Cameras, Geom, Scene, Tilemaps, Time } from 'phaser';

import {
  CAMERA_CONFIG,
  TILEMAP_STREAMING_CONFIG,
  TILE_INDEX,
  TILE_SIZE,
  TILE_SPACING,
  TILE_TEXTURE_KEY,
} from '@/game/constants';
import {
  type Direction,
  type DirectionVector,
  type VelocityState,
  isZeroVector,
} from '@/game/scenes/tilemapStreaming.types';
import type { GridTile } from '@/types/level';
import { getSaveWorker } from '@/workers/saveWorkerProxy';

export class TilemapController {
  private readonly offsetTiles = { X: 0, Y: 0 };
  private readonly scene: Scene;
  private readonly tilemap: Tilemaps.Tilemap;
  private readonly tileLayers: [Tilemaps.TilemapLayer, Tilemaps.TilemapLayer];

  // === Safe Zone ===
  // Прямоугольник в центре слоя — камера внутри = Fast Path (нет проверок)
  private readonly dynamicSafeZone = new Phaser.Geom.Rectangle(0, 0, 0, 0);

  // === Velocity Tracking ===
  // EMA-сглаженная скорость и ускорение для предсказания траектории
  private readonly velocityState: VelocityState = {
    velocity: { x: 0, y: 0 },
    speed: 0,
    acceleration: { x: 0, y: 0 },
    lastPosition: { x: 0, y: 0 },
    lastUpdateTime: 0,
  };

  // === Target State ===
  // pendingDirection: нулевой вектор = center, ненулевой = movement. Movement вытесняет center.
  private pendingDirection: DirectionVector | null = null;
  private isGenerating = false;

  // === Phaser Timers ===
  // Motion Timer — адаптивная проверка движения (50-200ms)
  // Center Debounce — задержка перед центрированием при остановке
  private readonly motionTimer: Time.TimerEvent;
  private centerDebounceTimer?: Time.TimerEvent;

  constructor(scene: Scene) {
    this.scene = scene;
    const { widthAtTiles, heightAtTiles } = TilemapController.getTilemapSize(this.scene.cameras.main);
    const tilemap = (this.tilemap = this.scene.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: widthAtTiles,
      height: heightAtTiles,
    }));

    const tilesetKey = 'tiles';
    tilemap.addTilesetImage(tilesetKey, TILE_TEXTURE_KEY, TILE_SIZE, TILE_SIZE, 0, TILE_SPACING);

    const layer0 = tilemap.createBlankLayer('layer0', tilesetKey);
    const layer1 = tilemap.createBlankLayer('layer1', tilesetKey);
    if (!layer0 || !layer1) throw new Error('unknown error from createBlankLayer');

    this.tileLayers = [layer0, layer1];

    const { centerX, centerY } = this.scene.cameras.main;
    this.velocityState.lastPosition = { x: centerX, y: centerY };
    this.velocityState.lastUpdateTime = performance.now();

    this.motionTimer = this.scene.time.addEvent({
      delay: this.getAdaptiveCheckInterval(0),
      callback: () => {
        const { speed } = this.updateVelocityAndAcceleration();
        const delay = this.getAdaptiveCheckInterval(speed);
        if (this.motionTimer.delay !== delay) this.motionTimer.reset({ ...this.motionTimer, delay });

        if (this.isCameraInSafeZone()) return;

        const direction = this.predictLayerNeed();
        if (direction) this.tryProcessTargetState(direction);
      },
      loop: true,
      paused: true,
    });

    void this.generateLayerData(this.calculateCenteredLayerOffset())
      .then(data => this.applyLayerData(data))
      .then(() => this.updateSafeZone(this.getActiveLayer().getBounds()))
      .finally(() => (this.motionTimer.paused = false));
  }

  getTileAtWorld({ worldX, worldY }: { worldX: number; worldY: number }) {
    return this.getActiveLayer().getTileAtWorldXY(worldX, worldY);
  }

  // ============================================================
  // === PUBLIC API ===
  // ============================================================

  /**
   * Fast Path проверка — вызывается из MainScene.update().
   *
   * ЗАЧЕМ:
   * - 80% кадров камера внутри Safe Zone → return true → минимум работы
   * - Motion Timer работает независимо, но MainScene может использовать это
   *   для оптимизации других систем
   *
   * ВЗАИМОДЕЙСТВИЕ:
   * - MainScene.update() вызывает это первым
   * - Если true — можно пропустить дополнительные проверки
   */
  public isCameraInSafeZone() {
    const { centerX, centerY } = this.scene.cameras.main;
    return this.dynamicSafeZone.contains(centerX, centerY);
  }

  /**
   * Освобождает ресурсы при уничтожении сцены.
   *
   * ВАЖНО вызвать в MainScene.destroy() для предотвращения утечек памяти.
   */
  public destroy(): void {
    this.motionTimer.destroy();
    this.centerDebounceTimer?.destroy();
    this.centerDebounceTimer = undefined;
    this.pendingDirection = null;
  }

  // ============================================================
  // === SAFE ZONE ===
  // ============================================================

  /**
   * Обновляет Safe Zone — статичный прямоугольник в центре слоя.
   *
   * ЗАЧЕМ:
   * - Fast Path: камера в центральных 40% слоя → 100% не нужен новый слой
   * - Пропускаем predictLayerNeed() — экономим несколько микросекунд
   *
   * ПОЧЕМУ СТАТИЧНАЯ:
   * - Динамическое смещение дублирует логику predictLayerNeed()
   * - predictLayerNeed() точнее — учитывает границы слоя и направление
   * - Статичная зона проще и надёжнее
   */
  private updateSafeZone({ centerX, centerY, width, height }: Geom.Rectangle) {
    const { baseSafeZoneRatio } = TILEMAP_STREAMING_CONFIG;
    const halfWidth = Math.round((width * baseSafeZoneRatio) / 2);
    const halfHeight = Math.round((height * baseSafeZoneRatio) / 2);
    this.dynamicSafeZone.setTo(centerX - halfWidth, centerY - halfHeight, halfWidth * 2, halfHeight * 2);
  }

  // ============================================================
  // === VELOCITY TRACKING ===
  // ============================================================

  /**
   * Вычисляет скорость и ускорение камеры с EMA сглаживанием.
   *
   * АЛГОРИТМ:
   * 1. Мгновенная скорость = (pos - lastPos) / deltaTime
   * 2. EMA: newVel = oldVel * alpha + instantVel * (1 - alpha)
   * 3. Ускорение = (newVel - oldVel) / deltaTime
   *
   * ГРАНИЧНЫЕ СЛУЧАИ:
   * - deltaTime < 1ms или > 1000ms → пропуск (пауза, лаг)
   * - instantSpeed > teleportThreshold → телепортация → сброс + center
   * - NaN/Infinity в позиции → пропуск
   *
   * ВЗАИМОДЕЙСТВИЕ:
   * - Вызывается из onMotionCheck() каждые 50-200мс
   * - Результат используется в predictCameraPosition()
   */
  private updateVelocityAndAcceleration() {
    const { centerX, centerY } = this.scene.cameras.main;
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return this.velocityState;

    const now = performance.now();
    const deltaTime = now - this.velocityState.lastUpdateTime;
    // Защита от аномалий времени (пауза игры, потеря фокуса)
    if (deltaTime < 1 || deltaTime > 1000) {
      this.velocityState.lastUpdateTime = now;
      this.velocityState.lastPosition = { x: centerX, y: centerY };
      return this.velocityState;
    }

    const { velocitySmoothing, maxSpeed, teleportThreshold } = TILEMAP_STREAMING_CONFIG;

    const instantVelX = (centerX - this.velocityState.lastPosition.x) / deltaTime;
    const instantVelY = (centerY - this.velocityState.lastPosition.y) / deltaTime;
    const instantSpeed = Math.sqrt(instantVelX ** 2 + instantVelY ** 2);

    // Телепортация — сброс состояния и немедленное центрирование
    if (instantSpeed > teleportThreshold) {
      this.velocityState.velocity = { x: 0, y: 0 };
      this.velocityState.speed = 0;
      this.velocityState.acceleration = { x: 0, y: 0 };
      this.velocityState.lastPosition = { x: centerX, y: centerY };
      this.velocityState.lastUpdateTime = now;
      this.tryProcessTargetState({ x: 0, y: 0 });
      return this.velocityState;
    }

    // EMA сглаживание — устраняет дрожание
    const alpha = velocitySmoothing;
    const newVelX = this.velocityState.velocity.x * alpha + instantVelX * (1 - alpha);
    const newVelY = this.velocityState.velocity.y * alpha + instantVelY * (1 - alpha);

    // Ускорение для квадратичной экстраполяции
    this.velocityState.acceleration = {
      x: (newVelX - this.velocityState.velocity.x) / deltaTime,
      y: (newVelY - this.velocityState.velocity.y) / deltaTime,
    };

    // Clamp — защита от артефактов
    const clampedVelX = Phaser.Math.Clamp(newVelX, -maxSpeed, maxSpeed);
    const clampedVelY = Phaser.Math.Clamp(newVelY, -maxSpeed, maxSpeed);

    this.velocityState.velocity = { x: clampedVelX, y: clampedVelY };
    this.velocityState.speed = Math.sqrt(clampedVelX ** 2 + clampedVelY ** 2);
    this.velocityState.lastPosition = { x: centerX, y: centerY };
    this.velocityState.lastUpdateTime = now;
    return this.velocityState;
  }

  /** Камера считается остановленной при speed < stopThreshold */
  private isCameraStopped() {
    return this.velocityState.speed < TILEMAP_STREAMING_CONFIG.stopThreshold;
  }

  // ============================================================
  // === PREDICTIVE ANALYSIS ===
  // ============================================================

  /**
   * Определяет, нужен ли новый слой на основе предсказания.
   *
   * ЛОГИКА:
   * 1. Предсказываем позицию через PREDICTION_TIME
   * 2. Если за пределами слоя → нужен новый
   * 3. Если близко к краю в направлении движения → нужен новый
   *
   * АДАПТИВНЫЕ ГРАНИЦЫ:
   * - При горизонтальном движении: aggressive (50%) по X, base (33%) по Y
   * - При диагональном: base по обеим осям
   *
   * ВОЗВРАТ:
   * - null → слой не нужен
   * - { direction } → нужен слой в указанном направлении
   */
  private predictLayerNeed() {
    if (this.isCameraStopped()) {
      this.scheduleCenterOnStop();
      return;
    }
    this.cancelCenterDebounce();

    const { predictionTime, baseThreshold, aggressiveThreshold, directionDominanceRatio } = TILEMAP_STREAMING_CONFIG;
    const { centerX, centerY } = this.scene.cameras.main;
    const { velocity, acceleration, speed } = this.velocityState;

    // Квадратичная экстраполяция: pos = pos₀ + v*t + 0.5*a*t²
    const predicted = {
      x: centerX + velocity.x * predictionTime + 0.5 * acceleration.x * predictionTime ** 2,
      y: centerY + velocity.y * predictionTime + 0.5 * acceleration.y * predictionTime ** 2,
    };

    const layer = this.getActiveLayer();
    const predictedTile = layer.worldToTileXY(predicted.x, predicted.y);

    // Камера выйдет за пределы слоя
    if (!predictedTile) {
      const bounds = layer.getBounds();
      return {
        x: predicted.x < bounds.left ? -1 : predicted.x > bounds.right ? 1 : 0,
        y: predicted.y < bounds.top ? -1 : predicted.y > bounds.bottom ? 1 : 0,
      } satisfies DirectionVector;
    }

    // Нормализованное направление движения
    const dirX = velocity.x / speed;
    const dirY = velocity.y / speed;
    const { width: w, height: h } = this.tilemap;

    // Адаптивные пороги: aggressive при доминирующем направлении
    const isHDominant = Math.abs(dirX) > Math.abs(dirY) * directionDominanceRatio;
    const isVDominant = Math.abs(dirY) > Math.abs(dirX) * directionDominanceRatio;

    const edgeX = Math.round(w * (isHDominant ? aggressiveThreshold : baseThreshold));
    const edgeY = Math.round(h * (isVDominant ? aggressiveThreshold : baseThreshold));

    const x: Direction =
      Math.abs(dirX) > 0.1
        ? dirX < 0 && predictedTile.x < edgeX
          ? -1
          : dirX > 0 && predictedTile.x > w - edgeX
            ? 1
            : 0
        : 0;

    const y: Direction =
      Math.abs(dirY) > 0.1
        ? dirY < 0 && predictedTile.y < edgeY
          ? -1
          : dirY > 0 && predictedTile.y > h - edgeY
            ? 1
            : 0
        : 0;

    if (x || y) return { x, y } satisfies DirectionVector;
  }

  // ============================================================
  // === TARGET STATE + PRIORITY QUEUE ===
  // ============================================================

  /**
   * Offset слоя, центрированного на камере.
   * @returns X, Y — координаты в тайлах
   */
  private calculateCenteredLayerOffset() {
    const { centerX, centerY } = this.scene.cameras.main;
    const { width: w, height: h } = this.tilemap;
    return {
      X: Math.round((centerX - (w * TILE_SIZE) / 2) / TILE_SIZE),
      Y: Math.round((centerY - (h * TILE_SIZE) / 2) / TILE_SIZE),
    };
  }

  /**
   * Offset слоя, смещённого в направлении движения.
   * @returns X, Y — координаты в тайлах
   */
  private calculateShiftedLayerOffset(direction: DirectionVector) {
    const { width, height } = this.tilemap;
    const { left, right, top, bottom } = this.scene.cameras.main.worldView;

    return {
      X:
        direction.x > 0
          ? Math.round(left / TILE_SIZE) - 2
          : direction.x < 0
            ? Math.round(right / TILE_SIZE) + 2 - width
            : this.offsetTiles.X,
      Y:
        direction.y > 0
          ? Math.round(top / TILE_SIZE) - 2
          : direction.y < 0
            ? Math.round(bottom / TILE_SIZE) + 2 - height
            : this.offsetTiles.Y,
    };
  }

  // ============================================================
  // === SAVE WORKER INTEGRATION ===
  // ============================================================

  /**
   * Генерирует данные слоя через saveWorker.
   *
   * ВАЖНО:
   * - Выполняется в отдельном потоке (Web Worker)
   * - Не блокирует Main Thread
   * - Использует существующий API saveWorker.getTileLayerData()
   *
   * @param X, Y — координаты в тайлах
   */
  private async generateLayerData({ X, Y }: { X: number; Y: number }) {
    const { width: widthTiles, height: heightTiles } = this.tilemap;
    const tileLayerData = await getSaveWorker().getTileLayerData({
      widthTiles,
      heightTiles,
      offsetTilesX: X,
      offsetTilesY: Y,
    });

    return { X, Y, tileLayerData };
  }

  /**
   * Применяет данные к неактивному слою и переключает слои.
   *
   * ПАТТЕРН: Double Buffering
   * - Записываем в tileLayers[1] (невидимый)
   * - Делаем видимым
   * - Меняем местами [0] и [1]
   * - Скрываем новый [1]
   *
   * @param data.X, data.Y — координаты в тайлах (умножаем на TILE_SIZE для пикселей)
   */
  private applyLayerData(data: { X: number; Y: number; tileLayerData: number[][] }): void {
    this.tileLayers[1]
      .setVisible(false)
      .setPosition(data.X * TILE_SIZE, data.Y * TILE_SIZE)
      .putTilesAt(data.tileLayerData, 0, 0)
      .setVisible(true);

    this.tileLayers.reverse();
    this.offsetTiles.X = data.X;
    this.offsetTiles.Y = data.Y;
    this.tileLayers[1].setVisible(false);
  }

  /**
   * Генерирует слой если есть pending операция.
   *
   * @param direction — нулевой вектор = center, ненулевой = movement
   *
   * ЛОГИКА:
   * - Если уже генерируем → выход
   * - Вычисляем позицию в момент генерации (точнее чем при запросе)
   * - Если цель достигнута → выход
   * - Генерируем → применяем → обновляем Safe Zone
   */
  private async tryProcessTargetState(direction: DirectionVector): Promise<void> {
    const isCenter = isZeroVector(direction);
    if (this.isGenerating) {
      if (!this.pendingDirection || !isCenter) this.pendingDirection = direction; // center не может вытеснить movement
      return;
    } else {
      this.pendingDirection = null;
    }

    const targetPos = isCenter ? this.calculateCenteredLayerOffset() : this.calculateShiftedLayerOffset(direction);
    if (this.offsetTiles.X === targetPos.X && this.offsetTiles.Y === targetPos.Y) return; // Цель достигнута — слой уже в нужной позиции

    this.isGenerating = true;
    const layerData = await this.generateLayerData(targetPos).catch(error => {
      console.error('[TilemapStreaming] Layer generation failed:', error);
    });
    this.isGenerating = false;
    if (this.pendingDirection && !isEqual(direction, this.pendingDirection))
      return this.tryProcessTargetState(this.pendingDirection);
    if (this.offsetTiles.X === targetPos.X && this.offsetTiles.Y === targetPos.Y) return;
    if (!layerData) return;

    this.applyLayerData(layerData);
    this.updateSafeZone(this.getActiveLayer().getBounds());
  }

  // ============================================================
  // === MOTION TIMER + DEBOUNCE ===
  // ============================================================

  /**
   * Адаптивный интервал проверки в зависимости от скорости.
   *
   * ЗАЧЕМ:
   * - Быстрое движение (>2 px/ms) → частые проверки (50ms)
   * - Медленное движение → редкие проверки (200ms)
   * - Экономия CPU при статичной камере
   */
  private getAdaptiveCheckInterval(speed: number): number {
    const { timerIntervals, stopThreshold } = TILEMAP_STREAMING_CONFIG;
    if (speed > 2.0) return timerIntervals.fast;
    if (speed > stopThreshold) return timerIntervals.medium;
    return timerIntervals.slow;
  }

  /**
   * Планирует центрирование после остановки с debounce.
   *
   * ЗАЧЕМ:
   * - Предотвращает центрирование при кратких остановках
   * - 600ms достаточно для определения "реальной" остановки
   */
  private scheduleCenterOnStop(): void {
    // Если таймер уже запущен, не создаём новый
    if (this.centerDebounceTimer) return;

    this.centerDebounceTimer = this.scene.time.delayedCall(TILEMAP_STREAMING_CONFIG.centerDebounceDelay, () => {
      if (!this.centerDebounceTimer) return;
      this.centerDebounceTimer = undefined;
      if (this.isCameraStopped()) this.tryProcessTargetState({ x: 0, y: 0 });
    });
  }
  private cancelCenterDebounce(): void {
    this.centerDebounceTimer?.destroy();
    this.centerDebounceTimer = undefined;
  }

  // ============================================================
  // === LEGACY / INTERNAL ===
  // ============================================================

  private static getTilemapSize(camera: Cameras.Scene2D.Camera) {
    const tilemapSizeMultiplier = 2;
    const k = tilemapSizeMultiplier / CAMERA_CONFIG.minZoom / TILE_SIZE;
    return { widthAtTiles: Math.ceil(k * camera.width), heightAtTiles: Math.ceil(k * camera.height) };
  }

  private getActiveLayer() {
    return this.tileLayers[0];
  }

  updateTile(x: number, y: number, { type }: GridTile) {
    const tileIndex = TILE_INDEX[type];
    if (tileIndex === undefined) return;

    this.getActiveLayer().putTileAt(tileIndex, x - this.offsetTiles.X, y - this.offsetTiles.Y);
  }
}
