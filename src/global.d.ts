import type { Game } from 'phaser';

declare global {
  interface Window {
    game?: Game;
  }
}
