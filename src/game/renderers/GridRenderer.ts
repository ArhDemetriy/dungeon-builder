import type { Cameras, GameObjects, Scene, Tilemaps } from 'phaser';

import { GRID_CONFIG, TILE_INDEX, TILE_SIZE } from '@/game/constants';
import { useLevelStore } from '@/store/levelStore';
import type { GridTile } from '@/types/level';
import { parseTileKey } from '@/types/level';

export class GridRenderer {
  private tilemap: Tilemaps.Tilemap;
  private tileset: Tilemaps.Tileset;
  private wallLayer: Tilemaps.TilemapLayer;
  private floorLayer: Tilemaps.TilemapLayer;
  private portalLayer: Tilemaps.TilemapLayer;
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
    this.tileset = this.tilemap.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, 0)!;

    // Создаём слои (порядок определяет z-index)
    this.floorLayer = this.tilemap.createBlankLayer('floors', this.tileset)!;
    this.wallLayer = this.tilemap.createBlankLayer('walls', this.tileset)!;
    this.portalLayer = this.tilemap.createBlankLayer('portals', this.tileset)!;

    // Graphics для сетки
    this.gridGraphics = scene.add.graphics();
  }

  loadLevel(levelId: string) {
    const { levels } = useLevelStore.getState();
    const level = levels.get(levelId);
    if (!level) return;

    // Очищаем все слои
    this.wallLayer.fill(TILE_INDEX.EMPTY);
    this.floorLayer.fill(TILE_INDEX.EMPTY);
    this.portalLayer.fill(TILE_INDEX.EMPTY);

    // Загружаем все тайлы из store
    level.tiles.forEach((tile, key) => {
      const { x, y } = parseTileKey(key);
      this.updateTile(x, y, tile);
    });
  }

  updateTile(x: number, y: number, tile: GridTile) {
    // Очищаем все слои в этой позиции
    this.wallLayer.removeTileAt(x, y);
    this.floorLayer.removeTileAt(x, y);
    this.portalLayer.removeTileAt(x, y);

    // Размещаем тайл на нужном слое
    switch (tile.type) {
      case 'wall':
        this.wallLayer.putTileAt(TILE_INDEX.WALL, x, y);
        break;
      case 'floor':
        this.floorLayer.putTileAt(TILE_INDEX.FLOOR, x, y);
        break;
      case 'unlinked-portal':
        this.portalLayer.putTileAt(TILE_INDEX.UNLINKED_PORTAL, x, y);
        break;
      case 'portal':
        this.portalLayer.putTileAt(TILE_INDEX.PORTAL, x, y);
        break;
    }
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
