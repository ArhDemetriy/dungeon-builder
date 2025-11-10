import { PhaserGame } from '@/PhaserGame';
import { Toolbar } from '@/components/Toolbar';

export function App() {
  return (
    <div className="relative h-full w-full">
      <PhaserGame />
      <Toolbar />
    </div>
  );
}
