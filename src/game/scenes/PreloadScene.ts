import { Scene } from 'phaser';

import { TILE_COLORS, TILE_SIZE, TILE_SPACING, TILE_TEXTURE_KEY } from '@/game/constants';
import type { GridTile } from '@/types/level';
import { getSaveWorker } from '@/workers/saveWorkerProxy';

export class PreloadScene extends Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
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

  create() {
    const worker = getSaveWorker();
    worker
      .waitForReady()
      .then(() => worker.getTilesCountInLevel())
      .then(tilesCount => {
        if (tilesCount) return;
        return worker.setTiles({
          tiles: Array.from({ length: 5 }, (_, i) => i - 2).flatMap(x =>
            Array.from({ length: 5 }, (_, i) => ({
              x,
              y: i - 2,
              tile: { type: 'floor' } satisfies GridTile,
            }))
          ),
        });
      })
      .then(() => this.scene.start('MainScene'));
  }
}
