import { Game } from 'phaser';

import { gameConfig } from '@/game/config';

window.game = new Game(gameConfig);
window.addEventListener('beforeunload', () => window.game?.destroy(true), { passive: true, once: true });
