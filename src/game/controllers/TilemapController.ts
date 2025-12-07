import { isEqual } from 'lodash-es';
import { type Cameras, Geom, Math as PMath, type Scene, type Tilemaps, type Time } from 'phaser';

import {
  CAMERA_CONFIG,
  TILEMAP_STREAMING_CONFIG,
  TILE_MARGIN,
  TILE_SIZE,
  TILE_SPACING,
  TILE_TEXTURE_KEY,
} from '@/game/constants';
import type { TileIndexes } from '@/types/level';
import { getSaveWorker } from '@/workers/saveWorkerProxy';

/** Направление смещения слоя: -1 (влево/вверх), 0 (нет), 1 (вправо/вниз) */
type Direction = -1 | 0 | 1;
type DirectionVector = { x: Direction; y: Direction };
function isZeroVector(vector: DirectionVector): vector is { x: 0; y: 0 } {
  return !(vector.x || vector.y);
}

/**
 * Состояние velocity tracking.
 *
 * ЗАЧЕМ:
 * - velocity — текущая скорость с EMA сглаживанием
 * - speed — модуль velocity (вычисляется в updateVelocityAndAcceleration)
 * - acceleration — для квадратичной экстраполяции
 * - lastPosition/lastUpdateTime — для вычисления мгновенной скорости
 */
type VelocityState = {
  velocity: { x: number; y: number };
  speed: number;
  acceleration: { x: number; y: number };
  lastPosition: { x: number; y: number };
  lastUpdateTime: number;
};

export class TilemapController {
  private readonly offsetTiles = { X: 0, Y: 0 };
  private readonly scene: Scene;
  private readonly tilemap: Tilemaps.Tilemap;
  private readonly tileLayers: [Tilemaps.TilemapLayer, Tilemaps.TilemapLayer];

  private readonly dynamicSafeZone = new Geom.Rectangle(0, 0, 0, 0);

  // === Velocity Tracking ===
  // EMA-сглаженная скорость и ускорение для предсказания траектории
  private readonly velocityState: VelocityState = {
    velocity: { x: 0, y: 0 },
    speed: 0,
    acceleration: { x: 0, y: 0 },
    lastPosition: { x: 0, y: 0 },
    lastUpdateTime: 0,
  };

  private pendingDirection: DirectionVector | null = null;
  private isGenerating = false;
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
    tilemap.addTilesetImage(tilesetKey, TILE_TEXTURE_KEY, TILE_SIZE, TILE_SIZE, TILE_MARGIN, TILE_SPACING);

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
    return this.getActiveLayer().getTileAtWorldXY(worldX, worldY, true);
  }
  private getActiveLayer() {
    return this.tileLayers[0];
  }

  destroy(): void {
    this.motionTimer.destroy();
    this.centerDebounceTimer?.destroy();
    this.centerDebounceTimer = undefined;
    this.pendingDirection = null;
  }

  private getAdaptiveCheckInterval(speed: number) {
    const { timerIntervals, stopThreshold } = TILEMAP_STREAMING_CONFIG;
    if (speed > 2.0) return timerIntervals.fast;
    if (speed > stopThreshold) return timerIntervals.medium;
    return timerIntervals.slow;
  }

  // ============================================================
  // === VELOCITY TRACKING ===
  // ============================================================

  /**
   * Вычисляет скорость и ускорение камеры с EMA сглаживанием.
   *
   * АЛГОРИТМ:
   * 1. Мгновенная скорость = (pos - lastPos) / deltaTime
   * 2. EMA: newVel = oldVel * α + instantVel * (1 - α)
   * 3. Ускорение = (newVel - oldVel) / deltaTime
   *
   * ГРАНИЧНЫЕ СЛУЧАИ:
   * - deltaTime < 1ms или > 1000ms → пропуск (пауза, лаг)
   * - instantSpeed > teleportThreshold → телепортация → сброс + center
   * - NaN/Infinity в позиции → пропуск
   *
   * ВЗАИМОДЕЙСТВИЕ:
   * - Вызывается из callback motionTimer каждые 50-200мс
   * - Результат используется в predictLayerNeed()
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
    const { velocity: oldVel, lastPosition } = this.velocityState;

    const instantVel = {
      x: (centerX - lastPosition.x) / deltaTime,
      y: (centerY - lastPosition.y) / deltaTime,
    };
    const instantSpeed = Math.sqrt(instantVel.x ** 2 + instantVel.y ** 2);

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

    // EMA сглаживание: newVel = oldVel * α + instantVel * (1 - α)
    const newVel = {
      x: PMath.Clamp(oldVel.x * velocitySmoothing + instantVel.x * (1 - velocitySmoothing), -maxSpeed, maxSpeed),
      y: PMath.Clamp(oldVel.y * velocitySmoothing + instantVel.y * (1 - velocitySmoothing), -maxSpeed, maxSpeed),
    };

    this.velocityState.acceleration = {
      x: (newVel.x - oldVel.x) / deltaTime,
      y: (newVel.y - oldVel.y) / deltaTime,
    };
    this.velocityState.velocity = newVel;
    this.velocityState.speed = Math.sqrt(newVel.x ** 2 + newVel.y ** 2);
    this.velocityState.lastPosition = { x: centerX, y: centerY };
    this.velocityState.lastUpdateTime = now;

    return this.velocityState;
  }

  private isCameraInSafeZone() {
    const { centerX, centerY } = this.scene.cameras.main;
    return this.dynamicSafeZone.contains(centerX, centerY);
  }

  // ============================================================
  // === PREDICTIVE ANALYSIS ===
  // ============================================================

  /**
   * Определяет, нужен ли новый слой на основе предсказания.
   *
   * ЛОГИКА:
   * 1. Если камера остановлена → scheduleCenterOnStop() и выход
   * 2. Предсказываем позицию через predictionTime (квадратичная экстраполяция)
   * 3. Если за пределами слоя → нужен новый
   * 4. Если близко к краю в направлении движения → нужен новый
   *
   * АДАПТИВНЫЕ ГРАНИЦЫ:
   * - При доминирующем направлении: aggressiveThreshold (50%)
   * - При диагональном: baseThreshold (33%) по обеим осям
   *
   * ВОЗВРАТ:
   * - undefined → слой не нужен (или камера остановлена)
   * - DirectionVector → нужен слой в указанном направлении
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
  /** Камера считается остановленной при speed < stopThreshold */
  private isCameraStopped() {
    return this.velocityState.speed < TILEMAP_STREAMING_CONFIG.stopThreshold;
  }

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

  private calculateCenteredLayerOffset() {
    const { centerX, centerY } = this.scene.cameras.main;
    const { width: w, height: h } = this.tilemap;
    return {
      X: Math.round((centerX - (w * TILE_SIZE) / 2) / TILE_SIZE),
      Y: Math.round((centerY - (h * TILE_SIZE) / 2) / TILE_SIZE),
    };
  }
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
  private applyLayerData(data: { X: number; Y: number; tileLayerData: (TileIndexes | -1)[][] }) {
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
  private updateSafeZone({ centerX, centerY, width, height }: Geom.Rectangle) {
    const { baseSafeZoneRatio } = TILEMAP_STREAMING_CONFIG;
    const halfWidth = Math.round((width * baseSafeZoneRatio) / 2);
    const halfHeight = Math.round((height * baseSafeZoneRatio) / 2);
    this.dynamicSafeZone.setTo(centerX - halfWidth, centerY - halfHeight, halfWidth * 2, halfHeight * 2);
  }

  private scheduleCenterOnStop() {
    if (this.centerDebounceTimer) return;

    this.centerDebounceTimer = this.scene.time.delayedCall(TILEMAP_STREAMING_CONFIG.centerDebounceDelay, () => {
      if (!this.centerDebounceTimer) return;
      this.centerDebounceTimer = undefined;
      if (this.isCameraStopped()) this.tryProcessTargetState({ x: 0, y: 0 });
    });
  }
  private cancelCenterDebounce() {
    this.centerDebounceTimer?.destroy();
    this.centerDebounceTimer = undefined;
  }

  private static getTilemapSize(camera: Cameras.Scene2D.Camera) {
    const tilemapSizeMultiplier = 2;
    const k = tilemapSizeMultiplier / CAMERA_CONFIG.minZoom / TILE_SIZE;
    return { widthAtTiles: Math.ceil(k * camera.width), heightAtTiles: Math.ceil(k * camera.height) };
  }

  isTileConnected(x: number, y: number) {
    const X = x - this.offsetTiles.X;
    const Y = y - this.offsetTiles.Y;
    if (X < 0 || Y < 0) return false;
    const layer = this.getActiveLayer();
    return (
      layer.getTileAt(X, Y)?.index >= 0 ||
      layer.getTileAt(X, Y + 1)?.index >= 0 ||
      layer.getTileAt(X, Y - 1)?.index >= 0 ||
      layer.getTileAt(X + 1, Y)?.index >= 0 ||
      layer.getTileAt(X - 1, Y)?.index >= 0
    );
  }
  updateTile(X: number, Y: number, index: TileIndexes) {
    this.getActiveLayer().putTileAt(index, X - this.offsetTiles.X, Y - this.offsetTiles.Y);
  }
}
