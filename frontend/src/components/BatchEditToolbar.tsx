import React from 'react';
import { Trash2, CheckSquare, Square, X } from 'lucide-react';

interface BatchEditToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDeleteSelected: () => void;
  onCancel: () => void;
}

export const BatchEditToolbar: React.FC<BatchEditToolbarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onDeleteSelected,
  onCancel,
}) => {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/95 border border-zinc-700/80 backdrop-blur-xl px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 text-zinc-100 animate-slideUp">
      <div className="flex items-center gap-2 border-r border-zinc-700/60 pr-4">
        <span className="text-xs font-semibold text-zinc-300">
          已選取 <span className="text-indigo-400 font-bold">{selectedCount}</span> / {totalCount} 項
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={selectedCount === totalCount ? onDeselectAll : onSelectAll}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          {selectedCount === totalCount ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
          <span>{selectedCount === totalCount ? '取消全選' : '全選'}</span>
        </button>

        <button
          onClick={onDeleteSelected}
          disabled={selectedCount === 0}
          className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-rose-900/30"
        >
          <Trash2 className="w-4 h-4" />
          <span>刪除已選項目 ({selectedCount})</span>
        </button>

        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="退出編輯模式"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
