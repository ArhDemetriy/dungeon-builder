import type { Cameras, GameObjects, Scene, Tilemaps } from 'phaser';

import {
  CAMERA_CONFIG,
  DEFAULT_TILE,
  GRID_CONFIG,
  TILE_INDEX,
  TILE_SIZE,
  TILE_SPACING,
  TILE_TEXTURE_KEY,
} from '@/game/constants';
import { useLevelStore } from '@/store/levelStore';
import type { GridTile } from '@/types/level';
import { parseTileKey } from '@/types/level';

export class GridRenderer {
  private tileLayer: Tilemaps.TilemapLayer;
  private gridGraphics: GameObjects.Graphics;
  private offsetTiles: { X: number; Y: number };

  constructor(scene: Scene) {
    const {
      cameras: { main: camera },
    } = scene;
    const { tilemapWidthAtTiles, tilemapHeightAtTiles } = (() => {
      const tailmapSizeMultiplier = 2;
      const k = tailmapSizeMultiplier / CAMERA_CONFIG.minZoom / TILE_SIZE;
      const tilemapWidthAtTiles = Math.ceil(k * camera.width);
      const tilemapHeightAtTiles = Math.ceil(k * camera.height);
      return { tilemapWidthAtTiles, tilemapHeightAtTiles };
    })();
    console.log('tilemap size ', { tilemapWidthAtTiles, tilemapHeightAtTiles });

    const tilemap = scene.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: tilemapWidthAtTiles,
      height: tilemapHeightAtTiles,
    });
    const tilesetKey = 'tiles';
    tilemap.addTilesetImage(tilesetKey, TILE_TEXTURE_KEY, TILE_SIZE, TILE_SIZE, 0, TILE_SPACING);

    const { X: offsetTilesX, Y: offsetTilesY } = (this.offsetTiles = (() => {
      const { centerX, centerY } = camera;
      const X = Math.round((centerX - (tilemapWidthAtTiles * TILE_SIZE) / 2) / TILE_SIZE);
      const Y = Math.round((centerY - (tilemapHeightAtTiles * TILE_SIZE) / 2) / TILE_SIZE);
      return { X, Y };
    })());
    console.log('tileLayer offset ', { offsetTilesX, offsetTilesY });

    const tileLayerKey = 'layer0';
    this.tileLayer = tilemap.createBlankLayer(
      tileLayerKey,
      tilesetKey,
      offsetTilesX * TILE_SIZE,
      offsetTilesY * TILE_SIZE
    )!;

    // Graphics для сетки
    this.gridGraphics = scene.add.graphics();
  }

  loadLevel(levelIndex: number) {
    const level = useLevelStore().levels[levelIndex];
    if (!level) return;
    const tileLayerData = (() => {
      const { width, height } = this.tileLayer.tilemap;
      const { X, Y } = this.offsetTiles;
      return GridRenderer.buildTileLayerData({
        widthTiles: width,
        heightTiles: height,
        offsetTilesX: X,
        offsetTilesY: Y,
      });
    })();
    this.tileLayer.putTilesAt(tileLayerData, 0, 0);
  }

  updateTile(x: number, y: number, { type }: GridTile) {
    const tileIndex = TILE_INDEX[type];
    if (tileIndex === undefined) return;
    this.tileLayer.putTileAt(tileIndex, x - this.offsetTiles.X, y - this.offsetTiles.Y);
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
  private static buildTileLayerData({
    widthTiles,
    heightTiles,
    offsetTilesX,
    offsetTilesY,
  }: {
    widthTiles: number;
    heightTiles: number;
    offsetTilesX: number;
    offsetTilesY: number;
  }) {
    const levelStore = useLevelStore();
    const getTile = levelStore.getTile.bind(levelStore);
    const { currentLevelIndex } = levelStore;
    return Array.from({ length: heightTiles }, (_, y) =>
      Array.from(
        { length: widthTiles },
        (_, x) => TILE_INDEX[(getTile(currentLevelIndex, x + offsetTilesX, y + offsetTilesY) ?? DEFAULT_TILE).type]
      )
    );
  }
}
