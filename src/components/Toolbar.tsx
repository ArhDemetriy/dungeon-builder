import { useToolbarStore } from '@/store/toolbarStore';
import { useUIStore } from '@/store/uiStore';

export function Toolbar() {
  const { activeTile, setActiveTile } = useToolbarStore();
  const { showGrid, toggleGrid } = useUIStore();

  return (
    <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-lg border border-gray-700 bg-gray-900 p-2 shadow-lg">
      {/* Кнопка Wall */}
      <button
        onClick={() => setActiveTile('wall')}
        className={`flex flex-col items-center gap-1 rounded px-4 py-2 transition-colors ${
          activeTile === 'wall'
            ? 'border-2 border-white bg-gray-700'
            : 'border-2 border-transparent bg-gray-800 hover:bg-gray-700'
        }`}
        title="Wall (1)"
      >
        <div className="h-6 w-6 border border-gray-600 bg-black" />
        <span className="text-xs text-gray-400">1</span>
      </button>

      {/* Кнопка Floor */}
      <button
        onClick={() => setActiveTile('floor')}
        className={`flex flex-col items-center gap-1 rounded px-4 py-2 transition-colors ${
          activeTile === 'floor'
            ? 'border-2 border-white bg-gray-700'
            : 'border-2 border-transparent bg-gray-800 hover:bg-gray-700'
        }`}
        title="Floor (2)"
      >
        <div className="h-6 w-6" style={{ backgroundColor: '#8B7355' }} />
        <span className="text-xs text-gray-400">2</span>
      </button>

      {/* Кнопка Portal */}
      <button
        onClick={() => setActiveTile('unlinked-portal')}
        className={`flex flex-col items-center gap-1 rounded px-4 py-2 transition-colors ${
          activeTile === 'unlinked-portal'
            ? 'border-2 border-white bg-gray-700'
            : 'border-2 border-transparent bg-gray-800 hover:bg-gray-700'
        }`}
        title="Portal (3)"
      >
        <div className="h-6 w-6 border border-yellow-500 bg-gray-600" />
        <span className="text-xs text-gray-400">3</span>
      </button>

      {/* Разделитель */}
      <div className="w-px bg-gray-700" />

      {/* Toggle сетки */}
      <button
        onClick={toggleGrid}
        className={`rounded px-4 py-2 transition-all ${
          showGrid
            ? 'border-2 border-blue-400 bg-blue-600 shadow-inner'
            : 'border-2 border-transparent bg-gray-800 hover:bg-gray-700'
        }`}
        title="Toggle Grid (G)"
      >
        <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 3v8h8V3H3zm0 10v8h8v-8H3zm10-10v8h8V3h-8zm0 10v8h8v-8h-8z" />
        </svg>
      </button>
    </div>
  );
}
