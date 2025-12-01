<script setup lang="ts">
import { useToastStore } from '@/store/toastStore';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-vue-next';
import { computed, defineComponent, h, onMounted, onUnmounted, type PropType, TransitionGroup } from 'vue';

// ============================================================
// === TOAST ITEM COMPONENT ===
// ============================================================

interface Toast {
  id: string;
  icon?: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  timeout: number;
}

const iconComponents = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const iconColors = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-sky-400',
} as const;

const ToastItem = defineComponent({
  name: 'ToastItem',
  props: {
    toast: {
      type: Object as PropType<Toast>,
      required: true,
    },
  },
  emits: ['close'],
  setup(props, { emit }) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let remainingTime = props.toast.timeout;
    let startTime = 0;

    const startTimer = () => {
      if (remainingTime <= 0) return;
      startTime = Date.now();
      timeoutId = setTimeout(() => emit('close'), remainingTime);
    };

    const pauseTimer = () => {
      if (!timeoutId) return;
      clearTimeout(timeoutId);
      remainingTime -= Date.now() - startTime;
    };

    const resumeTimer = () => {
      startTimer();
    };

    onMounted(startTimer);
    onUnmounted(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });

    const IconComponent = computed(() => {
      if (!props.toast.icon) return null;
      return iconComponents[props.toast.icon];
    });

    const iconClass = computed(() => {
      if (!props.toast.icon) return '';
      return iconColors[props.toast.icon];
    });

    return () =>
      h(
        'div',
        {
          role: 'alert',
          class:
            'pointer-events-auto flex w-80 max-w-full items-start gap-3 rounded-lg border border-white/10 bg-neutral-900/95 p-4 shadow-2xl backdrop-blur-sm',
          onMouseenter: pauseTimer,
          onMouseleave: resumeTimer,
        },
        [
          // Icon
          IconComponent.value &&
            h(IconComponent.value, {
              class: ['size-5 flex-shrink-0', iconClass.value],
            }),

          // Content
          h('div', { class: 'min-w-0 flex-1' }, [
            h('p', { class: 'text-sm font-medium text-white' }, props.toast.title),
            props.toast.description &&
              h('p', { class: 'mt-1 text-sm text-neutral-400' }, props.toast.description),
          ]),

          // Close button
          h(
            'button',
            {
              type: 'button',
              class:
                'flex-shrink-0 rounded p-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-white',
              onClick: () => emit('close'),
            },
            [h(X, { class: 'size-4' })]
          ),
        ]
      );
  },
});

// ============================================================
// === TOAST MANAGER ===
// ============================================================

const toastStore = useToastStore();
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-0 z-[9999] flex flex-col items-end justify-end gap-3 p-6"
      aria-live="polite"
      aria-label="Уведомления"
    >
      <TransitionGroup
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
        move-class="transition duration-300 ease-out"
        tag="div"
        class="flex flex-col items-end gap-3"
      >
        <ToastItem
          v-for="item in toastStore.toasts"
          :key="item.id"
          :toast="item"
          @close="toastStore.close(item.id)"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

