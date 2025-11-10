import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface CameraZoomStore {
  zoom: number;
  setZoom: (zoom: number) => void;
}

interface CameraPositionStore {
  position: { x: number; y: number };
  setPosition: (x: number, y: number) => void;
}

export const useCameraZoomStore = create<CameraZoomStore>()(
  devtools(
    persist(
      set => ({
        zoom: 1,
        setZoom: zoom => set({ zoom }),
      }),
      {
        name: 'camera-zoom',
      }
    ),
    { name: 'CameraZoomStore' }
  )
);

export const useCameraPositionStore = create<CameraPositionStore>()(
  devtools(
    persist(
      set => ({
        position: { x: 0, y: 0 },
        setPosition: (x, y) => set({ position: { x, y } }),
      }),
      {
        name: 'camera-position',
      }
    ),
    { name: 'CameraPositionStore' }
  )
);
