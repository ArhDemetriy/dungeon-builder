import { debounce } from 'lodash-es';
import { type Cameras, Input, Scene } from 'phaser';

import { CAMERA_CONFIG, MOVEMENT_CONFIG, TILE_SIZE } from '@/game/constants';
import { GridRenderer } from '@/game/renderers/GridRenderer';
import { useCameraPositionStore, useCameraZoomStore } from '@/store/cameraStore';
import { useLevelStore } from '@/store/levelStore';
import { useToolbarStore } from '@/store/toolbarStore';
import { useUIStore } from '@/store/uiStore';
import { isPrimitiveTile } from '@/types/level';

export class MainScene extends Scene {
  private gridRenderer!: GridRenderer;
  // @ts-expect-error - контроллер не используется напрямую, но необходим для управления зумом
  private zoomController!: CameraZoomController;
  private cameraMoveController!: CameraMoveController;
  // @ts-expect-error - контроллер не используется напрямую, но необходим для управления тайлами
  private tileController!: TileController;

  constructor() {
    super({ key: 'MainScene' });
  }

  create() {
    // Инициализируем первый уровень если его нет
    const { levels, createLevel } = useLevelStore.getState();
    if (!levels.size) createLevel('Уровень 1');

    this.gridRenderer = new GridRenderer(this);
    const { currentLevelId } = useLevelStore.getState();
    if (currentLevelId) this.gridRenderer.loadLevel(currentLevelId);

    const { main: camera } = this.cameras;
    const { input } = this;

    this.cameraMoveController = new CameraMoveController({
      camera,
      input,
    });
    this.zoomController = new CameraZoomController({
      camera,
      input,
      saveCameraPosition: CameraMoveController.debouncedSavePosition,
    });
    this.tileController = new TileController({
      camera,
      input,
      gridRenderer: this.gridRenderer,
    });

    // Регистрируем интерфейсные клавиши
    if (input.keyboard) registerUIKeyboardBindings(input.keyboard);
  }

  update(time: number, delta: number) {
    super.update(time, delta);
    const { main: camera } = this.cameras;
    this.cameraMoveController.handleMovement(delta);

    // Рендерим сетку (tilemap рендерит себя автоматически)
    const { showGrid } = useUIStore.getState();
    this.gridRenderer.renderGrid(camera, showGrid);
  }
}

class TileController {
  private readonly camera: Cameras.Scene2D.Camera;
  private readonly input: Input.InputPlugin;
  private readonly gridRenderer: GridRenderer;

  constructor({
    camera,
    input,
    gridRenderer,
  }: {
    camera: Cameras.Scene2D.Camera;
    input: Input.InputPlugin;
    gridRenderer: GridRenderer;
  }) {
    this.camera = camera;
    this.input = input;
    this.gridRenderer = gridRenderer;

    // Регистрируем обработчики кликов мыши
    this.input.on('pointerdown', (pointer: Input.Pointer) => {
      if (pointer.button === 0) {
        // ЛКМ - строить тайл
        this.placeTile(pointer);
      } else if (pointer.button === 1) {
        // Средняя кнопка - пипетка
        this.eyedropperTool(pointer);
      }
    });
  }

  private placeTile(pointer: Input.Pointer) {
    const { currentLevelId, setTile, getTile } = useLevelStore.getState();
    if (!currentLevelId) return;

    // Конвертируем позицию клика в координаты тайла
    const worldPoint = this.camera.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    // Размещаем тайл
    const { activeTile } = useToolbarStore.getState();
    setTile(currentLevelId, tileX, tileY, { type: activeTile });

    // Обновляем визуальное представление тайла
    const tile = getTile(currentLevelId, tileX, tileY);
    this.gridRenderer.updateTile(tileX, tileY, tile);
  }

  private eyedropperTool(pointer: Input.Pointer) {
    const { currentLevelId, getTile } = useLevelStore.getState();
    if (!currentLevelId) return;

    // Конвертируем позицию клика в координаты тайла
    const worldPoint = this.camera.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    const tile = getTile(currentLevelId, tileX, tileY);

    if (isPrimitiveTile(tile)) useToolbarStore.getState().setActiveTile(tile.type);
  }
}

class CameraMoveController {
  private readonly input: Input.InputPlugin;
  private readonly camera: Cameras.Scene2D.Camera;
  private readonly cursorKeys?: { [k in 'up' | 'left' | 'down' | 'right']?: Input.Keyboard.Key };

  constructor({ camera, input }: { camera: Cameras.Scene2D.Camera; input: Input.InputPlugin }) {
    this.input = input;
    this.camera = camera;

    const { position } = useCameraPositionStore.getState();
    this.camera.setScroll(position.x, position.y);

    this.cursorKeys =
      MOVEMENT_CONFIG.moveInput === 'cursor'
        ? (this.input.keyboard?.createCursorKeys() satisfies typeof this.cursorKeys)
        : (this.input.keyboard?.addKeys({
            up: Input.Keyboard.KeyCodes.W,
            left: Input.Keyboard.KeyCodes.A,
            down: Input.Keyboard.KeyCodes.S,
            right: Input.Keyboard.KeyCodes.D,
          }) as typeof this.cursorKeys);
  }

  handleMovement(delta: number) {
    if (this.cursorKeys) {
      const { up, down, left, right } = this.cursorKeys;
      const x = (left?.isDown ? -1 : 0) + (right?.isDown ? 1 : 0);
      const y = (up?.isDown ? -1 : 0) + (down?.isDown ? 1 : 0);
      const moved = x || y;
      if (moved) {
        const isDiagonal = x && y;
        const cosPI4 = 0.7071067811865476;
        const move = Math.round(
          delta * CAMERA_CONFIG.moveSpeed * (isDiagonal ? cosPI4 : 1) * (CAMERA_CONFIG.maxZoom / this.camera.zoom)
        );
        if (x) this.camera.scrollX += x * move;
        if (y) this.camera.scrollY += y * move;
        CameraMoveController.debouncedSavePosition(this.camera.scrollX, this.camera.scrollY);
      }
    }
  }

  static readonly debouncedSavePosition = debounce(
    (x: number, y: number) => useCameraPositionStore.getState().setPosition(x, y),
    500
  );
}

class CameraZoomController {
  private readonly camera: Cameras.Scene2D.Camera;
  private readonly input: Input.InputPlugin;
  private readonly saveCameraPosition: (x: number, y: number) => unknown;
  constructor({
    camera,
    input,
    saveCameraPosition,
  }: {
    camera: Cameras.Scene2D.Camera;
    input: Input.InputPlugin;
    saveCameraPosition: (x: number, y: number) => unknown;
  }) {
    this.camera = camera;
    this.saveCameraPosition = saveCameraPosition;
    this.input = input;

    const { zoom } = useCameraZoomStore.getState();
    this.camera.setZoom(zoom);

    this.input.on('wheel', (pointer: Input.Pointer, _gameObjects: unknown, deltaX: number, deltaY: number) =>
      this.handleWheel(pointer, deltaY || deltaX)
    );
  }

  private handleWheel(_pointer: Input.Pointer, deltaY: number) {
    const oldZoom = this.camera.zoom;
    const newZoom = Math.max(
      CAMERA_CONFIG.minZoom,
      Math.min(CAMERA_CONFIG.maxZoom, oldZoom - 0.001 * CAMERA_CONFIG.zoomSpeed * deltaY)
    );
    if (newZoom === oldZoom) return;

    CameraZoomController.debouncedSaveZoom(this.camera.setZoom(newZoom).zoom);
    this.saveCameraPosition(this.camera.scrollX, this.camera.scrollY);
  }

  private static readonly debouncedSaveZoom = debounce(
    (zoom: number) => useCameraZoomStore.getState().setZoom(zoom),
    200
  );
}

/**
 * Регистрирует клавиатурные привязки для управления интерфейсом
 */
function registerUIKeyboardBindings(keyboard: Input.Keyboard.KeyboardPlugin) {
  // Клавиши 1/2/3 - выбор тайла
  keyboard.on('keydown-ONE', () => {
    useToolbarStore.getState().setActiveTile('wall');
  });
  keyboard.on('keydown-TWO', () => {
    useToolbarStore.getState().setActiveTile('floor');
  });
  keyboard.on('keydown-THREE', () => {
    useToolbarStore.getState().setActiveTile('unlinkedPortal');
  });

  // G - toggle сетки
  keyboard.on('keydown-G', () => {
    useUIStore.getState().toggleGrid();
  });
}
