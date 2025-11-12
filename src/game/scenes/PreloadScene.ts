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

    // WALL - индекс 0 (позиция x=0)
    ctx.fillStyle = `#${TILE_COLORS.wall.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    // FLOOR - индекс 1 (позиция x=34 с учётом spacing)
    ctx.fillStyle = `#${TILE_COLORS.floor.toString(16).padStart(6, '0')}`;
    ctx.fillRect(TILE_SIZE + TILE_SPACING, 0, TILE_SIZE, TILE_SIZE);

    // UNLINKED_PORTAL - индекс 2 (позиция x=68)
    ctx.fillStyle = `#${TILE_COLORS.unlinkedPortal.toString(16).padStart(6, '0')}`;
    ctx.fillRect((TILE_SIZE + TILE_SPACING) * 2, 0, TILE_SIZE, TILE_SIZE);

    // PORTAL - индекс 3 (позиция x=102)
    ctx.fillStyle = `#${TILE_COLORS.portal.toString(16).padStart(6, '0')}`;
    ctx.fillRect((TILE_SIZE + TILE_SPACING) * 3, 0, TILE_SIZE, TILE_SIZE);

    texture.refresh();
  }
}
