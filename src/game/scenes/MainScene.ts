import { debounce } from 'lodash-es';
import { type Cameras, Input, Scene, type Time } from 'phaser';

import {
  CAMERA_CONFIG,
  DEFAULT_TILE,
  MOVEMENT_CONFIG,
  TILE_INDEX,
  TILE_SIZE,
  TILE_SPACING,
  TILE_TEXTURE_KEY,
} from '@/game/constants';
import { GridRenderer } from '@/game/renderers/GridRenderer';
import { useCameraPositionStore, useCameraZoomStore } from '@/store/cameraStore';
import { useLevelStore } from '@/store/levelStore';
import { useToolbarStore } from '@/store/toolbarStore';
import { useUIStore } from '@/store/uiStore';

export class MainScene extends Scene {
  private gridRenderer!: GridRenderer;
  // @ts-expect-error - контроллер не используется напрямую, но необходим для управления зумом
  private zoomController!: CameraZoomController;
  private cameraMoveController!: CameraMoveController;
  // @ts-expect-error - контроллер не используется напрямую, но необходим для управления тайлами
  private tileController!: TileController;
  // private tilemapStreamingController!: TilemapController;
  // @ts-expect-error - таймер не используется напрямую, но необходим для управления пердзагрузкой тайлов
  private tilemapStreamingControllerTimer!: Time.TimerEvent;

  constructor() {
    super({ key: 'MainScene' });
  }

  create() {
    this.gridRenderer = new GridRenderer(this);

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

    // this.tilemapStreamingController = new TilemapController({ scene: this });
    // this.tilemapStreamingControllerTimer = this.time.addEvent({
    //   delay: TilemapController.calculateTimeToTraverse({
    //     minTilemapSizeInPixels: Math.min(heightInPixels, widthInPixels),
    //   }),
    //   callback: () => this.tilemapStreamingController.update(),
    //   loop: true,
    // });

    // Регистрируем интерфейсные клавиши
    if (input.keyboard) registerUIKeyboardBindings(input.keyboard);
  }

  update(time: number, delta: number) {
    super.update(time, delta);
    this.cameraMoveController.handleMovement(delta);

    const { main: camera } = this.cameras;
    const uiStore = useUIStore();
    this.gridRenderer.renderGrid(camera, uiStore.showGrid);
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
    const levelStore = useLevelStore();
    const levelIndex = levelStore.currentLevelIndex;
    if (levelIndex < 0 || levelIndex >= levelStore.levels.length) return;

    // Конвертируем позицию клика в координаты тайла
    const worldPoint = this.camera.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    // Размещаем тайл
    const toolbarStore = useToolbarStore();

    // const { type: currentType } = level.tiles.get(tileKey(x, y)) ?? DEFAULT_TILE;
    // if (currentType === 'empty' && tile.type !== 'empty' && !hasNonEmptyNeighbor(level, x, y)) return false;

    const success = levelStore.setTile(levelIndex, tileX, tileY, { type: toolbarStore.activeTile });
    if (!success) return;

    // Обновляем визуальное представление тайла
    const tile = levelStore.getTile(levelIndex, tileX, tileY);
    if (tile) this.gridRenderer.updateTile(tileX, tileY, tile);
  }

  private eyedropperTool(pointer: Input.Pointer) {
    const levelStore = useLevelStore();
    const levelIndex = levelStore.currentLevelIndex;
    if (levelIndex < 0 || levelIndex >= levelStore.levels.length) return;

    // Конвертируем позицию клика в координаты тайла
    const worldPoint = this.camera.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    const tile = levelStore.getTile(levelIndex, tileX, tileY);
    if (!tile) return;

    useToolbarStore().setActiveTile(tile.type);
  }
}

class CameraMoveController {
  private readonly input: Input.InputPlugin;
  private readonly camera: Cameras.Scene2D.Camera;
  private readonly cursorKeys?: { [k in 'up' | 'left' | 'down' | 'right']?: Input.Keyboard.Key };

  constructor({ camera, input }: { camera: Cameras.Scene2D.Camera; input: Input.InputPlugin }) {
    this.input = input;
    this.camera = camera;

    const { position } = useCameraPositionStore();
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
    (x: number, y: number) => useCameraPositionStore().setPosition(x, y),
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

    this.camera.setZoom(useCameraZoomStore().zoom);
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

  private static readonly debouncedSaveZoom = debounce((zoom: number) => useCameraZoomStore().setZoom(zoom), 200);
}

/**
 * Регистрирует клавиатурные привязки для управления интерфейсом
 */
function registerUIKeyboardBindings(keyboard: Input.Keyboard.KeyboardPlugin) {
  // Клавиши 1/2/3 - выбор тайла
  keyboard.on('keydown-ONE', () => {
    const toolbarStore = useToolbarStore();
    toolbarStore.setActiveTile('wall');
  });
  keyboard.on('keydown-TWO', () => {
    const toolbarStore = useToolbarStore();
    toolbarStore.setActiveTile('floor');
  });
  keyboard.on('keydown-THREE', () => {
    const toolbarStore = useToolbarStore();
    toolbarStore.setActiveTile('unlinkedPortal');
  });

  // G - toggle сетки
  keyboard.on('keydown-G', () => {
    const uiStore = useUIStore();
    uiStore.toggleGrid();
  });
}

class TilemapController {
  constructor({ scene }: { scene: Scene }) {
    const {
      cameras: { main: camera },
    } = scene;
    const { tilemapWidthAtTiles, tilemapHeightAtTiles } = (() => {
      const tilemapSizeMultiplier = 5;
      const k = tilemapSizeMultiplier / CAMERA_CONFIG.minZoom / TILE_SIZE;
      const tilemapWidthAtTiles = Math.ceil(k * camera.width);
      const tilemapHeightAtTiles = Math.ceil(k * camera.height);
      return { tilemapWidthAtTiles, tilemapHeightAtTiles };
    })();

    const tilemap = scene.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: tilemapWidthAtTiles * TILE_SIZE,
      height: tilemapHeightAtTiles * TILE_SIZE,
    });
    const tilesetKey = 'tiles';
    const tileset = tilemap.addTilesetImage(TILE_TEXTURE_KEY, tilesetKey, TILE_SIZE, TILE_SIZE, 0, TILE_SPACING);
    if (!tileset) {
      console.error('error add tileset ', tilesetKey);
      return;
    }

    const { offsetTilesX, offsetTilesY } = (() => {
      const { centerX, centerY } = camera;
      const offsetTilesX = Math.round(centerX - (tilemapWidthAtTiles * TILE_SIZE) / 2) / TILE_SIZE;
      const offsetTilesY = Math.round(centerY - (tilemapHeightAtTiles * TILE_SIZE) / 2) / TILE_SIZE;
      return { offsetTilesX, offsetTilesY };
    })();

    const tileLayerKey = 'layer0';
    const tileLayer = tilemap
      .createLayer(tileLayerKey, tileset, offsetTilesX * TILE_SIZE, offsetTilesY * TILE_SIZE)
      ?.putTilesAt(
        TilemapController.buildTileLayerData({
          widthTiles: tilemapWidthAtTiles,
          heightTiles: tilemapHeightAtTiles,
          offsetTilesX,
          offsetTilesY,
        }),
        0,
        0
      );
    if (!tileLayer) {
      console.error('error create tileLayer ', tileLayerKey);
      return;
    }
  }
  update() {}
  private static buildTileLayerData({
    widthTiles,
    heightTiles,
    offsetTilesX,
    offsetTilesY,
  }: {
    widthTiles: number;
    heightTiles: number;
    offsetTilesX: number;
    offsetTilesY: number;
  }) {
    const levelStore = useLevelStore();
    const { currentLevelIndex } = levelStore;
    const getTile = levelStore.getTile.bind(levelStore);
    return Array.from({ length: heightTiles }, (_, y) =>
      Array.from(
        { length: widthTiles },
        (_, x) => TILE_INDEX[(getTile(currentLevelIndex, x + offsetTilesX, y + offsetTilesY) ?? DEFAULT_TILE).type]
      )
    );
  }

  static calculateTimeToTraverse({
    minTilemapSizeInPixels,
    fraction = 1 / 20,
  }: {
    minTilemapSizeInPixels: number;
    fraction?: number;
  }) {
    // Максимальная скорость камеры при minZoom
    // speed = moveSpeed × (maxZoom / minZoom)
    const distanceInPixels = minTilemapSizeInPixels * fraction;
    const MAX_SPEED_PX_PER_MSEC = CAMERA_CONFIG.moveSpeed * (CAMERA_CONFIG.maxZoom / CAMERA_CONFIG.minZoom);
    const timeInMs = distanceInPixels / MAX_SPEED_PX_PER_MSEC;
    return Math.round(timeInMs);
  }
}
