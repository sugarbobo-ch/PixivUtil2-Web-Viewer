import React, { useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  RotateCcw,
  User,
  X,
} from 'lucide-react';
import { Artist, MonthItem } from '../types';
import { getTimeFilterLabel } from '../utils/timeFilterLabels';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  months: MonthItem[];
  artists: Artist[];
  selectedMonths: string[];
  setSelectedMonths: React.Dispatch<React.SetStateAction<string[]>>;
  selectedArtist: number | null;
  setSelectedArtist: (artistId: number | null) => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  onResetAllFilters?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  months,
  artists,
  selectedMonths,
  setSelectedMonths,
  selectedArtist,
  setSelectedArtist,
  searchQuery = '',
  setSearchQuery,
  onResetAllFilters,
}) => {
  const [artistFilter, setArtistFilter] = useState('');
  const [isMonthSectionOpen, setIsMonthSectionOpen] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});

  const filteredArtists = artists.filter(a =>
    a.name.toLowerCase().includes(artistFilter.toLowerCase())
  );

  const activeArtistObj = artists.find(a => a.member_id === selectedArtist);
  const isAnyFilterActive = selectedMonths.length > 0 || selectedArtist !== null || searchQuery !== '';

  const [monthSortAsc, setMonthSortAsc] = useState(false);

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

  const sortedYears = Object.keys(yearGroupMap).sort((a, b) =>
    monthSortAsc ? a.localeCompare(b) : b.localeCompare(a)
  );

  const toggleYearExpanded = (year: string) => {
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  const toggleMonthSelection = (target: string) => {
    setSelectedMonths(previous =>
      previous.includes(target)
        ? previous.filter(month => month !== target)
        : [...previous, target]
    );
  };

  const handleResetFilters = () => {
    setSelectedMonths([]);
    setSelectedArtist(null);
    if (setSearchQuery) setSearchQuery('');
    if (onResetAllFilters) onResetAllFilters();
  };

  if (!isOpen) return null;

  return (
    <aside id="gallery-filter-sidebar" className="app-sidebar w-72 flex flex-col h-full min-h-0 overflow-hidden overscroll-contain z-20 shrink-0 select-none">
      {/* Header Bar */}
      <div className="app-sidebar__header flex items-center justify-between">
        <div className="app-sidebar__heading flex items-center gap-2">
          <Filter className="app-sidebar__section-icon w-4 h-4" />
          <h2 className="text-sm font-semibold text-zinc-200">篩選條件</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="app-sidebar__close transition-colors"
          aria-label="關閉篩選側欄"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Active Compound Filter Badges */}
      {isAnyFilterActive && (
        <div className="app-sidebar__active-filters p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-indigo-300">目前組合複選中</span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="app-sidebar__reset text-[11px] flex items-center gap-1 hover:underline"
            >
              <RotateCcw className="w-3 h-3" /> 重設所有
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            {searchQuery && setSearchQuery && (
              <span className="app-sidebar__filter-chip">
                關鍵字: "{searchQuery}"
                <button
                  type="button"
                  className="app-sidebar__filter-chip-remove"
                  aria-label="移除搜尋條件"
                  onClick={() => setSearchQuery('')}
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            )}
            {selectedArtist !== null && (
              <span className="app-sidebar__filter-chip">
                繪師: {activeArtistObj?.name || selectedArtist}
                <button
                  type="button"
                  className="app-sidebar__filter-chip-remove"
                  aria-label="移除繪師條件"
                  onClick={() => setSelectedArtist(null)}
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            )}

            {selectedMonths.map(mStr => (
              <span key={mStr} className="app-sidebar__filter-chip">
                {getTimeFilterLabel(mStr)}: {mStr}
                <button
                  type="button"
                  className="app-sidebar__filter-chip-remove"
                  aria-label="移除月份條件"
                  onClick={() => toggleMonthSelection(mStr)}
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main Body */}
      <div className="app-sidebar__body flex-1 flex flex-col min-h-0 p-3 space-y-4 overflow-hidden">
        {/* 1. ARTIST SELECTION SECTION */}
        <div className="app-sidebar__section app-sidebar__section--artists flex-1 flex flex-col min-h-0">
          <div className="app-sidebar__section-heading flex items-center justify-between mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <User className="app-sidebar__section-icon w-4 h-4" />
              <span>繪師列表 ({artists.length})</span>
            </div>
            {selectedArtist !== null && (
              <button
                type="button"
                onClick={() => setSelectedArtist(null)}
                className="app-sidebar__action text-[11px] hover:underline"
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
            className="app-sidebar__search w-full mb-2 px-2.5 py-1.5 text-xs rounded-lg"
          />

          <div className="app-sidebar__list app-sidebar__artist-list flex-1 overflow-y-auto overscroll-contain space-y-1 pr-1 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setSelectedArtist(null)}
              className={`app-sidebar__artist-option w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedArtist === null ? 'is-selected' : ''
              }`}
            >
              <span>全部繪師</span>
              {selectedArtist === null && <Check className="w-3.5 h-3.5" />}
            </button>

            {filteredArtists.map((a) => (
              <button
                key={a.member_id}
                type="button"
                onClick={() => setSelectedArtist(a.member_id === selectedArtist ? null : a.member_id)}
                className={`app-sidebar__artist-option w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedArtist === a.member_id ? 'is-selected' : ''
                }`}
              >
                <span className="truncate max-w-[140px] text-left">{a.name || `ID: ${a.member_id}`}</span>
                <span className="text-[11px] opacity-70">({a.artwork_count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. MULTI-SELECTABLE YEAR -> MONTH ACCORDION SECTION */}
        <div className="app-sidebar__section app-sidebar__section--months border-t border-zinc-800 pt-3 shrink-0">
          <div className="app-sidebar__section-heading flex items-center justify-between mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setIsMonthSectionOpen(!isMonthSectionOpen)}
              className="app-sidebar__section-toggle flex items-center gap-2 cursor-pointer"
              aria-expanded={isMonthSectionOpen}
            >
              <Calendar className="app-sidebar__section-icon w-4 h-4" />
              <span>時間複選 ({selectedMonths.length > 0 ? `已選 ${selectedMonths.length} 項` : '全部'})</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMonthSortAsc(!monthSortAsc)}
                className="app-sidebar__sort-button text-[10px] px-1.5 py-0.5 rounded transition-colors"
                title={monthSortAsc ? "目前為舊到新 (點擊切換為新到舊)" : "目前為新到舊 (點擊切換為舊到新)"}
              >
                {monthSortAsc ? '舊到新 ↑' : '新到舊 ↓'}
              </button>
              <button
                type="button"
                onClick={() => setIsMonthSectionOpen(!isMonthSectionOpen)}
                className="app-sidebar__section-toggle-button text-zinc-400 hover:text-zinc-200"
                aria-label={isMonthSectionOpen ? '收合時間篩選' : '展開時間篩選'}
              >
                {isMonthSectionOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {isMonthSectionOpen && (
            <div className="app-sidebar__list app-sidebar__month-list space-y-1.5 max-h-56 overflow-y-auto overscroll-contain pr-1 rounded-xl p-1.5 text-xs">
              <button
                type="button"
                onClick={() => setSelectedMonths([])}
                className={`app-sidebar__month-reset w-full flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  selectedMonths.length === 0 ? 'is-selected' : ''
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
                const sortedGroupMonths = [...group.months].sort((a, b) =>
                  monthSortAsc ? a.month.localeCompare(b.month) : b.month.localeCompare(a.month)
                );

                return (
                  <div key={year} className="app-sidebar__year-card rounded-lg overflow-hidden">
                    {/* Year Header */}
                    <div className={`app-sidebar__year-header flex items-center justify-between px-2.5 py-1.5 cursor-pointer transition-colors ${
                      isYearSelected ? 'app-sidebar__year-header--selected' : 'hover:bg-zinc-800/60 text-zinc-200'
                    }`}>
                      <button
                        type="button"
                        onClick={() => toggleYearExpanded(year)}
                        className="app-sidebar__year-expander flex items-center gap-1.5 flex-1 font-semibold"
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
                        <span>{year} 年</span>
                        <span className="text-[11px] font-normal text-zinc-400">({group.totalCount})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleMonthSelection(year)}
                        className={`app-sidebar__year-toggle text-[11px] px-2 py-0.5 rounded transition-colors ${
                          isYearSelected ? 'is-selected' : ''
                        }`}
                        title={`複選/取消複選 ${year} 全年作品`}
                      >
                        {isYearSelected ? '已選全年' : '複選全年'}
                      </button>
                    </div>

                    {/* Expanded Month Grid */}
                    {isExpanded && (
                      <div className="app-sidebar__months-grid grid grid-cols-2 gap-1 p-1.5">
                        {sortedGroupMonths.map((m) => {
                          const isMonthSelected = selectedMonths.includes(m.month);
                          const monthNum = m.month.split('-')[1] || m.month;

                          return (
                            <button
                              key={m.month}
                              type="button"
                              onClick={() => toggleMonthSelection(m.month)}
                              className={`app-sidebar__month-button flex items-center justify-between px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                isMonthSelected ? 'is-selected' : ''
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
