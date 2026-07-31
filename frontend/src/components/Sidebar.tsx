import React, { useState } from 'react';
import { Calendar, User, X, Check, ChevronDown, ChevronRight, RotateCcw, Filter } from 'lucide-react';
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
  const [isMonthSectionOpen, setIsMonthSectionOpen] = useState(true);

  const filteredArtists = artists.filter(a =>
    a.name.toLowerCase().includes(artistFilter.toLowerCase())
  );

  const activeArtistObj = artists.find(a => a.member_id === selectedArtist);
  const isAnyFilterActive = selectedMonth !== null || selectedArtist !== null;

  const handleResetFilters = () => {
    setSelectedMonth(null);
    setSelectedArtist(null);
  };

  if (!isOpen) return null;

  return (
    <aside className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col h-[calc(100vh-57px)] sticky top-[57px] z-20 shrink-0 select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900/90">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-200">圖庫分類與篩選</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Active Compound Filter Badges */}
      {isAnyFilterActive && (
        <div className="p-3 bg-indigo-950/30 border-b border-indigo-500/20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-indigo-300">目前組合篩選中</span>
            <button
              onClick={handleResetFilters}
              className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 hover:underline"
            >
              <RotateCcw className="w-3 h-3" /> 重設所有
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            {selectedArtist !== null && (
              <span className="px-2 py-0.5 rounded-md bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 flex items-center gap-1">
                繪師: {activeArtistObj?.name || selectedArtist}
                <X
                  className="w-3 h-3 cursor-pointer hover:text-white"
                  onClick={() => setSelectedArtist(null)}
                />
              </span>
            )}

            {selectedMonth !== null && (
              <span className="px-2 py-0.5 rounded-md bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 flex items-center gap-1">
                月份: {selectedMonth}
                <X
                  className="w-3 h-3 cursor-pointer hover:text-white"
                  onClick={() => setSelectedMonth(null)}
                />
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Body - Artists First & Maximized */}
      <div className="flex-1 flex flex-col min-h-0 p-3 space-y-4 overflow-hidden">
        {/* 1. ARTIST SELECTION SECTION (Maximized Flex Height) */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" />
              <span>繪師列表 ({artists.length})</span>
            </div>
            {selectedArtist !== null && (
              <button
                onClick={() => setSelectedArtist(null)}
                className="text-[11px] text-indigo-400 hover:underline"
              >
                取消選擇
              </button>
            )}
          </div>

          <input
            type="text"
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value)}
            placeholder="搜尋繪師名稱..."
            className="w-full mb-2 px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-indigo-500 text-zinc-200"
          />

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 border border-zinc-800/60 rounded-xl p-1 bg-zinc-950/40">
            <button
              onClick={() => setSelectedArtist(null)}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedArtist === null
                  ? 'bg-indigo-600 text-white shadow-sm'
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
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedArtist === a.member_id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span className="truncate max-w-[140px] text-left">{a.name || `ID: ${a.member_id}`}</span>
                <span className="text-[11px] opacity-70">({a.artwork_count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. MONTH TIMELINE SECTION (Collapsible Accordion with Max Height) */}
        <div className="border-t border-zinc-800 pt-3 shrink-0">
          <div
            onClick={() => setIsMonthSectionOpen(!isMonthSectionOpen)}
            className="flex items-center justify-between mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span>更新月份時間軸</span>
            </div>
            <div className="flex items-center gap-1">
              {selectedMonth && <span className="text-[11px] text-indigo-400 lowercase">{selectedMonth}</span>}
              {isMonthSectionOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>
          </div>

          {isMonthSectionOpen && (
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1 border border-zinc-800/60 rounded-xl p-1 bg-zinc-950/40">
              <button
                onClick={() => setSelectedMonth(null)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedMonth === null
                    ? 'bg-indigo-600 text-white shadow-sm'
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
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedMonth === m.month
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span>{m.month}</span>
                  <span className="text-[11px] opacity-70">({m.count})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
