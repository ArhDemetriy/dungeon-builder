import { Scene } from 'phaser';

import { TILE_COLORS, TILE_SIZE, TILE_SPACING, TILE_TEXTURE_KEY } from '@/game/constants';

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
    // Создаём Canvas текстуру с учётом spacing между тайлами
    // Размер: (TILE_SIZE + SPACING) * количество_тайлов
    const textureWidth = (TILE_SIZE + TILE_SPACING) * 4;
    const texture = this.textures.createCanvas(TILE_TEXTURE_KEY, textureWidth, TILE_SIZE);
    if (!texture) return;
    const ctx = texture.getContext();
    [
      `#${TILE_COLORS.wall.toString(16).padStart(6, '0')}`,
      `#${TILE_COLORS.wall.toString(16).padStart(6, '0')}`,
      `#${TILE_COLORS.floor.toString(16).padStart(6, '0')}`,
      `#${TILE_COLORS.unlinkedPortal.toString(16).padStart(6, '0')}`,
      `#${TILE_COLORS.portal.toString(16).padStart(6, '0')}`,
    ].forEach((fillStyle, index) => {
      ctx.fillStyle = fillStyle;
      ctx.fillRect((TILE_SIZE + TILE_SPACING) * index, 0, TILE_SIZE + TILE_SPACING, TILE_SIZE + TILE_SPACING);
    });
    texture.refresh();
  }
}
