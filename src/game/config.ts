import { AUTO, Scale, type Types } from 'phaser';

import { MainScene } from '@/game/scenes/MainScene';
import { PreloadScene } from '@/game/scenes/PreloadScene';

export const gameConfig = {
  type: AUTO,
  parent: 'phaser-container',
  backgroundColor: '#000000',
  scene: [PreloadScene, MainScene],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scale: {
    mode: Scale.RESIZE,
    width: '100%',
    height: '100%',
    autoCenter: Scale.CENTER_BOTH,
  },
} satisfies Types.Core.GameConfig;
