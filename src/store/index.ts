import { createPinia } from 'pinia';
import { createPersistedState } from 'pinia-plugin-persistedstate';

// Создаём Pinia instance
export const pinia = createPinia();

// Настраиваем persist плагин
pinia.use(
  createPersistedState({
    storage: localStorage,
    serializer: {
      serialize: value => {
        // Кастомный сериализатор для Map и Set
        return JSON.stringify(value, (_key, val) => {
          if (val instanceof Map) {
            return {
              __type: 'Map',
              value: Array.from(val.entries()),
            };
          }
          if (val instanceof Set) {
            return {
              __type: 'Set',
              value: Array.from(val),
            };
          }
          return val;
        });
      },
      deserialize: value => {
        // Кастомный десериализатор для Map и Set
        return JSON.parse(value, (_key, val) => {
          if (typeof val === 'object' && val !== null && '__type' in val) {
            if (val.__type === 'Map' && 'value' in val) {
              return new Map(val.value as [unknown, unknown][]);
            }
            if (val.__type === 'Set' && 'value' in val) {
              return new Set(val.value as unknown[]);
            }
          }
          return val;
        });
      },
    },
  })
);
