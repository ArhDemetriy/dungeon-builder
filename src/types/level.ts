export interface RegularTile {
  type: 'wall' | 'floor' | 'unlinked-portal';
}

export type PrimitiveTile = RegularTile;

export interface PortalTile {
  type: 'portal';
  portalId: string;
}

export type ComplexTile = PortalTile;

export type GridTile = PrimitiveTile | ComplexTile;

export function isPrimitiveTile(tile: GridTile): tile is PrimitiveTile {
  return tile.type === 'wall' || tile.type === 'floor' || tile.type === 'unlinked-portal';
}

export interface Portal {
  id: string;
  name: string;
  endpoints: { [k in 'A' | 'B']: { levelId: string; position: { x: number; y: number } } };
  color?: number;
  createdAt: number;
}

export interface Level {
  id: string;
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
