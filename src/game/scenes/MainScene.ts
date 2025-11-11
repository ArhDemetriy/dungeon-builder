import { debounce } from 'lodash-es';
import { type Cameras, Input, Scene } from 'phaser';

import { CAMERA_CONFIG, MOVEMENT_CONFIG, SAVE_CONFIG, TILE_SIZE } from '@/game/constants';
import { GridRenderer } from '@/game/renderers/GridRenderer';
import { useCameraPositionStore, useCameraZoomStore } from '@/store/cameraStore';
import { useLevelStore } from '@/store/levelStore';
import { useSaveStore } from '@/store/saveStore';
import { useToolbarStore } from '@/store/toolbarStore';
import { useUIStore } from '@/store/uiStore';

export class MainScene extends Scene {
  private gridRenderer!: GridRenderer;
  private zoomController!: CameraZoomController;
  private cursorKeys?: { [k in 'up' | 'left' | 'down' | 'right']?: Input.Keyboard.Key };
  constructor() {
    super({ key: 'MainScene' });
  }

  create() {
    // Инициализируем первый уровень если его нет
    const { levels, createLevel } = useLevelStore.getState();
    if (levels.size === 0) {
      createLevel('Уровень 1');
    }

    // Восстанавливаем сохраненное состояние камеры
    const { zoom } = useCameraZoomStore.getState();
    const { position } = useCameraPositionStore.getState();

    const { main: camera } = this.cameras;
    camera.setZoom(zoom);
    camera.setScroll(position.x, position.y);

    // Инициализируем контроллер зума
    this.zoomController = new CameraZoomController(camera, this.input);
    this.zoomController.initialize();

    this.cursorKeys =
      MOVEMENT_CONFIG.moveInput === 'cursor'
        ? (this.input.keyboard?.createCursorKeys() satisfies typeof this.cursorKeys)
        : (this.input.keyboard?.addKeys({
            up: Input.Keyboard.KeyCodes.W,
            left: Input.Keyboard.KeyCodes.A,
            down: Input.Keyboard.KeyCodes.S,
            right: Input.Keyboard.KeyCodes.D,
          }) as typeof this.cursorKeys);

    // ЛКМ - строить тайл
    this.input.on('pointerdown', (pointer: Input.Pointer) => {
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

    this.gridRenderer = new GridRenderer(this);
  }

  private placeTile(pointer: Input.Pointer) {
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

  private eyedropperTool(pointer: Input.Pointer) {
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

  update(time: number, delta: number) {
    super.update(time, delta);
    const { main: camera } = this.cameras;

    if (this.cursorKeys) {
      const { up, down, left, right } = this.cursorKeys;
      const x = (left?.isDown ? -1 : 0) + (right?.isDown ? 1 : 0);
      const y = (up?.isDown ? -1 : 0) + (down?.isDown ? 1 : 0);
      const moved = x || y;
      if (moved) {
        const isDiagonale = x && y;
        const cosPI2 = 0.7071067811865476;
        const move = Math.round(
          delta * CAMERA_CONFIG.moveSpeed * (isDiagonale ? cosPI2 : 1) * (CAMERA_CONFIG.maxZoom / camera.zoom)
        );
        if (x) camera.scrollX += x * move;
        if (y) camera.scrollY += y * move;
        debouncedSavePosition(camera.scrollX, camera.scrollY);
      }
    }

    // Рендерим сетку
    const { showGrid } = useUIStore.getState();
    this.gridRenderer.render(camera, showGrid);
  }
}

class CameraZoomController {
  private readonly camera: Cameras.Scene2D.Camera;
  private readonly input: Input.InputPlugin;

  constructor(camera: Cameras.Scene2D.Camera, input: Input.InputPlugin) {
    this.camera = camera;
    this.input = input;
  }

  initialize() {
    this.input.on('wheel', (_pointer: Input.Pointer, _gameObjects: unknown, deltaX: number, deltaY: number) => {
      // Используем activePointer для получения актуальных координат мыши
      const pointer = this.input.activePointer;
      this.handleWheel(pointer, deltaY || deltaX);
    });
  }

  private static readonly debouncedSaveZoom = debounce(
    (zoom: number) => useCameraZoomStore.getState().setZoom(zoom),
    200
  );

  private handleWheel(_pointer: Input.Pointer, deltaY: number) {
    const oldZoom = this.camera.zoom;
    const newZoom = Math.max(
      CAMERA_CONFIG.minZoom,
      Math.min(CAMERA_CONFIG.maxZoom, oldZoom - 0.001 * CAMERA_CONFIG.zoomSpeed * deltaY)
    );
    if (newZoom === oldZoom) return;

    CameraZoomController.debouncedSaveZoom(this.camera.setZoom(newZoom).zoom);
    debouncedSavePosition(this.camera.scrollX, this.camera.scrollY);
  }

  destroy() {
    this.input.off('wheel');
  }
}

const debouncedSavePosition = debounce(
  (x: number, y: number) => useCameraPositionStore.getState().setPosition(x, y),
  500
);
