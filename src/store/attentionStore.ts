import { debounce } from 'lodash-es';
import { nanoid } from 'nanoid';
import { defineStore } from 'pinia';
import { computed, shallowRef, triggerRef } from 'vue';

import { getSaveWorker } from '@/workers/saveWorkerProxy';

/**
 * Входные данные для создания новой задачи.
 */
interface TaskInput {
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
 */
export interface TaskSaved extends TaskInput {
  /** Уникальный идентификатор задачи */
  id: string;
  /** Прогресс выполнения в миллисекундах */
  elapsedMs: number;
}

const MINIMAL_COST = 1 satisfies TaskInput['cost'];
/**
 * Стор состояния внимания подземелья.
 */
export const useAttentionStore = defineStore('attention', () => {
  const attentionCoefficient = shallowRef(0);
  const usedAttention = computed(() =>
    attentionCoefficient.value > 0 ? useActiveTasksStore().totalCost / attentionCoefficient.value : 0
  );
  const freeAttention = computed(() => 1 - usedAttention.value);
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
    freeAttention,
    canFit: ({ cost }: Pick<TaskSaved, 'cost'>) => {
      const coefficient = attentionCoefficient.value;
      if (coefficient <= 0) return false;
      return freeAttention.value >= cost / coefficient;
    },
    /**
     * Установить коэффициент внимания.
     * ГРАНИЧНЫЕ СЛУЧАИ: Вызывает tryFillPool — могут активироваться ожидающие задачи.
     */
    setAttentionCoefficient: (value: number) => {
      if (attentionCoefficient.value === value) return;
      const needUpdate = value > attentionCoefficient.value;
      attentionCoefficient.value = value;
      void getSaveWorker().setAttentionLimit(value);
      if (needUpdate) useTaskManagerStore().tryFillPool();
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

/**
 * Стор активных задач.
 */
const useActiveTasksStore = defineStore('activeTasks', () => {
  const tasks = shallowRef(new Map<string, TaskSaved>());
  return {
    /** Активные задачи */
    tasks: computed(() => Array.from(tasks.value.values())),
    /** Сумма cost всех активных задач */
    totalCost: computed(() => {
      if (!tasks.value.size) return 0;
      let totalCost = 0;
      tasks.value.forEach(task => (totalCost += task.cost));
      return totalCost;
    }),
    isEmpty: computed(() => !tasks.value.size),
    /** Добавить задачу в активный пул */
    add: (task: TaskSaved) => {
      tasks.value.set(task.id, task);
      triggerRef(tasks);
    },
    /** Удалить задачу из активного пула */
    remove: (taskId: string) => void (tasks.value.delete(taskId) && triggerRef(tasks)),
    /** Получить задачу по id */
    get: (taskId: string) => tasks.value.get(taskId),
    /** Проверить наличие задачи */
    has: (taskId: string) => tasks.value.has(taskId),
    /**
     * Обновить прогресс всех активных задач.
     * @param delta мс с последнего тика
     * @returns ids выполненных задач. Их нужно корректно завершить.
     */
    tick: (delta: number) => {
      if (delta <= 0) return [];
      const completed: string[] = [];
      tasks.value.forEach(task => {
        task.elapsedMs += delta;
        if (task.elapsedMs >= task.duration) completed.push(task.id);
      });
      return completed;
    },
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
const usePausedTasksStore = defineStore('pausedTasks', () => {
  const tasks = shallowRef(new Map<string, TaskSaved>());
  return {
    /** Приостановленные задачи */
    tasks: computed(() => Array.from(tasks.value.values())),
    /** Добавить задачу на паузу */
    add: (task: TaskSaved) => {
      tasks.value.set(task.id, task);
      triggerRef(tasks);
    },
    /** Удалить задачу с паузы (для resume) */
    remove: (taskId: string) => void (tasks.value.delete(taskId) && triggerRef(tasks)),
    /** Получить задачу по id */
    get: (taskId: string) => tasks.value.get(taskId),
  };
});

/**
 * Стор очереди возвращённых из паузы задач.
 */
const useResumedTasksStore = defineStore('resumedTasks', () => {
  const tasks = shallowRef<TaskSaved[]>([]);
  return {
    /** Очередь задач в порядке FIFO */
    tasks,
    /** Первая задача в очереди (для tryFillPool) */
    first: computed(() => tasks.value[0]),
    /** Добавить задачу в конец очереди */
    push: (task: TaskSaved) => {
      tasks.value.push(task);
      triggerRef(tasks);
    },
    /** Извлечь первую задачу из очереди */
    shift: () => {
      const task = tasks.value.shift();
      triggerRef(tasks);
      return task;
    },
    /** Удалить задачу по id (для cancel) */
    remove: (taskId: string) => {
      const index = tasks.value.findIndex(t => t.id === taskId);
      if (index < 0) return false;
      const sucsess = Boolean(tasks.value.splice(index, 1).length);
      triggerRef(tasks);
      return sucsess;
    },
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
const usePendingTasksStore = defineStore('pendingTasks', () => {
  const tasks = shallowRef<TaskSaved[]>([]);
  return {
    /** Очередь задач в порядке FIFO */
    tasks,
    /** Первая задача в очереди (для tryFillPool) */
    first: computed(() => tasks.value[0]),
    /** Добавить задачу в конец очереди */
    push: (task: TaskSaved) => {
      tasks.value.push(task);
      triggerRef(tasks);
    },
    /** Извлечь первую задачу из очереди */
    shift: () => {
      const task = tasks.value.shift();
      triggerRef(tasks);
      return task;
    },
    /** Удалить задачу по id (для cancel) */
    remove: (taskId: string) => {
      const index = tasks.value.findIndex(t => t.id === taskId);
      if (index < 0) return false;
      const sucsess = Boolean(tasks.value.splice(index, 1).length);
      triggerRef(tasks);
      return sucsess;
    },
  };
});

// ============================================================
// === TASK MANAGER STORE ===
// ============================================================

/**
 * Координатор системы задач.
 *
 * ЗАЧЕМ: Единая точка входа для операций с задачами.
 * Управляет перемещением между пулами, заполнением активного пула и таймером тиков.
 *
 * АЛГОРИТМ заполнения:
 * 1. Последовательный (FIFO): сначала resumed, затем pending
 * 2. Жадный (по таймеру 30с): если первая не влезает — ищем меньшие
 */
const useTaskManagerStore = defineStore('taskManager', () => {
  const completeTask = (taskId: string) => {
    const activeStore = useActiveTasksStore();
    if (!activeStore.has(taskId)) return;
    removeFromActive(taskId);
    tryFillPool();
  };

  let tickInterval: ReturnType<typeof setInterval> | null = null;
  const stopTicking = () => {
    if (!tickInterval) return;
    clearInterval(tickInterval);
    tickInterval = null;
  };
  const startTicking = () => {
    if (tickInterval) return;
    let lastTickTime = Date.now();
    tickInterval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickTime;
      lastTickTime = now;

      const completed = useActiveTasksStore().tick(delta);
      if (!completed.length) return;

      completed.forEach(completeTask);
    }, 1000);
  };

  const greedyPassScheduled = shallowRef(false);
  const scheduleGreedyPass = () => {
    greedyPassScheduled.value = true;
    setTimeout(() => {
      const { canFit } = useAttentionStore();
      if (!canFit({ cost: MINIMAL_COST })) return;

      const activeStore = useActiveTasksStore();
      const activate = (task: TaskSaved) => {
        const wasEmpty = activeStore.isEmpty;
        activeStore.add(task);
        if (wasEmpty) startTicking();
      };

      const resumedStore = useResumedTasksStore();
      for (const task of resumedStore.tasks) {
        if (!canFit(task)) continue;
        resumedStore.remove(task.id);
        activate(task);
      }
      if (!canFit({ cost: MINIMAL_COST })) return;

      const pendingStore = usePendingTasksStore();
      for (const task of pendingStore.tasks) {
        if (!canFit(task)) continue;
        pendingStore.remove(task.id);
        activate(task);
      }

      greedyPassScheduled.value = false;
    }, 30000);
  };

  const greedyPassEnabled = shallowRef(false);
  const tryFillPool = debounce(() => {
    console.log('in tryFillPool');

    const { canFit } = useAttentionStore();
    if (!canFit({ cost: MINIMAL_COST })) return;

    const activeStore = useActiveTasksStore();
    const activate = (task: TaskSaved) => {
      const wasEmpty = activeStore.isEmpty;
      activeStore.add(task);
      if (wasEmpty) startTicking();
    };

    // 1. Сначала возвращённые из паузы (приоритет)
    const resumedStore = useResumedTasksStore();
    console.log('tryFillPool resumedStore', resumedStore.first);
    while (resumedStore.first && canFit(resumedStore.first)) {
      const task = resumedStore.shift();
      if (task) activate(task);
    }
    if (!canFit({ cost: MINIMAL_COST })) return;

    // 2. Затем pending
    const pendingStore = usePendingTasksStore();
    console.log('tryFillPool pendingStore', pendingStore.first);
    while (pendingStore.first && canFit(pendingStore.first)) {
      const task = pendingStore.shift();
      if (task) activate(task);
    }
    if (!canFit({ cost: MINIMAL_COST })) return;

    // 3. Если первая задача не влезает — запустить таймер
    const needGreedyPass =
      greedyPassEnabled.value && !greedyPassScheduled.value && (resumedStore.first || pendingStore.first);
    if (needGreedyPass) scheduleGreedyPass();
  }, 100);

  const removeFromActive = (taskId: string) => {
    const activeStore = useActiveTasksStore();
    activeStore.remove(taskId);
    if (activeStore.isEmpty) stopTicking();
  };

  return {
    /** Включить жадный проход (прокачивается) */
    greedyPassEnabled,
    /**
     * Создать новую задачу и добавить в pending.
     * ГРАНИЧНЫЕ СЛУЧАИ: Вызывает tryFillPool — может сразу стать активной.
     */
    addTask: ({ type, cost, duration, payload }: TaskInput) => {
      console.log('addTask', { type, cost, duration, payload });
      usePendingTasksStore().push({
        id: nanoid(),
        type,
        cost,
        elapsedMs: 0,
        duration,
        payload,
      });
      console.log('addTask pushed');
      tryFillPool();
      console.log('addTask tryFillPool runned');
    },
    /**
     * Приостановить активную задачу.
     * АЛГОРИТМ: active → paused, освобождает внимание, вызывает tryFillPool.
     */
    pauseTask: (taskId: string) => {
      const activeStore = useActiveTasksStore();
      const task = activeStore.get(taskId);
      if (!task) return;
      removeFromActive(taskId);
      usePausedTasksStore().add(task);
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
      pausedStore.remove(taskId);
      useResumedTasksStore().push(task);
      tryFillPool();
    },
    /**
     * Поставить на паузу задачу из очереди (resumed).
     * АЛГОРИТМ: resumed → paused, не вызывает tryFillPool (не освобождает внимание).
     */
    pauseResumedTask: (taskId: string) => {
      const resumedStore = useResumedTasksStore();
      const task = resumedStore.tasks.find(t => t.id === taskId);
      if (!task) return;
      resumedStore.remove(taskId);
      usePausedTasksStore().add(task);
    },
    /**
     * Отменить задачу из любого пула.
     * ГРАНИЧНЫЕ СЛУЧАИ: Если была active — вызывает tryFillPool.
     */
    cancelTask: (taskId: string) => {
      const activeStore = useActiveTasksStore();
      if (activeStore.has(taskId)) {
        removeFromActive(taskId);
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
    completeTask,
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
      const resumed = resumedStore.tasks.find(t => t.id === taskId);
      if (resumed) return resumed;
      const pendingStore = usePendingTasksStore();
      const pending = pendingStore.tasks.find(t => t.id === taskId);
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

// ============================================================
// === PUBLIC TASKS FACADE ===
// ============================================================

/**
 * Публичный фасад для работы с задачами.
 *
 * ЗАЧЕМ: Единая точка доступа к спискам задач и методам управления.
 * Скрывает внутреннюю структуру сторов.
 */
export const useTasksStore = defineStore('tasks', () => {
  const activeStore = useActiveTasksStore();
  const resumedStore = useResumedTasksStore();
  const pendingStore = usePendingTasksStore();
  const pausedStore = usePausedTasksStore();
  const managerStore = useTaskManagerStore();

  return {
    /** Активные задачи (глубокая реактивность на elapsedMs) */
    activeTasks: computed(() => activeStore.tasks),
    /** Задачи возвращённые из паузы (FIFO) */
    resumedTasks: computed(() => resumedStore.tasks),
    /** Новые задачи в очереди (FIFO) */
    pendingTasks: computed(() => pendingStore.tasks),
    /** Приостановленные задачи */
    pausedTasks: computed(() => pausedStore.tasks),
    /** Создать новую задачу и добавить в pending */
    addTask: managerStore.addTask,
    /** Отменить задачу из любого пула */
    cancelTask: managerStore.cancelTask,
    /** Приостановить активную задачу */
    pauseTask: managerStore.pauseTask,
    /** Возобновить приостановленную задачу */
    resumeTask: managerStore.resumeTask,
    /** Поставить на паузу задачу из очереди (resumed) */
    pauseResumedTask: managerStore.pauseResumedTask,
  };
});
