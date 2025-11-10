import { debounce } from 'lodash-es';
import { Scene } from 'phaser';

import { CAMERA_CONFIG, SAVE_CONFIG, TILE_SIZE } from '@/game/constants';
import { GridRenderer } from '@/game/renderers/GridRenderer';
import { useCameraPositionStore, useCameraZoomStore } from '@/store/cameraStore';
import { useLevelStore } from '@/store/levelStore';
import { useSaveStore } from '@/store/saveStore';
import { useToolbarStore } from '@/store/toolbarStore';
import { useUIStore } from '@/store/uiStore';

export class MainScene extends Scene {
  private gridRenderer!: GridRenderer;

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

    // Инициализируем первый уровень если его нет
    const { levels, currentLevelId, createLevel } = useLevelStore.getState();
    if (levels.size === 0) {
      createLevel('Уровень 1');
    }

    // Восстанавливаем сохраненное состояние камеры
    const { zoom } = useCameraZoomStore.getState();
    const { position } = useCameraPositionStore.getState();

    camera.setZoom(zoom);
    camera.setScroll(position.x, position.y);

    // Инициализируем GridRenderer
    this.gridRenderer = new GridRenderer(this);

    // Зум с фокусом на курсоре
    this.input.on(
      'wheel',
      (
        pointer: Phaser.Input.Pointer,
        _gameObjects: unknown,
        _deltaX: number,
        deltaY: number
      ) => {
        const oldZoom = camera.zoom;
        const newZoom = Math.max(
          CAMERA_CONFIG.minZoom,
          Math.min(
            CAMERA_CONFIG.maxZoom,
            oldZoom - deltaY * 0.001 * CAMERA_CONFIG.zoomSpeed
          )
        );

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

    // ЛКМ - строить тайл
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        // ЛКМ
        this.placeTile(pointer);
      } else if (pointer.button === 1) {
        // Средняя кнопка - пипетка
        this.eyedropperTool(pointer);
      }
    });

    // Клавиши 1/2/3 - выбор тайла
    this.input.keyboard?.on('keydown-ONE', () => {
      useToolbarStore.getState().setActiveTile('wall');
    });
    this.input.keyboard?.on('keydown-TWO', () => {
      useToolbarStore.getState().setActiveTile('floor');
    });
    this.input.keyboard?.on('keydown-THREE', () => {
      useToolbarStore.getState().setActiveTile('unlinked-portal');
    });

    // G - toggle сетки
    this.input.keyboard?.on('keydown-G', () => {
      useUIStore.getState().toggleGrid();
    });

    // Автосохранение каждые 30 секунд
    this.time.addEvent({
      delay: SAVE_CONFIG.autoSaveInterval,
      callback: () => {
        const { isDirty, clearDirty } = useSaveStore.getState();

        if (isDirty) {
          console.log('Автосохранение...');
          clearDirty();
        }
      },
      loop: true,
    });
  }

  private placeTile(pointer: Phaser.Input.Pointer) {
    const { currentLevelId, setTile } = useLevelStore.getState();
    if (!currentLevelId) return;

    const { activeTile } = useToolbarStore.getState();

    // Конвертируем позицию клика в координаты тайла
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    // Размещаем тайл
    if (activeTile === 'unlinked-portal') {
      setTile(currentLevelId, tileX, tileY, { type: 'unlinked-portal' });
    } else {
      setTile(currentLevelId, tileX, tileY, { type: activeTile });
    }

    // Отмечаем что статический слой нужно перерисовать если это wall
    if (activeTile === 'wall') {
      this.gridRenderer.markStaticDirty();
    }
  }

  private eyedropperTool(pointer: Phaser.Input.Pointer) {
    const { currentLevelId, getTile } = useLevelStore.getState();
    if (!currentLevelId) return;

    // Конвертируем позицию клика в координаты тайла
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    const tile = getTile(currentLevelId, tileX, tileY);

    // Копируем тип тайла в активный инструмент
    if (tile.type === 'wall' || tile.type === 'floor' || tile.type === 'unlinked-portal') {
      useToolbarStore.getState().setActiveTile(tile.type);
    }
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
      camera.scrollY -= CAMERA_CONFIG.moveSpeed;
      moved = true;
    }
    if (keyS?.isDown) {
      camera.scrollY += CAMERA_CONFIG.moveSpeed;
      moved = true;
    }
    if (keyA?.isDown) {
      camera.scrollX -= CAMERA_CONFIG.moveSpeed;
      moved = true;
    }
    if (keyD?.isDown) {
      camera.scrollX += CAMERA_CONFIG.moveSpeed;
      moved = true;
    }

    // Сохраняем позицию если двигались
    if (moved) {
      this.debouncedSavePosition(camera.scrollX, camera.scrollY);
    }

    // Рендерим сетку
    const { showGrid } = useUIStore.getState();
    this.gridRenderer.render(camera, showGrid);
  }
}
