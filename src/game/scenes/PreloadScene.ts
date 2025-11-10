import { Scene } from 'phaser';

export class PreloadScene extends Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    // Здесь будет загрузка ассетов
  }

  create() {
    // Сразу переключаемся на главную сцену
    this.scene.start('MainScene');
  }
}

