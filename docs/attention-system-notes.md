# Система внимания подземелья — Заметки

## Архитектура проекта

**Два независимых модуля:**

| Модуль                        | Описание                                  | Зависимости         |
| ----------------------------- | ----------------------------------------- | ------------------- |
| **Менеджер задач и внимания** | Универсальная система управления задачами | Независимый         |
| **Захват тайлов**             | Конкретная реализация задачи              | Использует менеджер |

**Фокус сейчас:** менеджмент задач и внимания (универсальный).

---

## Архитектура сохранений

**Единый debounce триггер** — все геймплейные данные сохраняются через единую точку:

- Пометка данных как dirty (levels, capturing, dungeonState)
- Один throttled/debounced вызов `persistAll()`
- Синхронизация всех изменённых данных в одной транзакции

**Причина**: нужна консистентность между тайлами, задачами захвата и состоянием подземелья.

---

## Загрузка задач

**Загружать весь список сразу** — не lazy loading:

- Нужно немедленно реагировать на завершение задач
- Задачи могут завершиться сразу после загрузки (если elapsedMs >= duration)
- Количество задач ограничено вниманием (не будет тысяч записей)

---

## Континуальное внимание

**Формула свободного внимания:**

```
freeAttention = 1 - Σ(task_cost_i / attentionCoefficient)
```

| Параметр               | Тип   | Описание                                        |
| ---------------------- | ----- | ----------------------------------------------- |
| `task_cost_i`          | int   | Цена конкретной задачи (целое число)            |
| `attentionCoefficient` | int   | Коэффициент внимания подземелья (прокачивается) |
| `freeAttention`        | float | Доля свободного внимания (0.0 - 1.0)            |

**Пример:**

- attentionCoefficient = 8
- Задачи: cost=1, cost=2, cost=1
- usedAttention = (1 + 2 + 1) / 8 = 0.5
- freeAttention = 1 - 0.5 = 0.5 (50%)

**Следствия:**

- Можно начать задачу с cost=1 если freeAttention >= 1/8 = 0.125
- UI показывает проценты или дробь
- Прокачка attentionCoefficient увеличивает ёмкость

**Учёт пулов:**

```typescript
// Только АКТИВНЫЕ задачи занимают внимание
const usedAttention = activePool
  .values()
  .reduce((sum, task) => sum + task.cost, 0) / attentionCoefficient;

const freeAttention = 1 - usedAttention;

// pending и paused НЕ занимают внимание
```

---

## Система пауз

### Индивидуальная пауза задачи

- Пользователь может приостановить конкретную задачу
- **Пауза ОСВОБОЖДАЕТ внимание** — задача выходит из активного пула
- `elapsedMs` не увеличивается
- Прогресс сохраняется

**Геймплейный смысл:**

- Контроль ресурсов
- Освобождение места под более дорогую/срочную задачу
- Тактическое управление очередью

### Общая пауза игры

- Все задачи приостанавливаются
- Глобальный флаг `isPaused` (не в каждой задаче)
- При resume — обновить `lastTickTime` для всех активных задач
- Не влияет на распределение внимания (задачи остаются в своих пулах)

---

## Структуры хранения задач

**Четыре пула:**

| Пул                  | Структура       | Описание                                     |
| -------------------- | --------------- | -------------------------------------------- |
| **Активные**         | `Map<id, Task>` | Задачи в работе, занимают внимание           |
| **Возвращённые**     | `Array<Task>`   | Возвращённые из паузы, приоритет над pending |
| **Новые (pending)**  | `Array<Task>`   | Очередь на выполнение, важен порядок (FIFO)  |
| **Приостановленные** | `Map<id, Task>` | Задачи на паузе, прогресс сохранён           |

**Потоки между пулами:**

```
                                    ┌──────────────┐
                     добавить ──────▶   PENDING    │ (Array, FIFO)
                                    └──────┬───────┘
                                           │
    ┌──────────────┐                       │
    │ ВОЗВРАЩЁННЫЕ │ (Array, приоритет)    │
    └──────┬───────┘                       │
           │         заполнение пула       │
           └───────────────┬───────────────┘
                           ▼
                    ┌──────────────┐
                    │   АКТИВНЫЕ   │ (Map, занимают внимание)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         завершить     поставить    отменить
                       на паузу
                           │
                           ▼
                    ┌──────────────┐
                    │ПРИОСТАНОВЛЕН.│ (Map, прогресс сохранён)
                    └──────┬───────┘
                           │ возобновить
                           ▼
                      → ВОЗВРАЩЁННЫЕ (в конец)
```

---

## Алгоритм заполнения пула

### Этап 1: Последовательный (FIFO с приоритетом resumed)

```typescript
function fillPoolSequential() {
  // 1. Сначала возвращённые из паузы (приоритет)
  while (resumed.length > 0 && canFit(resumed[0])) {
    activate(resumed.shift());
  }

  // 2. Затем pending
  while (pending.length > 0 && canFit(pending[0])) {
    activate(pending.shift());
  }

  // 3. Если первая задача не влезает — запустить таймер
  const nextTask = resumed[0] ?? pending[0];
  if (nextTask && !canFit(nextTask) && !greedyPassScheduled) {
    scheduleGreedyPass();
  }
}
```

### Debounced метод заполнения пула

**Единая точка входа** — `tryFillPool()` с debounce:

```typescript
const tryFillPool = debounce(() => {
  fillPoolSequential();
}, 100);  // 100ms debounce
```

**Триггеры вызова:**

| Событие             | Когда вызывать              |
| ------------------- | --------------------------- |
| Загрузка игры       | После `initialize()`        |
| Добавление задачи   | В pending или resumed       |
| Удаление активной   | `cancelTask()` из active    |
| Завершение активной | `completeTask()`            |
| Изменение лимита    | `setAttentionCoefficient()` |

**Реализация:**

```typescript
// Все методы, меняющие состояние, вызывают tryFillPool()
function addTask(task: TaskInput) {
  pending.push(createTask(task));
  tryFillPool();
}

function resumeTask(taskId: string) {
  const task = paused.get(taskId);
  if (!task) return;
  paused.delete(taskId);
  resumed.push(task);
  tryFillPool();
}

function completeTask(taskId: string) {
  active.delete(taskId);
  tryFillPool();
}

function cancelActiveTask(taskId: string) {
  active.delete(taskId);
  tryFillPool();
}

function setAttentionCoefficient(value: number) {
  attentionCoefficient = value;
  tryFillPool();
}
```

### Этап 2: Жадный проход (по таймеру)

**Триггер:** первая задача не влезает в пул

```typescript
function fillPoolSequential() {
  // 1. Сначала resumed
  while (resumed.length > 0 && canFit(resumed[0])) {
    activate(resumed.shift());
  }

  // 2. Затем pending
  while (pending.length > 0 && canFit(pending[0])) {
    activate(pending.shift());
  }

  // 3. Если первая не влезает — запустить таймер жадного прохода
  const nextTask = resumed[0] ?? pending[0];
  if (nextTask && !canFit(nextTask) && greedyPassEnabled && !greedyPassScheduled) {
    scheduleGreedyPass();
  }
}

function scheduleGreedyPass() {
  greedyPassScheduled = true;
  // scheduledAt НЕ сохраняем — при reload таймер сбрасывается

  setTimeout(() => {
    greedyPassScheduled = false;
    fillPoolGreedy();
  }, 30_000);
}

function fillPoolGreedy() {
  // Лимит мог измениться за 30 сек — используем актуальный
  const combined = [...resumed, ...pending];

  for (const task of combined) {
    if (canFit(task)) {
      activate(task);
      removeFromQueue(task);
    }
  }
}
```

### Состояние в сторе

```typescript
interface TaskManagerState {
  // Пулы
  active: Map<string, TaskRuntime>;
  resumed: TaskRuntime[];           // возвращённые из паузы
  pending: TaskRuntime[];           // новые задачи
  paused: Map<string, TaskRuntime>;

  // Конфигурация
  attentionCoefficient: number;
  greedyPassEnabled: boolean;       // флаг включения жадного прохода

  // Runtime (не сохраняется)
  greedyPassScheduled: boolean;     // таймер запущен
}
```

### Диаграмма

```
┌──────────────────────────────────────────────────────────────────┐
│                     tryFillPool() [debounced]                    │
├──────────────────────────────────────────────────────────────────┤
│  Триггеры:                                                       │
│  • initialize()        • addTask()         • resumeTask()        │
│  • completeTask()      • cancelActiveTask()                      │
│  • setAttentionCoefficient()                                     │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                      fillPoolSequential()                        │
├──────────────────────────────────────────────────────────────────┤
│  while resumed[0] влезает:  resumed → active                     │
│  while pending[0] влезает:  pending → active                     │
│                                                                  │
│  if первая не влезает && greedyPassEnabled && !scheduled:        │
│      scheduleGreedyPass() → таймер 30 сек                        │
└──────────────────────────────────────────────────────────────────┘
                                   │
                                   │ через 30 сек (если scheduled)
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                        fillPoolGreedy()                          │
├──────────────────────────────────────────────────────────────────┤
│  combined = [...resumed, ...pending]                             │
│  for task in combined: if влезает → activate                     │
└──────────────────────────────────────────────────────────────────┘
```

### Геймплейный смысл

**Раннее развитие:**

- Важно добавлять задачи в правильном порядке
- Оптимизация использования пула — часть геймплея
- Интересный тактический выбор
- `greedyPassEnabled = false` → строгий FIFO

**Среднее развитие:**

- attentionCoefficient вырос
- Можно включить `greedyPassEnabled = true`
- Порядок задач менее важен
- Механика теряет значимость → не надоедает

**Возвращённые задачи:**

- Приоритет над pending (уже начатые важнее)
- Игрок может стратегически использовать паузу
- Возврат из паузы → в конец resumed (не в начало)

---

## Таймеры Phaser — Исследование

### Как работает Phaser.Time.Clock

- **Синхронизация с game loop** — таймеры привязаны к игровому циклу
- **Автоматическая пауза** — при паузе сцены/игры таймеры останавливаются
- **Точность** — ограничена частотой кадров (~16.67ms при 60fps)
- **Отклонение при паузе** — до 16.67ms (один кадр)

### TimerEvent.paused

**Это поле, не метод.** Phaser отслеживает его:

```typescript
// Пример из TilemapController
this.motionTimer = this.scene.time.addEvent({
  delay: 100,
  callback: () => { /* ... */ },
  loop: true,
  paused: true,  // начать на паузе
});

// Снять паузу
this.motionTimer.paused = false;
```

**Точность до кадра (16ms) — достаточно** для задач длительностью 15+ секунд.

### Вывод: можно использовать Phaser TimerEvent

**Подходит для:**

- Общая пауза игры (автоматическая)
- Точность до кадра достаточна
- Интеграция с Phaser lifecycle

**Но для задач нужен свой tick:**

- Индивидуальная пауза меняет пул (активные → приостановленные)
- Это логика менеджера, не просто остановка таймера
- Нужен контроль над elapsedMs для сохранения

### Гибридный подход

```typescript
// Общая пауза — через Phaser
scene.time.paused = true;  // все таймеры встают

// Индивидуальная пауза — через менеджер задач
taskManager.pauseTask(taskId);  // перемещает в пул приостановленных
```

---

## Геймплей внимания

**Цель**: управление вниманием — одна из основных частей геймплея.

**Идеи:**

- Приоритизация задач (какую задачу возобновить первой)
- Очередь задач (если внимания не хватает — в очередь)
- Бонусы к скорости задач за свободное внимание
- События/кризисы, требующие внимания
- Исследования для увеличения attentionCoefficient

---

## Структура данных (обновлённая)

### Менеджер задач (универсальный)

```typescript
// IndexedDB: dungeonState
interface DungeonState {
  attentionCoefficient: number;  // int, прокачивается
  poolFillCooldownUntil?: number; // timestamp окончания 30сек паузы заполнения
}

// IndexedDB: tasks
interface TaskSaved {
  id: string;
  type: string;           // 'capture' | 'build' | 'research' | ...
  cost: number;           // цена в единицах внимания (int)
  elapsedMs: number;
  duration: number;       // НЕ связан с cost (cost=1 может быть 5с или 60с)
  pool: 'active' | 'resumed' | 'pending' | 'paused';
  order: number;          // для FIFO в resumed/pending
  payload: unknown;       // данные специфичные для типа задачи
}

// cost и duration — независимые параметры
// Примеры:
// • Захват тайла:     cost=1, duration=15000  (15 сек)
// • Исследование:     cost=3, duration=60000  (60 сек)
// • Быстрая разведка: cost=1, duration=5000   (5 сек)

// Runtime
interface TaskRuntime extends TaskSaved {
  lastTickTime: number;
}
```

### Захват тайлов (конкретная реализация)

```typescript
// payload для type='capture'
interface CapturePayload {
  X: number;
  Y: number;
  targetIndex: TileIndexes;
}

// Пример полной задачи захвата
const captureTask: TaskSaved = {
  id: 'capture_5_3',
  type: 'capture',
  cost: 1,
  elapsedMs: 0,
  duration: 15000,
  pool: 'pending',
  order: 42,
  payload: { X: 5, Y: 3, targetIndex: 0 },
};
```

### Пулы в runtime

```typescript
interface TaskManager {
  // Пулы
  active: Map<string, TaskRuntime>;    // занимают внимание
  resumed: TaskRuntime[];              // возвращённые из паузы (приоритет)
  pending: TaskRuntime[];              // очередь новых (FIFO)
  paused: Map<string, TaskRuntime>;    // на паузе, прогресс сохранён

  // Внимание
  attentionCoefficient: number;

  // Жадный проход (persist только greedyPassEnabled)
  greedyPassEnabled: boolean;          // включить ли жадный проход
  greedyPassScheduled: boolean;        // runtime only, не сохраняется
}
```

---

## Открытые вопросы

1. ~~Очередь задач — нужна ли?~~ → **Да, четыре пула**
2. ~~Прерывание задач — потеря прогресса?~~ → **Нет, прогресс сохраняется**
3. ~~Возобновление из паузы~~ → **В конец resumed (приоритет над pending)**
4. ~~Persist greedyPassScheduledAt~~ → **Нет, при reload таймер сбрасывается**
5. ~~Связь цены и длительности~~ → **Независимые параметры**
6. **UI для управления задачами** — как показать список по пулам?
7. **Отмена задачи** — потеря прогресса? возврат ресурсов?
