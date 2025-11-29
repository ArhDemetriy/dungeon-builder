import { Scene } from 'phaser';

import { TILE_INDEX, TILE_MARGIN, TILE_SIZE, TILE_SPACING, TILE_TEXTURE_KEY } from '@/game/constants';
import { getSaveWorker } from '@/workers/saveWorkerProxy';

export class PreloadScene extends Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    this.load.spritesheet(TILE_TEXTURE_KEY, '/public/grass.png', {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE,
      spacing: TILE_SPACING,
      margin: TILE_MARGIN,
    });
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
              index: TILE_INDEX.grass0,
            }))
          ),
        });
      })
      .then(() => this.scene.start('MainScene'));
  }
}
