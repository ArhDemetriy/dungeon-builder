export interface PrimitiveTile {
  type: 'wall' | 'floor' | 'unlinkedPortal';
}

export type GridTile = PrimitiveTile;

export interface Level {
  name: string;
  tiles: Map<ReturnType<typeof tileKey>, GridTile>;
  metadata: {
    description?: string;
    depth?: number;
    color?: number;
  };
  createdAt: number;
}

export const tileKey = (x: number, y: number) => `${x},${y}` as const;

export const parseTileKey = (key: ReturnType<typeof tileKey>) => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};
