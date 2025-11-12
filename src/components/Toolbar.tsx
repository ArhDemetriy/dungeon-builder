import clsx from 'clsx';

import { useToolbarStore } from '@/store/toolbarStore';
import { useUIStore } from '@/store/uiStore';

export function Toolbar() {
  const { activeTile, setActiveTile } = useToolbarStore();
  const { showGrid, toggleGrid } = useUIStore();

  return (
    <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-lg border border-gray-700 bg-gray-900 p-2 shadow-lg">
      {/* Радиокнопка Wall */}
      <label
        className={clsx(
          'flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-4 py-2 transition-colors',
          activeTile === 'wall' ? 'border-white bg-gray-700' : 'border-transparent bg-gray-800 hover:bg-gray-700'
        )}
        title="Wall (1)"
      >
        <input
          type="radio"
          name="tile-type"
          value="wall"
          checked={activeTile === 'wall'}
          onChange={() => setActiveTile('wall')}
          className="sr-only"
        />
        <div className="h-6 w-6 border border-gray-600 bg-black" />
        <span className="text-xs text-gray-400">1</span>
      </label>

      {/* Радиокнопка Floor */}
      <label
        className={clsx(
          'flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-4 py-2 transition-colors',
          activeTile === 'floor' ? 'border-white bg-gray-700' : 'border-transparent bg-gray-800 hover:bg-gray-700'
        )}
        title="Floor (2)"
      >
        <input
          type="radio"
          name="tile-type"
          value="floor"
          checked={activeTile === 'floor'}
          onChange={() => setActiveTile('floor')}
          className="sr-only"
        />
        <div className="h-6 w-6 bg-[#8B7355]" />
        <span className="text-xs text-gray-400">2</span>
      </label>

      {/* Радиокнопка Portal */}
      <label
        className={clsx(
          'flex cursor-pointer flex-col items-center gap-1 rounded border-2 px-4 py-2 transition-colors',
          activeTile === 'unlinkedPortal'
            ? 'border-white bg-gray-700'
            : 'border-transparent bg-gray-800 hover:bg-gray-700'
        )}
        title="Portal (3)"
      >
        <input
          type="radio"
          name="tile-type"
          value="unlinked-portal"
          checked={activeTile === 'unlinkedPortal'}
          onChange={() => setActiveTile('unlinkedPortal')}
          className="sr-only"
        />
        <div className="h-6 w-6 border border-yellow-500 bg-gray-600" />
        <span className="text-xs text-gray-400">3</span>
      </label>

      {/* Разделитель */}
      <div className="w-px bg-gray-700" />

      {/* Toggle сетки */}
      <label
        className={clsx(
          'cursor-pointer rounded border-2 px-4 py-2 transition-all',
          showGrid ? 'border-blue-400 bg-blue-600 shadow-inner' : 'border-transparent bg-gray-800 hover:bg-gray-700'
        )}
        title="Toggle Grid (G)"
      >
        <input type="checkbox" checked={showGrid} onChange={toggleGrid} className="sr-only" />
        <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 3v8h8V3H3zm0 10v8h8v-8H3zm10-10v8h8V3h-8zm0 10v8h8v-8h-8z" />
        </svg>
      </label>
    </div>
  );
}
