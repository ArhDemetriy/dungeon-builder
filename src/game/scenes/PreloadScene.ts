import { Scene } from 'phaser';

import { TILE_COLORS, TILE_KEYS, TILE_SIZE, TILE_SPACING, TILE_TEXTURE_KEY } from '@/game/constants';

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
    const colors = [
      `#${TILE_COLORS.empty.toString(16).padStart(6, '0')}`,
      `#${TILE_COLORS.wall.toString(16).padStart(6, '0')}`,
      `#${TILE_COLORS.floor.toString(16).padStart(6, '0')}`,
      `#${TILE_COLORS.unlinkedPortal.toString(16).padStart(6, '0')}`,
    ];

    const textureWidth = (TILE_SIZE + TILE_SPACING) * colors.length;
    const texture = this.textures.createCanvas(TILE_TEXTURE_KEY, textureWidth, TILE_SIZE);
    if (!texture) return;
    const ctx = texture.getContext();
    colors.forEach((fillStyle, index) => {
      ctx.fillStyle = fillStyle;
      ctx.fillRect((TILE_SIZE + TILE_SPACING) * index, 0, TILE_SIZE, TILE_SIZE);
    });
    texture.refresh();
  }
}
