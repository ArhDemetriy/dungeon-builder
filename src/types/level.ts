export interface PrimitiveTile {
  type: 'grass0' | 'grass1';
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
