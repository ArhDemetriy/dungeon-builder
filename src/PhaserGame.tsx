import { useEffect, useRef } from 'react';
import { Game } from 'phaser';

import { gameConfig } from '@/game/config';

export function PhaserGame() {
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!gameRef.current) {
      gameRef.current = new Game(gameConfig);
    }

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id="phaser-container" />;
}

