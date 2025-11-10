import { useToolbarStore } from '@/store/toolbarStore';
import { useUIStore } from '@/store/uiStore';

export function Toolbar() {
  const { activeTile, setActiveTile } = useToolbarStore();
  const { showGrid, toggleGrid } = useUIStore();

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2
                    flex gap-2 bg-gray-900 border border-gray-700
                    rounded-lg p-2 shadow-lg"
    >
      {/* Кнопка Wall */}
      <button
        onClick={() => setActiveTile('wall')}
        className={`px-4 py-2 rounded flex flex-col items-center gap-1 transition-colors ${
          activeTile === 'wall'
            ? 'bg-gray-700 border-2 border-white'
            : 'bg-gray-800 hover:bg-gray-700 border-2 border-transparent'
        }`}
        title="Wall (1)"
      >
        <div className="w-6 h-6 bg-black border border-gray-600" />
        <span className="text-xs text-gray-400">1</span>
      </button>

      {/* Кнопка Floor */}
      <button
        onClick={() => setActiveTile('floor')}
        className={`px-4 py-2 rounded flex flex-col items-center gap-1 transition-colors ${
          activeTile === 'floor'
            ? 'bg-gray-700 border-2 border-white'
            : 'bg-gray-800 hover:bg-gray-700 border-2 border-transparent'
        }`}
        title="Floor (2)"
      >
        <div className="w-6 h-6" style={{ backgroundColor: '#8B7355' }} />
        <span className="text-xs text-gray-400">2</span>
      </button>

      {/* Кнопка Portal */}
      <button
        onClick={() => setActiveTile('unlinked-portal')}
        className={`px-4 py-2 rounded flex flex-col items-center gap-1 transition-colors ${
          activeTile === 'unlinked-portal'
            ? 'bg-gray-700 border-2 border-white'
            : 'bg-gray-800 hover:bg-gray-700 border-2 border-transparent'
        }`}
        title="Portal (3)"
      >
        <div className="w-6 h-6 bg-gray-600 border border-yellow-500" />
        <span className="text-xs text-gray-400">3</span>
      </button>

      {/* Разделитель */}
      <div className="w-px bg-gray-700" />

      {/* Toggle сетки */}
      <button
        onClick={toggleGrid}
        className={`px-4 py-2 rounded transition-all ${
          showGrid
            ? 'bg-blue-600 border-2 border-blue-400 shadow-inner'
            : 'bg-gray-800 hover:bg-gray-700 border-2 border-transparent'
        }`}
        title="Toggle Grid (G)"
      >
        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 3v8h8V3H3zm0 10v8h8v-8H3zm10-10v8h8V3h-8zm0 10v8h8v-8h-8z" />
        </svg>
      </button>
    </div>
  );
}

