import { Scene } from 'phaser';
import { debounce } from 'lodash-es';

import { useCameraPositionStore, useCameraZoomStore } from '@/store/cameraStore';

export class MainScene extends Scene {
  private minZoom = 0.5;
  private maxZoom = 3;
  private zoomSpeed = 0.1;
  private moveSpeed = 5;

  private debouncedSaveZoom = debounce((zoom: number) => {
    useCameraZoomStore.getState().setZoom(zoom);
  }, 200);

  private debouncedSavePosition = debounce((x: number, y: number) => {
    useCameraPositionStore.getState().setPosition(x, y);
  }, 500);

  constructor() {
    super({ key: 'MainScene' });
  }

  create() {
    const camera = this.cameras.main;

    // Восстанавливаем сохраненное состояние камеры
    const { zoom } = useCameraZoomStore.getState();
    const { position } = useCameraPositionStore.getState();

    camera.setZoom(zoom);
    camera.setScroll(position.x, position.y);

    // Зум с фокусом на курсоре
    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _gameObjects: unknown, _deltaX: number, deltaY: number) => {
        const oldZoom = camera.zoom;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, oldZoom - deltaY * 0.001 * this.zoomSpeed));

        if (oldZoom !== newZoom) {
          // Запоминаем мировую позицию под курсором ДО зума
          const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);

          // Применяем новый зум
          camera.setZoom(newZoom);

          // Вычисляем новую мировую позицию под курсором ПОСЛЕ зума
          const newWorldPoint = camera.getWorldPoint(pointer.x, pointer.y);

          // Корректируем камеру чтобы курсор остался на том же месте
          camera.scrollX += worldPoint.x - newWorldPoint.x;
          camera.scrollY += worldPoint.y - newWorldPoint.y;

          // Сохраняем в stores с debounce
          this.debouncedSaveZoom(newZoom);
          this.debouncedSavePosition(camera.scrollX, camera.scrollY);
        }
      }
    );
  }

  update() {
    const camera = this.cameras.main;
    let moved = false;

    // WASD управление
    const keyW = this.input.keyboard?.addKey('W');
    const keyS = this.input.keyboard?.addKey('S');
    const keyA = this.input.keyboard?.addKey('A');
    const keyD = this.input.keyboard?.addKey('D');

    if (keyW?.isDown) {
      camera.scrollY -= this.moveSpeed;
      moved = true;
    }
    if (keyS?.isDown) {
      camera.scrollY += this.moveSpeed;
      moved = true;
    }
    if (keyA?.isDown) {
      camera.scrollX -= this.moveSpeed;
      moved = true;
    }
    if (keyD?.isDown) {
      camera.scrollX += this.moveSpeed;
      moved = true;
    }

    // Сохраняем позицию если двигались
    if (moved) {
      this.debouncedSavePosition(camera.scrollX, camera.scrollY);
    }
  }
}
