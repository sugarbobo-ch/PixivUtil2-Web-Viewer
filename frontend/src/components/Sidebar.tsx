import React, { useState } from 'react';
import { Calendar, User, X, Check, ChevronDown, ChevronRight, RotateCcw, Filter } from 'lucide-react';
import { Artist, MonthItem } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  months: MonthItem[];
  artists: Artist[];
  selectedMonths: string[];
  setSelectedMonths: (months: string[]) => void;
  selectedArtist: number | null;
  setSelectedArtist: (artistId: number | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  months,
  artists,
  selectedMonths,
  setSelectedMonths,
  selectedArtist,
  setSelectedArtist
}) => {
  const [artistFilter, setArtistFilter] = useState('');
  const [isMonthSectionOpen, setIsMonthSectionOpen] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});

  const filteredArtists = artists.filter(a =>
    a.name.toLowerCase().includes(artistFilter.toLowerCase())
  );

  const activeArtistObj = artists.find(a => a.member_id === selectedArtist);
  const isAnyFilterActive = selectedMonths.length > 0 || selectedArtist !== null;

  // Group Months by Year
  const yearGroupMap: Record<string, { totalCount: number; months: MonthItem[] }> = {};
  months.forEach(m => {
    const year = m.month.split('-')[0] || m.month;
    if (!yearGroupMap[year]) {
      yearGroupMap[year] = { totalCount: 0, months: [] };
    }
    yearGroupMap[year].totalCount += m.count;
    yearGroupMap[year].months.push(m);
  });

  const sortedYears = Object.keys(yearGroupMap).sort((a, b) => b.localeCompare(a));

  const toggleYearExpanded = (year: string) => {
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  const toggleMonthSelection = (target: string) => {
    if (selectedMonths.includes(target)) {
      setSelectedMonths(selectedMonths.filter(m => m !== target));
    } else {
      setSelectedMonths([...selectedMonths, target]);
    }
  };

  const handleResetFilters = () => {
    setSelectedMonths([]);
    setSelectedArtist(null);
  };

  if (!isOpen) return null;

  return (
    <aside className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col h-[calc(100vh-57px)] sticky top-[57px] z-20 shrink-0 select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900/90">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-200">圖庫分類與複選篩選</h2>
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
            <span className="text-[11px] font-semibold text-indigo-300">目前組合複選中</span>
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

            {selectedMonths.map(mStr => (
              <span key={mStr} className="px-2 py-0.5 rounded-md bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 flex items-center gap-1">
                時間: {mStr}
                <X
                  className="w-3 h-3 cursor-pointer hover:text-white"
                  onClick={() => toggleMonthSelection(mStr)}
                />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main Body */}
      <div className="flex-1 flex flex-col min-h-0 p-3 space-y-4 overflow-hidden">
        {/* 1. ARTIST SELECTION SECTION */}
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

        {/* 2. MULTI-SELECTABLE YEAR -> MONTH ACCORDION SECTION */}
        <div className="border-t border-zinc-800 pt-3 shrink-0">
          <div
            onClick={() => setIsMonthSectionOpen(!isMonthSectionOpen)}
            className="flex items-center justify-between mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span>時間複選 ({selectedMonths.length > 0 ? `已選 ${selectedMonths.length} 項` : '全部'})</span>
            </div>
            <div className="flex items-center gap-1">
              {isMonthSectionOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>
          </div>

          {isMonthSectionOpen && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 border border-zinc-800/60 rounded-xl p-1.5 bg-zinc-950/40 text-xs">
              <button
                onClick={() => setSelectedMonths([])}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  selectedMonths.length === 0
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span>不限時間 (全部)</span>
                {selectedMonths.length === 0 && <Check className="w-3.5 h-3.5" />}
              </button>

              {/* Year Accordions */}
              {sortedYears.map((year) => {
                const isExpanded = expandedYears[year] ?? (selectedMonths.some(m => m.startsWith(year)) || sortedYears[0] === year);
                const isYearSelected = selectedMonths.includes(year);
                const group = yearGroupMap[year];

                return (
                  <div key={year} className="border border-zinc-800/80 rounded-lg overflow-hidden bg-zinc-900/40">
                    {/* Year Header */}
                    <div className={`flex items-center justify-between px-2.5 py-1.5 cursor-pointer transition-colors ${
                      isYearSelected ? 'bg-indigo-600/30 text-indigo-200 border-l-2 border-indigo-500' : 'hover:bg-zinc-800/60 text-zinc-200'
                    }`}>
                      <div
                        onClick={() => toggleYearExpanded(year)}
                        className="flex items-center gap-1.5 flex-1 font-semibold"
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
                        <span>{year} 年</span>
                        <span className="text-[11px] font-normal text-zinc-400">({group.totalCount})</span>
                      </div>

                      <button
                        onClick={() => toggleMonthSelection(year)}
                        className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                          isYearSelected ? 'bg-indigo-600 text-white font-bold' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                        title={`複選/取消複選 ${year} 全年作品`}
                      >
                        {isYearSelected ? '已選全年' : '複選全年'}
                      </button>
                    </div>

                    {/* Expanded Month Grid */}
                    {isExpanded && (
                      <div className="grid grid-cols-2 gap-1 p-1.5 bg-zinc-950/60 border-t border-zinc-800/60">
                        {group.months.map((m) => {
                          const isMonthSelected = selectedMonths.includes(m.month);
                          const monthNum = m.month.split('-')[1] || m.month;

                          return (
                            <button
                              key={m.month}
                              onClick={() => toggleMonthSelection(m.month)}
                              className={`flex items-center justify-between px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                isMonthSelected
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
                              }`}
                            >
                              <span>{monthNum} 月</span>
                              <span className="opacity-70 text-[10px]">({m.count})</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
