import type Phaser from 'phaser';

import { GRID_CONFIG, TILE_COLORS, TILE_SIZE } from '@/game/constants';
import { useLevelStore } from '@/store/levelStore';
import type { GridTile } from '@/types/level';

export class GridRenderer {
  private scene: Phaser.Scene;
  private staticLayer: Phaser.GameObjects.RenderTexture;
  private dynamicGraphics: Phaser.GameObjects.Graphics;
  private gridGraphics: Phaser.GameObjects.Graphics;
  private staticDirty = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Создаем большую текстуру для статического слоя (wall тайлы)
    // Размер достаточно большой для видимой области
    this.staticLayer = scene.add.renderTexture(0, 0, 10000, 10000);
    this.staticLayer.setOrigin(0.5, 0.5);

    this.dynamicGraphics = scene.add.graphics();
    this.gridGraphics = scene.add.graphics();
  }

  markStaticDirty() {
    this.staticDirty = true;
  }

  render(camera: Phaser.Cameras.Scene2D.Camera, showGrid: boolean) {
    const { currentLevelId, getTile } = useLevelStore.getState();
    if (!currentLevelId) return;

    // Получаем границы видимой области камеры
    const { left, right, top, bottom } = camera.worldView;
    const startTileX = Math.floor(left / TILE_SIZE) - 1;
    const endTileX = Math.ceil(right / TILE_SIZE) + 1;
    const startTileY = Math.floor(top / TILE_SIZE) - 1;
    const endTileY = Math.ceil(bottom / TILE_SIZE) + 1;

    // Статический слой (wall) - редко перерисовывается
    if (this.staticDirty) {
      this.redrawStaticLayer(currentLevelId, startTileX, endTileX, startTileY, endTileY, getTile);
      this.staticDirty = false;
    }

    // Динамический слой (floor, portal, unlinked-portal) - каждый кадр
    this.redrawDynamicLayer(currentLevelId, startTileX, endTileX, startTileY, endTileY, getTile);

    // Сетка
    if (showGrid) {
      this.redrawGrid(startTileX, endTileX, startTileY, endTileY);
    } else {
      this.gridGraphics.clear();
    }
  }

  private redrawStaticLayer(
    levelId: string,
    startX: number,
    endX: number,
    startY: number,
    endY: number,
    getTile: (id: string, x: number, y: number) => GridTile
  ) {
    this.staticLayer.clear();

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const tile = getTile(levelId, x, y);
        if (tile.type === 'wall') {
          const worldX = x * TILE_SIZE;
          const worldY = y * TILE_SIZE;

          this.staticLayer.fill(TILE_COLORS.wall);
          this.staticLayer.drawRect(worldX, worldY, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  private redrawDynamicLayer(
    levelId: string,
    startX: number,
    endX: number,
    startY: number,
    endY: number,
    getTile: (id: string, x: number, y: number) => GridTile
  ) {
    this.dynamicGraphics.clear();

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const tile = getTile(levelId, x, y);

        if (tile.type !== 'wall') {
          const worldX = x * TILE_SIZE;
          const worldY = y * TILE_SIZE;

          let color: number;

          switch (tile.type) {
            case 'floor':
              color = TILE_COLORS.floor;
              break;
            case 'portal':
              color = TILE_COLORS.portal;
              break;
            case 'unlinked-portal':
              color = TILE_COLORS['unlinked-portal'];
              break;
          }

          this.dynamicGraphics.fillStyle(color);
          this.dynamicGraphics.fillRect(worldX, worldY, TILE_SIZE, TILE_SIZE);

          // Добавляем визуальный индикатор для несвязанного портала
          if (tile.type === 'unlinked-portal') {
            this.dynamicGraphics.lineStyle(2, 0xffff00, 0.5);
            this.dynamicGraphics.strokeRect(worldX + 4, worldY + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          }
        }
      }
    }
  }

  private redrawGrid(startX: number, endX: number, startY: number, endY: number) {
    this.gridGraphics.clear();
    this.gridGraphics.lineStyle(1, GRID_CONFIG.color, GRID_CONFIG.alpha);

    // Вертикальные линии
    for (let x = startX; x <= endX; x++) {
      const worldX = x * TILE_SIZE;
      this.gridGraphics.lineBetween(worldX, startY * TILE_SIZE, worldX, endY * TILE_SIZE);
    }

    // Горизонтальные линии
    for (let y = startY; y <= endY; y++) {
      const worldY = y * TILE_SIZE;
      this.gridGraphics.lineBetween(startX * TILE_SIZE, worldY, endX * TILE_SIZE, worldY);
    }
  }

  destroy() {
    this.staticLayer.destroy();
    this.dynamicGraphics.destroy();
    this.gridGraphics.destroy();
  }
}
