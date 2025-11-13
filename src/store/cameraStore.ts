import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useCameraZoomStore = defineStore(
  'camera-zoom',
  () => {
    // State
    const zoom = ref(1);

    // Actions
    function setZoom(newZoom: number) {
      zoom.value = newZoom;
    }

    return {
      zoom,
      setZoom,
    };
  },
  {
    persist: true,
  }
);

export const useCameraPositionStore = defineStore(
  'camera-position',
  () => {
    // State
    const position = ref({ x: 0, y: 0 });

    // Actions
    function setPosition(x: number, y: number) {
      position.value = { x, y };
    }

    return {
      position,
      setPosition,
    };
  },
  {
    persist: true,
  }
);
