<script setup lang="ts">
import { Menu, Plus } from 'lucide-vue-next';
import { onClickOutside } from '@vueuse/core';
import { computed, ref } from 'vue';

import ActionButton from '@/components/ActionButton.vue';
import TaskItem from '@/components/TaskItem.vue';
import { useTasksStore } from '@/store/attentionStore';

const isOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const buttonRef = ref<HTMLElement | null>(null);

const tasksStore = useTasksStore();
const addTask = () => { tasksStore.addTask({ cost: 3, duration: 32, type: '123', payload: {} }) }


const tabs = [
  { id: 'active', label: 'Активные' },
  { id: 'paused', label: 'На паузе' },
  { id: 'queue', label: 'Очередь' },
] as const;
const activeTab = ref<(typeof tabs)[number]['id']>('active');

const toggleMenu = () => (isOpen.value = !isOpen.value);

onClickOutside(menuRef, (event) => {
  if (!buttonRef.value?.contains(event.target as Node)) {
    isOpen.value = false;
  }
});

// Преобразование Map в Array для pausedTasks
const pausedArray = computed(() => Array.from(tasksStore.pausedTasks.values()));

// Массивы для активных задач
const activeArray = computed(() => Array.from(tasksStore.activeTasks.values()));
</script>

<template>
  <div class="fixed left-4 top-4 z-50">
    <button
      ref="buttonRef"
      type="button"
      class="flex items-center justify-center rounded-lg border border-white/10 bg-neutral-900/95 p-2 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-neutral-800"
      @click="addTask"
    >
      <Plus class="size-5" />
    </button>

    <!-- Кнопка-триггер -->
    <button
      ref="buttonRef"
      type="button"
      class="flex items-center justify-center rounded-lg border border-white/10 bg-neutral-900/95 p-2 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-neutral-800"
      @click="toggleMenu"
    >
      <Menu class="size-5" />
    </button>

    <!-- Выпадающее меню -->
    <div
      v-if="isOpen"
      ref="menuRef"
      class="absolute left-0 top-12 flex min-w-[250px] w-max max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-neutral-900/95 shadow-lg backdrop-blur-sm"
      :style="{ maxHeight: 'calc(100vh - 5rem)' }"
    >
      <!-- Вкладки -->
      <div class="shrink-0 overflow-x-auto border-b border-white/10 snap-x snap-mandatory">
        <div class="flex">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            :class="[
              'shrink-0 snap-start px-4 py-3 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-white text-white'
                : 'text-neutral-400 hover:text-white',
            ]"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Контент -->
      <div class="flex-1 overflow-y-auto min-h-0">
        <!-- Активные -->
        <template v-if="activeTab === 'active'">
          <div
            v-if="!activeArray.length"
            class="px-4 py-8 text-center text-sm text-neutral-500"
          >
            Нет задач
          </div>
          <TaskItem
            v-for="task in activeArray"
            :key="task.id"
            :task="task"
          >
            <template #actions>
              <ActionButton
                icon="pause"
                @click="tasksStore.pauseTask(task.id)"
              />
              <ActionButton
                icon="cancel"
                @click="tasksStore.cancelTask(task.id)"
              />
            </template>
          </TaskItem>
        </template>

        <!-- На паузе -->
        <template v-else-if="activeTab === 'paused'">
          <div
            v-if="!pausedArray.length"
            class="px-4 py-8 text-center text-sm text-neutral-500"
          >
            Нет задач
          </div>
          <TaskItem
            v-for="task in pausedArray"
            :key="task.id"
            :task="task"
          >
            <template #actions>
              <ActionButton
                icon="cancel"
                @click="tasksStore.cancelTask(task.id)"
              />
            </template>
          </TaskItem>
        </template>

        <!-- Очередь -->
        <template v-else-if="activeTab === 'queue'">
          <div
            v-if="tasksStore.resumedTasks.length"
            class="px-4 py-2 text-xs uppercase text-neutral-500"
          >
            Восстанавливаемые
          </div>
          <TaskItem
            v-for="task in tasksStore.resumedTasks"
            :key="task.id"
            :task="task"
          >
            <template #actions>
              <ActionButton
                icon="pause"
                @click="tasksStore.pauseResumedTask(task.id)"
              />
              <ActionButton
                icon="cancel"
                @click="tasksStore.cancelTask(task.id)"
              />
            </template>
          </TaskItem>

          <div
            v-if="tasksStore.pendingTasks.length"
            class="px-4 py-2 text-xs uppercase text-neutral-500"
          >
            Ожидающие
          </div>
          <TaskItem
            v-for="task in tasksStore.pendingTasks"
            :key="task.id"
            :task="task"
          >
            <template #actions>
              <ActionButton
                icon="cancel"
                @click="tasksStore.cancelTask(task.id)"
              />
            </template>
          </TaskItem>

          <div
            v-if="!tasksStore.resumedTasks.length && !tasksStore.pendingTasks.length"
            class="px-4 py-8 text-center text-sm text-neutral-500"
          >
            Нет задач
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
