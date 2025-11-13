import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useCameraZoomStore = defineStore(
  'camera-zoom',
  () => {
    const zoom = ref(1);

    return {
      zoom,
      setZoom: (newZoom: number) => (zoom.value = newZoom),
    };
  },
  {
    persist: true,
  }
);

export const useCameraPositionStore = defineStore(
  'camera-position',
  () => {
    const position = ref({ x: 0, y: 0 });

    return {
      position,
      setPosition: (x: number, y: number) => (position.value = { x, y }),
    };
  },
  {
    persist: true,
  }
);
