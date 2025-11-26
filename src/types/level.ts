export interface PrimitiveTile {
  type: 'empty' | 'wall' | 'floor' | 'unlinkedPortal';
}

export type GridTile = PrimitiveTile;

export interface Level {
  name: string;
  metadata: {
    description?: string;
    depth?: number;
    color?: number;
  };
  createdAt: number;
}
