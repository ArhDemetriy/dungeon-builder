# Dungeon Builder

2D игра-песочница о строительстве подземелья в фэнтези мире.

## Концепция

Игрок строит и управляет подземельем:

- Создание многоуровневого подземелья (вглубь земли)
- Размещение комнат, мастерских, хранилищ
- Управление ресурсами и постройками
- **(Позже)** Враги, защита, экономика

**Текущая фаза:** Базовая механика строительства, управление камерой, сохранение состояния в IndexedDB.

## Стек технологий

### Core

- **TypeScript 5.9** — строгая типизация
- **Phaser 3** — 2D игровой движок
- **Vue 3** — UI overlay (`<script setup>`)
- **Pinia** — state management (Composition API)
- **Bun** — пакетный менеджер и runtime

### Данные

- **IndexedDB** (через idb) — хранение уровней
- **Web Worker** (через Comlink) — асинхронное сохранение
- **pinia-plugin-persistedstate** — персистентность UI состояния

### Инструменты

- **Vite** (Rolldown) — быстрая сборка
- **Tailwind CSS v4** — стилизация UI
- **lodash-es** — утилиты
- **neverthrow** — Result-based error handling
- **clsx** — условные классы

### Будущее

- **Electron** — desktop версия
- **Steam** — возможная платформа

## Быстрый старт

```bash
# Установка
bun install

# Разработка
bun run dev

# Сборка
bun run build

# Проверка типов
bun run tsc

# Линтинг
bun run lint
bun run prettier-check
```

## Структура проекта

```
src/
├── game/                  # Phaser игровая логика
│   ├── controllers/       # Контроллеры (TilemapController)
│   ├── scenes/            # Сцены (PreloadScene, MainScene)
│   ├── constants.ts       # Конфигурация тайлов, камеры, стриминга
│   └── config.ts          # Конфигурация Phaser
├── store/                 # Pinia stores
│   ├── cameraStore.ts     # Зум и позиция камеры
│   └── toolbarStore.ts    # Активный тайл
├── workers/               # Web Workers
│   ├── saveWorker.ts      # IndexedDB операции
│   └── saveWorkerProxy.ts # Comlink proxy
├── components/            # Vue UI компоненты
│   └── Toolbar.vue        # Панель инструментов
├── types/                 # TypeScript типы
│   ├── level.ts           # TileIndexes, TileKeys, Level
│   └── utils.ts           # Утилитарные типы
├── PhaserGame.ts          # Vue wrapper для Phaser
├── App.vue                # Главный компонент
└── main.ts                # Entry point
```

## Текущие возможности

### Управление камерой

- **WASD** — движение камеры
- **Колесико мыши** — зум (0.2x - 3x)
- **Автосохранение** — зум и позиция сохраняются (localStorage)

### Строительство

- **ЛКМ** — размещение тайла
- **Средняя кнопка** — пипетка (выбор тайла под курсором)
- **1 / 2** — быстрый выбор типа тайла
- **Связность** — тайлы размещаются только рядом с существующими

### Тайлы

- `grass0` — базовый тёмный тайл
- `grass1` — коричневый тайл

### Техническое

- **Tilemap Streaming** — double buffering для бесконечной карты
- **Safe Zone** — оптимизация (80% кадров без перегенерации)
- **Predictive Loading** — упреждающая загрузка по направлению движения
- **IndexedDB** — тайлы хранятся как числовые индексы (TileIndexes)
- **Web Worker** — сохранение не блокирует UI

## Архитектурные решения

### Tilemap Streaming

```
Motion Timer (50-200ms) → Velocity Tracking → Predictive Analysis
                                    ↓
                           Safe Zone Check (Fast Path)
                                    ↓
                           Double Buffering (layer swap)
```

- **EMA сглаживание** скорости камеры
- **Квадратичная экстраполяция** позиции
- **Адаптивные пороги** по направлению движения

### State Management

- **Pinia** — Composition API style
- **Раздельные stores** — camera, toolbar
- **Persist middleware** — автоматическое сохранение

### Phaser + Vue

- Phaser отвечает за игровую логику и рендеринг
- Vue для UI overlay (панель инструментов)
- Pinia как мост между ними

### Хранение данных

- **IndexedDB** — уровни (tiles как `TileIndexes`)
- **localStorage** — UI состояние (камера, выбранный тайл)
- **Web Worker** — изоляция I/O от main thread

### Импорты

- Алиас `@/*` вместо относительных путей
- Именованные импорты (не default)
- Type imports через `type` keyword

## Документация

- **[Style Guide](./STYLEGUIDE.md)** — правила написания кода

## Roadmap

### v0.1 — Базовая механика ✅

- [x] Инициализация Phaser + Vue
- [x] Управление камерой (WASD, зум)
- [x] Сохранение состояния (IndexedDB + localStorage)
- [x] Tilemap streaming (бесконечная карта)
- [x] UI панель инструментов
- [x] Размещение тайлов (ЛКМ)
- [x] Пипетка (средняя кнопка)

### v0.2 — Строительство

- [ ] Больше типов тайлов (стена, пол, пустота)
- [ ] Типы построек (комната, мастерская, хранилище)
- [ ] Drag-to-build механика
- [ ] Удаление тайлов
- [ ] Множественные уровни (UI переключения)

### v0.3 — Ресурсы

- [ ] Система ресурсов (камень, дерево, золото)
- [ ] Стоимость построек
- [ ] Добыча ресурсов

### v0.4+ — Геймплей

- [ ] NPC рабочие
- [ ] Враги и защита
- [ ] Экономика
- [ ] Квесты/задания

## Для нейроагентов

При работе с проектом:

1. **Читай стайлгайд** — все правила там
2. **Inline types** — не создавай интерфейсы без необходимости
3. **Алиас @/** — всегда для импортов из src/
4. **neverthrow** — для обработки ошибок
5. **Раздельные stores** — не объединяй логически разные состояния
6. **TileIndexes** — тайлы хранятся как числа (0, 1), не объекты

## Контрибьютинг

Проект в активной разработке. Стайлгайд обязателен к соблюдению.

## License

Creative Commons Attribution-NonCommercial 4.0 International Public License

См. [LICENSE](./LICENSE) для полного текста лицензии.
