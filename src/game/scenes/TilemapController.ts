import type { Cameras, Scene, Tilemaps } from 'phaser';

import { CAMERA_CONFIG, TILE_INDEX, TILE_SIZE, TILE_SPACING, TILE_TEXTURE_KEY } from '@/game/constants';
import type { GridTile } from '@/types/level';
import { getSaveWorker } from '@/workers/saveWorkerProxy';

export class TilemapController {
  private readonly offsetTiles = { X: 0, Y: 0 };
  private readonly scene: Scene;
  private readonly tilemap: Tilemaps.Tilemap;
  private readonly tileLayers: [Tilemaps.TilemapLayer, Tilemaps.TilemapLayer];
  private avgTileGenTime = 200;
  getAvgTileGenTime() {
    return this.avgTileGenTime;
  }
  private setAvgTileGenTime(timeGen: number) {
    return (this.avgTileGenTime = Math.ceil((this.avgTileGenTime + timeGen) / 2));
  }

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
    this.centerLayerOnCamera();
  }

  getTileAtWorld({ worldX, worldY }: { worldX: number; worldY: number }) {
    return this.getActiveLayer().getTileAtWorldXY(worldX, worldY);
  }

  private static getTilemapSize(camera: Cameras.Scene2D.Camera) {
    const tilemapSizeMultiplier = 2;
    const k = tilemapSizeMultiplier / CAMERA_CONFIG.minZoom / TILE_SIZE;
    return { widthAtTiles: Math.ceil(k * camera.width), heightAtTiles: Math.ceil(k * camera.height) };
  }

  private async centerLayerOnCamera() {
    const { width: widthTiles, height: heightTiles } = this.tilemap;
    const { centerX, centerY } = this.scene.cameras.main;
    const X = Math.round((centerX - (widthTiles * TILE_SIZE) / 2) / TILE_SIZE);
    const Y = Math.round((centerY - (heightTiles * TILE_SIZE) / 2) / TILE_SIZE);

    const tileLayerData = await getSaveWorker().getTileLayerData({
      widthTiles,
      heightTiles,
      offsetTilesX: X,
      offsetTilesY: Y,
    });

    this.updateLayer({ X, Y, tileLayerData });
  }

  async reloadLayerOnCameraShift() {
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

    const tileLayerData = await getSaveWorker().getTileLayerData({
      widthTiles: width,
      heightTiles: height,
      offsetTilesX,
      offsetTilesY,
    });

    this.updateLayer({
      X: offsetTilesX,
      Y: offsetTilesY,
      tileLayerData,
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
    this.tileLayers[1]
      .setActive(false)
      .setVisible(false)
      .setPosition(X * TILE_SIZE, Y * TILE_SIZE)
      .putTilesAt(tileLayerData, 0, 0)
      .setVisible(true)
      .setActive(true);
    this.tileLayers.reverse();
    this.offsetTiles.X = X;
    this.offsetTiles.Y = Y;
    this.tileLayers[1].setActive(false).setVisible(false);
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
