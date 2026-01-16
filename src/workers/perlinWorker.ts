import { expose } from 'comlink';
import { makeNoise2D, makeNoise3D } from 'open-simplex-noise';

export type PerlinWorkerApi = typeof api;

let noise2D: ReturnType<typeof makeNoise2D> | undefined;
let noise3D: ReturnType<typeof makeNoise3D> | undefined;

/** количество итераций алгоритма */
let octaves = 4;
/** Насколько быстро падает влияние октав */
let persistence = 0.5;
/** Насколько быстро растет частота */
let lacunarity = 2.0;
/** Базовый масштаб (размер "холмов") */
let scale = 32.0;
/** максимальная высота гор */
let worldMaxHeight = 32;

function getNoise2D({ x, y }: { x: number; y: number }) {
  if (!noise2D) return null;

  let total = 0;
  let frequency = 1 / scale;
  let amplitude = 1;
  let maxValue = 0; // Для нормализации

  for (let i = 0; i < octaves; i++) {
    // Вычисляем шум для текущей октавы
    // Мы передаем дробные координаты, чтобы получить плавность
    total += noise2D(x * frequency, y * frequency) * amplitude;

    maxValue += amplitude;

    // Подготовка параметров для следующей октавы
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  // Возвращаем значение, нормализованное в диапазон [-1, 1]
  return total / maxValue;
}

function getNoise3D({ x, y, z }: { x: number; y: number; z: number }) {
  if (!noise3D) return null;

  let total = 0;
  let frequency = 1 / scale;
  let amplitude = 1;
  let maxValue = 0; // Для нормализации

  for (let i = 0; i < octaves; i++) {
    // Вычисляем шум для текущей октавы
    // Мы передаем дробные координаты, чтобы получить плавность
    total += noise3D(x * frequency, y * frequency, z * frequency) * amplitude;

    maxValue += amplitude;

    // Подготовка параметров для следующей октавы
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  // Возвращаем значение, нормализованное в диапазон [-1, 1]
  return total / maxValue;
}

const api = {
  async init(
    seed: number,
    /** Настройки шума */
    settings?: {
      /** количество итераций алгоритма */
      octaves?: number;
      /** Насколько быстро падает влияние октав */
      persistence?: number;
      /** Насколько быстро растет частота */
      lacunarity?: number;
      /** Базовый масштаб (размер "холмов") */
      scale?: number;
      /** максимальная высота гор */
      worldMaxHeight?: number;
    }
  ) {
    noise2D = makeNoise2D(seed);
    noise3D = makeNoise3D(seed);
    if (!settings) return;
    if (settings.octaves) octaves = settings.octaves;
    if (settings.persistence) persistence = settings.persistence;
    if (settings.lacunarity) lacunarity = settings.lacunarity;
    if (settings.scale) scale = settings.scale;
    if (settings.worldMaxHeight) worldMaxHeight = settings.worldMaxHeight;
  },
  async getNoise({ x, y, z }: { x: number; y: number; z: number }) {
    //   const baseHeight = getNoise2D({ x, y }) * scale;
    //   const density3D = getNoise3D({ x, y, z });

    // Плотность уменьшается с высотой
    // Чем выше мы поднимаемся, тем меньше шансов, что 3D шум "вытянет" блок
    //   const finalDensity = density3D - (z - baseHeight) / scale;

    //   if (finalDensity < 0) return null;
    //   return finalDensity;

    const height = getNoise2D({ x, y });
    if (height === null) return null;
    if (z > height * worldMaxHeight) return null;
    return getNoise3D({ x, y, z });
  },
};

expose(api);
