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

export class GridRenderer {
  private gridGraphics: GameObjects.Graphics;
  private readonly offsetTiles = { X: 0, Y: 0 };
  private readonly scene: Scene;
  private readonly tilemap: Tilemaps.Tilemap;
  private readonly tileLayers: [Tilemaps.TilemapLayer, Tilemaps.TilemapLayer];
  private avgTileGenTime = 200;
  private setAvgTileGenTime(timeGen: number) {
    return (this.avgTileGenTime = Math.ceil((this.avgTileGenTime + timeGen) / 2));
  }

  constructor(scene: Scene) {
    this.scene = scene;
    const { widthAtTiles, heightAtTiles } = GridRenderer.getTilemapSize(this.scene.cameras.main);
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
    this.centerLayerOnCamera();

    // Graphics для сетки
    this.gridGraphics = scene.add.graphics();
  }

  private static getTilemapSize(camera: Cameras.Scene2D.Camera) {
    const tilemapSizeMultiplier = 2;
    const k = tilemapSizeMultiplier / CAMERA_CONFIG.minZoom / TILE_SIZE;
    return { widthAtTiles: Math.ceil(k * camera.width), heightAtTiles: Math.ceil(k * camera.height) };
  }

  private centerLayerOnCamera() {
    const { X, Y, tileLayerData } = (() => {
      const { width: widthTiles, height: heightTiles } = this.tilemap;
      const { centerX, centerY } = this.scene.cameras.main;
      const X = Math.round((centerX - (widthTiles * TILE_SIZE) / 2) / TILE_SIZE);
      const Y = Math.round((centerY - (heightTiles * TILE_SIZE) / 2) / TILE_SIZE);

      const tileLayerData = GridRenderer.buildTileLayerData({
        widthTiles,
        heightTiles,
        offsetTilesX: X,
        offsetTilesY: Y,
      });

      return {
        X,
        Y,
        tileLayerData,
      };
    })();

    this.updateLayer({ X, Y, tileLayerData });
  }

  private reloadLayerOnCameraShift() {
    const shift = this.checkCameraPosition();
    if (!shift) return;
    const startTime = performance.now();

    const { width, height } = this.tilemap;
    const { left, right, top, bottom } = this.scene.cameras.main.worldView;
    const offsetTilesX =
      shift.x > 0
        ? Math.round(left / TILE_SIZE) - 2
        : shift.x < 0
          ? Math.round(right / TILE_SIZE) + 2 - width
          : Math.round(this.getActiveLayer().x / TILE_SIZE);
    const offsetTilesY =
      shift.y > 0
        ? Math.round(top / TILE_SIZE) - 2
        : shift.y < 0
          ? Math.round(bottom / TILE_SIZE) + 2 - height
          : Math.round(this.getActiveLayer().y / TILE_SIZE);
    this.updateLayer({
      X: offsetTilesX * TILE_SIZE,
      Y: offsetTilesY * TILE_SIZE,
      tileLayerData: GridRenderer.buildTileLayerData({
        widthTiles: width,
        heightTiles: height,
        offsetTilesX,
        offsetTilesY,
      }),
    });

    this.setAvgTileGenTime(performance.now() - startTime);
  }
  private checkCameraPosition() {
    const layer = this.getActiveLayer();
    const { centerX, centerY } = this.scene.cameras.main;
    const centerTile = layer.worldToTileXY(centerX, centerY);

    if (!centerTile) {
      // Камера за пределами слоя - определяем направление через границы
      const { left, right, top, bottom } = layer.getBounds();
      return {
        x: centerX < left ? -1 : centerX > right ? 1 : 0,
        y: centerY < top ? -1 : centerY > bottom ? 1 : 0,
      } as const;
    }

    const { width: widthTiles, height: heightTiles } = this.tilemap;
    const thirdWidth = Math.round(widthTiles / 3);
    const thirdHeight = Math.round(heightTiles / 3);

    const x = centerTile.x < thirdWidth ? -1 : centerTile.x > widthTiles - thirdWidth ? 1 : 0;
    const y = centerTile.y < thirdHeight ? -1 : centerTile.y > heightTiles - thirdHeight ? 1 : 0;
    if (x || y) return { x, y } as const;
    return null; // Камера в центральной зоне
  }

  private updateLayer({ X, Y, tileLayerData }: { X: number; Y: number; tileLayerData: number[][] }) {
    this.tileLayers[1].setVisible(false).setPosition(X, Y).putTilesAt(tileLayerData, 0, 0).setVisible(true);
    this.tileLayers.reverse();
    this.offsetTiles.X = X;
    this.offsetTiles.Y = Y;
    this.tileLayers[1].setVisible(false);
  }

  private getActiveLayer() {
    return this.tileLayers[0];
  }

  updateTile(x: number, y: number, { type }: GridTile) {
    const tileIndex = TILE_INDEX[type];
    if (tileIndex === undefined) return;
    this.getActiveLayer().putTileAt(tileIndex, x - this.offsetTiles.X, y - this.offsetTiles.Y);
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
