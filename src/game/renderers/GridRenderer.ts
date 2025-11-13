import type { Cameras, GameObjects, Scene, Tilemaps } from 'phaser';

import { GRID_CONFIG, TILE_INDEX, TILE_SIZE, TILE_SPACING, TILE_TEXTURE_KEY } from '@/game/constants';
import { useLevelStore } from '@/store/levelStore';
import type { GridTile } from '@/types/level';
import { parseTileKey } from '@/types/level';

export class GridRenderer {
  private tilemap: Tilemaps.Tilemap;
  private tileset: Tilemaps.Tileset;
  private tileLayer: Tilemaps.TilemapLayer;
  private gridGraphics: GameObjects.Graphics;

  constructor(scene: Scene) {
    // Создаём большую пустую карту
    this.tilemap = scene.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: 1000,
      height: 1000,
    });

    // Добавляем tileset с параметрами разбивки текстуры
    // Параметры: name, key, tileWidth, tileHeight, tileMargin, tileSpacing
    // spacing предотвращает texture bleeding (просачивание соседних тайлов)
    this.tileset = this.tilemap.addTilesetImage(
      TILE_TEXTURE_KEY,
      TILE_TEXTURE_KEY,
      TILE_SIZE,
      TILE_SIZE,
      0,
      TILE_SPACING
    )!;

    // Создаём единый слой для всех тайлов
    this.tileLayer = this.tilemap.createBlankLayer('tiles', this.tileset)!;

    // Graphics для сетки
    this.gridGraphics = scene.add.graphics();
  }

  loadLevel(levelId: string) {
    const levelStore = useLevelStore();
    const level = levelStore.levels.get(levelId);
    if (!level) return;

    // Очищаем слой
    this.tileLayer.fill(TILE_INDEX.empty);

    // Загружаем все тайлы из store
    level.tiles.forEach((tile, key) => {
      const { x, y } = parseTileKey(key);
      this.updateTile(x, y, tile);
    });
  }

  updateTile(x: number, y: number, { type }: GridTile) {
    const tileIndex = TILE_INDEX[type];
    if (tileIndex === undefined) return;
    this.tileLayer.putTileAt(tileIndex, x, y);
  }

  renderGrid(camera: Cameras.Scene2D.Camera, showGrid: boolean) {
    if (!showGrid) {
      this.gridGraphics.clear();
      return;
    }

    // Получаем границы видимой области камеры
    const { left, right, top, bottom } = camera.worldView;
    const startTileX = Math.floor(left / TILE_SIZE) - 1;
    const endTileX = Math.ceil(right / TILE_SIZE) + 1;
    const startTileY = Math.floor(top / TILE_SIZE) - 1;
    const endTileY = Math.ceil(bottom / TILE_SIZE) + 1;

    this.gridGraphics.clear();
    this.gridGraphics.lineStyle(1, GRID_CONFIG.color, GRID_CONFIG.alpha);

    // Вертикальные линии
    for (let x = startTileX; x <= endTileX; x++) {
      const worldX = x * TILE_SIZE;
      this.gridGraphics.lineBetween(worldX, startTileY * TILE_SIZE, worldX, endTileY * TILE_SIZE);
    }

    // Горизонтальные линии
    for (let y = startTileY; y <= endTileY; y++) {
      const worldY = y * TILE_SIZE;
      this.gridGraphics.lineBetween(startTileX * TILE_SIZE, worldY, endTileX * TILE_SIZE, worldY);
    }
  }

  destroy() {
    this.tilemap.destroy();
    this.gridGraphics.destroy();
  }
}
