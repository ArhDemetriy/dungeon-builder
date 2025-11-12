import { Scene } from 'phaser';

import { TILE_COLORS, TILE_SIZE } from '@/game/constants';

export class PreloadScene extends Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    // Создаём текстуру для тайлов
    this.createTileTexture();
  }

  create() {
    // Сразу переключаемся на главную сцену
    this.scene.start('MainScene');
  }

  private createTileTexture() {
    // Создаём Canvas текстуру размером 128x32 (4 тайла по 32px)
    const texture = this.textures.createCanvas('tiles', TILE_SIZE * 4, TILE_SIZE);
    if (!texture) return;

    const ctx = texture.getContext();

    // WALL - индекс 0 (позиция x=0)
    ctx.fillStyle = `#${TILE_COLORS.wall.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    // FLOOR - индекс 1 (позиция x=32)
    ctx.fillStyle = `#${TILE_COLORS.floor.toString(16).padStart(6, '0')}`;
    ctx.fillRect(TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);

    // UNLINKED_PORTAL - индекс 2 (позиция x=64)
    ctx.fillStyle = `#${TILE_COLORS['unlinked-portal'].toString(16).padStart(6, '0')}`;
    ctx.fillRect(TILE_SIZE * 2, 0, TILE_SIZE, TILE_SIZE);

    // PORTAL - индекс 3 (позиция x=96)
    ctx.fillStyle = `#${TILE_COLORS.portal.toString(16).padStart(6, '0')}`;
    ctx.fillRect(TILE_SIZE * 3, 0, TILE_SIZE, TILE_SIZE);

    texture.refresh();
  }
}
