import { gameConfig } from '@/game/config';
import { Game } from 'phaser';
import { useEffect, useRef } from 'react';

export function PhaserGame() {
  const gameRef = useRef<Game>(null);

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
