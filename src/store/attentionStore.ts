import { debounce } from 'lodash-es';
import { nanoid } from 'nanoid';
import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';

import { getSaveWorker } from '@/workers/saveWorkerProxy';

// ============================================================
// === TYPES ===
// ============================================================

/** Идентификатор пула задач */
export type TaskPool = 'active' | 'resumed' | 'pending' | 'paused';

/**
 * Входные данные для создания новой задачи.
 *
 * ЗАЧЕМ: Минимальный набор для addTask(), остальное генерируется автоматически.
 * cost и duration — независимые параметры (cost=1 может быть 5с или 60с).
 */
export interface TaskInput {
  /** Цена внимания */
  cost: number;
  /** Длительность в мс */
  duration: number;
  /** Тип задачи */
  type: string;
  /** Payload специфичный для типа */
  payload: unknown;
}
/**
 * Базовая задача для сохранения в IndexedDB.
 *
 * ЗАЧЕМ: Минимальный набор данных для восстановления состояния после reload.
 */
export interface TaskSaved extends TaskInput {
  /** Уникальный идентификатор задачи */
  id: string;
  /** Прогресс выполнения в миллисекундах */
  elapsedMs: number;
}
/**
 * Runtime-расширение задачи.
 *
 * ЗАЧЕМ: lastTickTime нужен для корректного расчёта deltaMs при updateProgress.
 * Не сохраняется — при загрузке устанавливается в Date.now().
 */
export interface TaskRuntime extends TaskSaved {
  /** Timestamp последнего tick (для расчёта delta) */
  lastTickTime: number;
}

// ============================================================
// === ATTENTION STORE ===
// ============================================================

/**
 * Стор состояния внимания подземелья.
 *
 * ЗАЧЕМ: Централизованное управление ресурсом "внимание".
 * attentionCoefficient прокачивается — увеличивает ёмкость пула.
 *
 * ВЗАИМОДЕЙСТВИЕ: Читается useTaskManagerStore для canFit().
 */
export const useAttentionStore = defineStore('attention', () => {
  const attentionCoefficient = shallowRef(0);
  const usedAttention = computed(() =>
    attentionCoefficient.value > 0 ? useActiveTasksStore().totalCost / attentionCoefficient.value : 0
  );
  return {
    /** Коэффициент внимания (int, прокачивается). */
    attentionCoefficient,
    /**
     * Доля занятого внимания (0.0 - 1.0).
     * Формула: Σ(task.cost) / attentionCoefficient
     */
    usedAttention,
    /**
     * Доля свободного внимания (0.0 - 1.0).
     * Формула: 1 - usedAttention
     */
    freeAttention: computed(() => 1 - usedAttention.value),
    /**
     * Установить коэффициент внимания.
     * ГРАНИЧНЫЕ СЛУЧАИ: Вызывает tryFillPool — могут активироваться ожидающие задачи.
     */
    setAttentionCoefficient: (value: number) => {
      if (attentionCoefficient.value === value) return;
      attentionCoefficient.value = value;
      useTaskManagerStore().tryFillPool();
    },
    /**
     * Загрузить лимит внимания из воркера.
     * ВЗАИМОДЕЙСТВИЕ: Интеграция с IndexedDB (позже).
     */
    loadFromWorker: async () => {
      attentionCoefficient.value = await getSaveWorker().getAttentionLimit();
    },
  };
});

// ============================================================
// === ACTIVE TASKS STORE ===
// ============================================================

/**
 * Стор активных задач.
 *
 * ЗАЧЕМ: Только активные задачи занимают внимание и прогрессируют.
 * Map для O(1) доступа по id.
 */
export const useActiveTasksStore = defineStore('activeTasks', () => {
  const tasks = shallowRef(new Map<string, TaskRuntime>());
  const totalCost = shallowRef(0);
  return {
    /** Активные задачи: id → TaskRuntime */
    tasks,
    /** Сумма cost всех активных задач */
    totalCost,
    /** Добавить задачу в активный пул */
    add: (task: TaskRuntime) => {
      tasks.value.set(task.id, task);
      totalCost.value += task.cost;
    },
    /** Удалить задачу из активного пула */
    remove: (taskId: string) => {
      const task = tasks.value.get(taskId);
      if (!task) return;
      totalCost.value -= task.cost;
      tasks.value.delete(taskId);
    },
    /** Получить задачу по id */
    get: (taskId: string) => tasks.value.get(taskId),
    /** Получить все задачи */
    getAll: () => Array.from(tasks.value.values()),
    /** Проверить наличие задачи */
    has: (taskId: string) => tasks.value.has(taskId),
  };
});

// ============================================================
// === RESUMED TASKS STORE ===
// ============================================================

/**
 * Стор очереди возвращённых из паузы задач.
 *
 * ЗАЧЕМ: FIFO очередь для справедливого распределения внимания.
 * resumed имеет приоритет над pending (уже начатые важнее).
 * Array для сохранения порядка.
 */
export const useResumedTasksStore = defineStore('resumedTasks', () => {
  const tasks = shallowRef<TaskRuntime[]>([]);
  return {
    /** Очередь задач в порядке FIFO */
    tasks,
    /** Первая задача в очереди (для tryFillPool) */
    first: computed(() => tasks.value[0]),
    /** Добавить задачу в конец очереди */
    push: (task: TaskRuntime) => {
      tasks.value.push(task);
    },
    /** Извлечь первую задачу из очереди */
    shift: () => tasks.value.shift(),
    /** Удалить задачу по id (для cancel) */
    remove: (taskId: string) => {
      const index = tasks.value.findIndex(t => t.id === taskId);
      if (index !== -1) tasks.value.splice(index, 1);
    },
    /** Получить все задачи (для greedy pass) */
    getAll: () => [...tasks.value],
  };
});

// ============================================================
// === PENDING TASKS STORE ===
// ============================================================

/**
 * Стор очереди новых задач.
 *
 * ЗАЧЕМ: FIFO очередь для справедливого распределения внимания.
 * resumed имеет приоритет над pending (уже начатые важнее).
 * Array для сохранения порядка.
 */
export const usePendingTasksStore = defineStore('pendingTasks', () => {
  const tasks = shallowRef<TaskRuntime[]>([]);
  return {
    /** Очередь задач в порядке FIFO */
    tasks,
    /** Первая задача в очереди (для tryFillPool) */
    first: computed(() => tasks.value[0]),
    /** Добавить задачу в конец очереди */
    push: (task: TaskRuntime) => {
      tasks.value.push(task);
    },
    /** Извлечь первую задачу из очереди */
    shift: () => tasks.value.shift(),
    /** Удалить задачу по id (для cancel) */
    remove: (taskId: string) => {
      const index = tasks.value.findIndex(t => t.id === taskId);
      if (index !== -1) tasks.value.splice(index, 1);
    },
    /** Получить все задачи (для greedy pass) */
    getAll: () => [...tasks.value],
  };
});

// ============================================================
// === PAUSED TASKS STORE ===
// ============================================================

/**
 * Стор приостановленных задач.
 *
 * ЗАЧЕМ: Пауза ОСВОБОЖДАЕТ внимание — тактическое управление очередью.
 * Прогресс сохраняется, elapsedMs не увеличивается.
 * Map для O(1) доступа.
 */
export const usePausedTasksStore = defineStore('pausedTasks', () => {
  const tasks = shallowRef(new Map<string, TaskRuntime>());
  return {
    /** Приостановленные задачи: id → TaskRuntime */
    tasks,
    /** Добавить задачу на паузу */
    add: (task: TaskRuntime) => {
      tasks.value.set(task.id, task);
    },
    /** Удалить задачу с паузы (для resume) */
    remove: (taskId: string) => {
      tasks.value.delete(taskId);
    },
    /** Получить задачу по id */
    get: (taskId: string) => tasks.value.get(taskId),
  };
});

// ============================================================
// === TASK MANAGER STORE ===
// ============================================================

/**
 * Координатор системы задач.
 *
 * ЗАЧЕМ: Единая точка входа для операций с задачами.
 * Управляет перемещением между пулами и заполнением активного пула.
 *
 * АЛГОРИТМ заполнения:
 * 1. Последовательный (FIFO): сначала resumed, затем pending
 * 2. Жадный (по таймеру 30с): если первая не влезает — ищем меньшие
 */
export const useTaskManagerStore = defineStore('taskManager', () => {
  // Внутренние методы
  const canFit = (task: TaskRuntime) => {
    const { freeAttention, attentionCoefficient } = useAttentionStore();
    const requiredAttention = task.cost / attentionCoefficient;
    return freeAttention >= requiredAttention;
  };

  const activate = (task: TaskRuntime) => {
    task.lastTickTime = Date.now();
    const activeStore = useActiveTasksStore();
    activeStore.add(task);
  };

  const greedyPassScheduled = shallowRef(false);
  const scheduleGreedyPass = () => {
    greedyPassScheduled.value = true;
    setTimeout(() => {
      const resumedStore = useResumedTasksStore();
      for (const task of resumedStore.getAll()) {
        if (!canFit(task)) continue;
        resumedStore.remove(task.id);
        activate(task);
      }
      const pendingStore = usePendingTasksStore();
      for (const task of pendingStore.getAll()) {
        if (!canFit(task)) continue;
        pendingStore.remove(task.id);
        activate(task);
      }
      greedyPassScheduled.value = false;
    }, 30000);
  };

  const greedyPassEnabled = shallowRef(false);
  const tryFillPool = debounce(() => {
    // 1. Сначала возвращённые из паузы (приоритет)
    const resumedStore = useResumedTasksStore();
    while (resumedStore.first && canFit(resumedStore.first)) {
      const task = resumedStore.shift();
      if (task) activate(task);
    }

    // 2. Затем pending
    const pendingStore = usePendingTasksStore();
    while (pendingStore.first && canFit(pendingStore.first)) {
      const task = pendingStore.shift();
      if (task) activate(task);
    }

    // 3. Если первая задача не влезает — запустить таймер
    const nextTask = resumedStore.first ?? pendingStore.first;
    if (nextTask && !canFit(nextTask) && greedyPassEnabled.value && !greedyPassScheduled.value) {
      scheduleGreedyPass();
    }
  }, 100);

  return {
    /** Включить жадный проход (прокачивается) */
    greedyPassEnabled,
    /**
     * Создать новую задачу и добавить в pending.
     * ГРАНИЧНЫЕ СЛУЧАИ: Вызывает tryFillPool — может сразу стать активной.
     */
    addTask: (input: TaskInput) => {
      usePendingTasksStore().push({
        id: nanoid(),
        type: input.type,
        cost: input.cost,
        elapsedMs: 0,
        duration: input.duration,
        payload: input.payload,
        lastTickTime: Date.now(),
      });
      tryFillPool();
    },
    /**
     * Приостановить активную задачу.
     * АЛГОРИТМ: active → paused, освобождает внимание, вызывает tryFillPool.
     */
    pauseTask: (taskId: string) => {
      const activeStore = useActiveTasksStore();
      const task = activeStore.get(taskId);
      if (!task) return;
      const pausedStore = usePausedTasksStore();
      activeStore.remove(taskId);
      pausedStore.add(task);
      tryFillPool();
    },
    /**
     * Возобновить приостановленную задачу.
     * АЛГОРИТМ: paused → resumed (в конец), вызывает tryFillPool.
     */
    resumeTask: (taskId: string) => {
      const pausedStore = usePausedTasksStore();
      const task = pausedStore.get(taskId);
      if (!task) return;
      const resumedStore = useResumedTasksStore();
      pausedStore.remove(taskId);
      resumedStore.push(task);
      tryFillPool();
    },
    /**
     * Отменить задачу из любого пула.
     * ГРАНИЧНЫЕ СЛУЧАИ: Если была active — вызывает tryFillPool.
     */
    cancelTask: (taskId: string) => {
      const activeStore = useActiveTasksStore();
      if (activeStore.has(taskId)) {
        activeStore.remove(taskId);
        tryFillPool();
        return;
      }
      useResumedTasksStore().remove(taskId);
      usePendingTasksStore().remove(taskId);
      usePausedTasksStore().remove(taskId);
    },
    /**
     * Завершить активную задачу.
     * АЛГОРИТМ: Удалить из active, вызвать tryFillPool.
     */
    completeTask: (taskId: string) => {
      const activeStore = useActiveTasksStore();
      if (!activeStore.has(taskId)) return;
      activeStore.remove(taskId);
      tryFillPool();
    },
    /**
     * Обновить прогресс задачи.
     * @returns true если задача завершена (elapsedMs >= duration)
     */
    updateProgress: (taskId: string, deltaMs: number) => {
      const activeStore = useActiveTasksStore();
      const task = activeStore.get(taskId);
      if (!task) return false;
      task.elapsedMs += deltaMs;
      return task.elapsedMs >= task.duration;
    },
    /**
     * Найти задачу в любом пуле.
     * @returns TaskRuntime или undefined
     */
    getTask: (taskId: string) => {
      const activeStore = useActiveTasksStore();
      const active = activeStore.get(taskId);
      if (active) return active;
      const pausedStore = usePausedTasksStore();
      const paused = pausedStore.get(taskId);
      if (paused) return paused;
      const resumedStore = useResumedTasksStore();
      const resumed = resumedStore.getAll().find(t => t.id === taskId);
      if (resumed) return resumed;
      const pendingStore = usePendingTasksStore();
      const pending = pendingStore.getAll().find(t => t.id === taskId);
      if (pending) return pending;
      return undefined;
    },
    /**
     * Попытка заполнить активный пул (debounced 100ms).
     * ЗАЧЕМ: Дедупликация при множественных изменениях.
     */
    tryFillPool,
  };
});
