import { nanoid } from 'nanoid';
import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

interface Toast {
  id: string;
  icon?: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  timeout: number;
  onClose?: () => void;
}

type ToastInput = Omit<Toast, 'id' | 'timeout'> & { timeout?: number };

const DEFAULT_TIMEOUT = 5000;

export const useToastStore = defineStore('toasts', () => {
  const toasts = shallowRef<Toast[]>([]);

  const show = (input: ToastInput) => {
    const id = nanoid();
    toasts.value = [
      ...toasts.value,
      {
        ...input,
        id,
        timeout: input.timeout ?? DEFAULT_TIMEOUT,
      },
    ];
    return id;
  };

  const close = (id: string) => {
    const index = toasts.value.findIndex(t => t.id === id);
    if (index < 0) return;
    const newToasts = toasts.value.slice();
    newToasts.splice(index, 1);
    toasts.value = newToasts;
    return;
  };

  return {
    toasts,
    show,
    close,
  };
});
