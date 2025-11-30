export type ReverseMap<T extends Record<string, string | number>> = {
  [K in keyof T as T[K]]: K;
};
