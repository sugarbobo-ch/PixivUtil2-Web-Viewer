import React, { useState } from 'react';
import { Calendar, User, X, Check } from 'lucide-react';
import { Artist, MonthItem } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  months: MonthItem[];
  artists: Artist[];
  selectedMonth: string | null;
  setSelectedMonth: (month: string | null) => void;
  selectedArtist: number | null;
  setSelectedArtist: (artistId: number | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  months,
  artists,
  selectedMonth,
  setSelectedMonth,
  selectedArtist,
  setSelectedArtist
}) => {
  const [artistFilter, setArtistFilter] = useState('');

  const filteredArtists = artists.filter(a =>
    a.name.toLowerCase().includes(artistFilter.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <aside className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col h-[calc(100vh-57px)] sticky top-[57px] z-20 shrink-0 select-none">
      <div className="flex items-center justify-between p-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">分類與篩選</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        {/* Month Timeline */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            <Calendar className="w-4 h-4" />
            <span>更新月份時間軸</span>
          </div>
          <div className="space-y-1">
            <button
              onClick={() => setSelectedMonth(null)}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedMonth === null
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <span>全部月份</span>
              {selectedMonth === null && <Check className="w-3.5 h-3.5" />}
            </button>
            {months.map((m) => (
              <button
                key={m.month}
                onClick={() => setSelectedMonth(m.month === selectedMonth ? null : m.month)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  selectedMonth === m.month
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span>{m.month}</span>
                <span className="text-[11px] opacity-70">({m.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Artist Selection */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            <User className="w-4 h-4" />
            <span>繪師列表 ({artists.length})</span>
          </div>

          <input
            type="text"
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value)}
            placeholder="搜尋繪師..."
            className="w-full mb-2 px-2.5 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-indigo-500 text-zinc-200"
          />

          <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
            <button
              onClick={() => setSelectedArtist(null)}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedArtist === null
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <span>全部繪師</span>
              {selectedArtist === null && <Check className="w-3.5 h-3.5" />}
            </button>
            {filteredArtists.map((a) => (
              <button
                key={a.member_id}
                onClick={() => setSelectedArtist(a.member_id === selectedArtist ? null : a.member_id)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  selectedArtist === a.member_id
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span className="truncate max-w-[140px] text-left">{a.name || `ID: ${a.member_id}`}</span>
                <span className="text-[11px] opacity-70">({a.artwork_count})</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};
