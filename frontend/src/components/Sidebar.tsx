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
import {
  getYearFromTimeFilter,
  hasCompleteYearSelection,
  isYearTimeFilter,
  normalizeSelectedMonths,
} from '../utils/timeFilters';
import { Button, IconButton, Input } from './ui';
import { SidebarSectionHeader } from './ui/SidebarSectionHeader';

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
  isLoading?: boolean;
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
  isLoading = false,
}) => {
  const [artistFilter, setArtistFilter] = useState('');
  const [isMonthSectionOpen, setIsMonthSectionOpen] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [isActiveFiltersExpanded, setIsActiveFiltersExpanded] = useState(false);

  const filteredArtists = artists.filter(a =>
    a.name.toLowerCase().includes(artistFilter.toLowerCase())
  );

  const activeArtistObj = artists.find(a => a.member_id === selectedArtist);
  const isAnyFilterActive = selectedMonths.length > 0 || selectedArtist !== null || searchQuery !== '';
  const activeFilterCount =
    selectedMonths.length +
    (selectedArtist !== null ? 1 : 0) +
    (searchQuery !== '' ? 1 : 0);

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

  const toggleYearSelection = (year: string) => {
    setSelectedMonths(previous => {
      const normalized = normalizeSelectedMonths(previous);
      if (normalized.includes(year)) {
        return normalized.filter(value => value !== year);
      }

      const withoutYear = normalized.filter(value => getYearFromTimeFilter(value) !== year);
      return normalizeSelectedMonths([...withoutYear, year]);
    });
  };

  const toggleMonthSelection = (target: string) => {
    const year = getYearFromTimeFilter(target);
    if (!year) return;

    setSelectedMonths(previous => {
      const normalized = normalizeSelectedMonths(previous);
      if (normalized.includes(year)) {
        const siblingMonths = yearGroupMap[year]?.months.map(month => month.month) ?? [];
        const withoutYear = normalized.filter(value => getYearFromTimeFilter(value) !== year);
        return normalizeSelectedMonths([
          ...withoutYear,
          ...siblingMonths.filter(month => month !== target),
        ]);
      }

      const next = normalized.includes(target)
        ? normalized.filter(month => month !== target)
        : [...normalized, target];
      return normalizeSelectedMonths(next);
    });
  };

  const toggleTimeFilterSelection = (target: string) => {
    if (isYearTimeFilter(target)) {
      toggleYearSelection(target);
      return;
    }
    toggleMonthSelection(target);
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
          <h2 className="app-sidebar__title text-sm font-semibold">篩選條件</h2>
        </div>
        <IconButton
          type="button"
          onClick={onClose}
          className="app-sidebar__close"
          aria-label="關閉篩選側欄"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      </div>

      {/* Active Compound Filter Badges */}
      {isAnyFilterActive && (
        <div
          className={`app-sidebar__active-filters ${activeFilterCount > 3
            ? (isActiveFiltersExpanded ? 'is-expanded' : 'is-collapsed')
            : ''
          }`}
        >
          <SidebarSectionHeader
            className="app-sidebar__section-header--active-filters"
            title="目前篩選"
            count={`${activeFilterCount} 項`}
            actions={(
              <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={handleResetFilters}
                className="app-sidebar__auxiliary-action"
              >
                <RotateCcw className="w-3 h-3" /> 重設所有
              </Button>
            )}
          />

          {activeFilterCount > 3 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="app-sidebar__active-filters-toggle"
              aria-controls="sidebar-active-filter-chips"
              aria-expanded={isActiveFiltersExpanded}
              onClick={() => setIsActiveFiltersExpanded(previous => !previous)}
            >
              <span>{isActiveFiltersExpanded ? '收合條件' : '查看全部條件'}</span>
              <ChevronDown aria-hidden="true" />
            </Button>
          )}

          <div
            id="sidebar-active-filter-chips"
            className="app-sidebar__active-filters-chips"
            aria-label="已套用的篩選條件"
          >
            {searchQuery && setSearchQuery && (
              <span className="app-sidebar__filter-chip">
                <span className="app-sidebar__filter-chip-label" title={`關鍵字: "${searchQuery}"`}>
                  關鍵字: "{searchQuery}"
                </span>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="app-sidebar__filter-chip-remove"
                  aria-label="移除搜尋條件"
                  onClick={() => setSearchQuery('')}
                >
                  <X aria-hidden="true" />
                </IconButton>
              </span>
            )}
            {selectedArtist !== null && (
              <span className="app-sidebar__filter-chip">
                <span className="app-sidebar__filter-chip-label" title={`繪師: ${activeArtistObj?.name || selectedArtist}`}>
                  繪師: {activeArtistObj?.name || selectedArtist}
                </span>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="app-sidebar__filter-chip-remove"
                  aria-label="移除繪師條件"
                  onClick={() => setSelectedArtist(null)}
                >
                  <X aria-hidden="true" />
                </IconButton>
              </span>
            )}

            {selectedMonths.map(mStr => (
              <span key={mStr} className="app-sidebar__filter-chip">
                <span className="app-sidebar__filter-chip-label">{getTimeFilterLabel(mStr)}: {mStr}</span>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="app-sidebar__filter-chip-remove"
                  aria-label="移除月份條件"
                  onClick={() => toggleTimeFilterSelection(mStr)}
                >
                  <X aria-hidden="true" />
                </IconButton>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main Body */}
      <div className="app-sidebar__body flex-1 flex flex-col min-h-0 p-3 space-y-4 overflow-hidden">
        {/* 1. ARTIST SELECTION SECTION */}
        <div className="app-sidebar__section app-sidebar__section--artists flex-1 flex flex-col min-h-0">
          <SidebarSectionHeader
            icon={<User className="app-sidebar__section-icon w-4 h-4" />}
            title="繪師列表"
            count={`(${artists.length})`}
            actions={selectedArtist !== null ? (
              <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={() => setSelectedArtist(null)}
                className="app-sidebar__auxiliary-action"
              >
                取消選擇
              </Button>
            ) : undefined}
          />

          <Input
            controlSize="sm"
            type="text"
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value)}
            placeholder="搜尋繪師名稱..."
            className="app-sidebar__search w-full mb-2 px-2.5 py-1.5 text-xs rounded-lg"
          />

          <div className="app-sidebar__list app-sidebar__artist-list flex-1 overflow-y-auto overscroll-contain space-y-1 pr-1 rounded-xl p-1">
            {isLoading ? (
              <div className="app-sidebar__loading" role="status" aria-live="polite" aria-busy="true">
                <span className="app-sidebar__loading-dot" aria-hidden="true" />
                <span>正在讀取繪師列表…</span>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => setSelectedArtist(null)}
                  variant={selectedArtist === null ? 'primary' : 'ghost'}
                  fullWidth
                  className={`app-sidebar__artist-option w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedArtist === null ? 'is-selected' : ''
                  }`}
                >
                  <span>全部繪師</span>
                  {selectedArtist === null && <Check className="w-3.5 h-3.5" />}
                </Button>

                {filteredArtists.map((a) => (
                  <Button
                    key={a.member_id}
                    type="button"
                    onClick={() => setSelectedArtist(a.member_id === selectedArtist ? null : a.member_id)}
                    variant={selectedArtist === a.member_id ? 'primary' : 'ghost'}
                    fullWidth
                    className={`app-sidebar__artist-option w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selectedArtist === a.member_id ? 'is-selected' : ''
                    }`}
                  >
                    <span className="truncate max-w-[140px] text-left">{a.name || `ID: ${a.member_id}`}</span>
                    <span className="text-[11px] opacity-70">({a.artwork_count})</span>
                  </Button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* 2. MULTI-SELECTABLE YEAR -> MONTH ACCORDION SECTION */}
        <div className="app-sidebar__section app-sidebar__section--months pt-3 shrink-0">
          <SidebarSectionHeader
            className={`app-sidebar__section-heading--months ${
              selectedMonths.length > 0 ? 'app-sidebar__section-heading--has-selection' : ''
            }`}
            icon={<Calendar className="app-sidebar__section-icon w-4 h-4" />}
            title="時間複選"
            count={`（${selectedMonths.length > 0 ? `已選 ${selectedMonths.length} 項` : '全部'}）`}
            titleButtonProps={{
              type: "button",
              onClick: () => setIsMonthSectionOpen(previous => !previous),
              variant: "ghost",
              size: "sm",
              className: "app-sidebar__section-toggle app-sidebar__section-toggle--months",
              "aria-expanded": isMonthSectionOpen,
            }}
            actions={(
              <>
                <Button
                  type="button"
                  onClick={() => setMonthSortAsc(!monthSortAsc)}
                  variant="plain"
                  size="sm"
                  className="app-sidebar__auxiliary-action"
                  title={monthSortAsc ? "目前為舊到新 (點擊切換為新到舊)" : "目前為新到舊 (點擊切換為舊到新)"}
                >
                  {monthSortAsc ? '舊到新 ↑' : '新到舊 ↓'}
                </Button>
                <IconButton
                  type="button"
                  onClick={() => setIsMonthSectionOpen(previous => !previous)}
                  variant="ghost"
                  size="md"
                  className="app-sidebar__section-toggle-button"
                  aria-label={isMonthSectionOpen ? '收合時間篩選' : '展開時間篩選'}
                >
                  {isMonthSectionOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </IconButton>
              </>
            )}
          />

          {isMonthSectionOpen && (
            <div className="app-sidebar__list app-sidebar__month-list space-y-1.5 max-h-56 overflow-y-auto overscroll-contain pr-1 rounded-xl p-1.5 text-xs">
              <Button
                type="button"
                onClick={() => setSelectedMonths([])}
                variant={selectedMonths.length === 0 ? 'primary' : 'ghost'}
                fullWidth
                className={`app-sidebar__month-reset w-full flex items-center justify-between px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  selectedMonths.length === 0 ? 'is-selected' : ''
                }`}
              >
                <span>不限時間 (全部)</span>
                {selectedMonths.length === 0 && <Check className="w-3.5 h-3.5" />}
              </Button>

              {/* Year Accordions */}
              {sortedYears.map((year) => {
                const isExpanded = expandedYears[year] ?? (selectedMonths.some(m => m.startsWith(year)) || sortedYears[0] === year);
                const isYearSelected = selectedMonths.includes(year) || hasCompleteYearSelection(selectedMonths, year);
                const group = yearGroupMap[year];
                const sortedGroupMonths = [...group.months].sort((a, b) =>
                  monthSortAsc ? a.month.localeCompare(b.month) : b.month.localeCompare(a.month)
                );

                return (
                  <div key={year} className="app-sidebar__year-card overflow-hidden">
                    {/* Year Header */}
                    <div className={`app-sidebar__year-header flex items-center justify-between px-2.5 py-1.5 cursor-pointer transition-colors ${
                      isYearSelected ? 'app-sidebar__year-header--selected' : 'app-sidebar__year-header--idle'
                    }`}>
                      <Button
                        type="button"
                        onClick={() => toggleYearExpanded(year)}
                        variant="ghost"
                        size="sm"
                        className="app-sidebar__year-expander flex items-center gap-1.5 flex-1 font-semibold"
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronDown className="app-sidebar__year-expander-icon w-3.5 h-3.5" /> : <ChevronRight className="app-sidebar__year-expander-icon w-3.5 h-3.5" />}
                        <span className="app-sidebar__year-label">
                          <span className="app-sidebar__year-label-year">{year} 年</span>
                          <span className="app-sidebar__year-count text-[11px] font-normal">({group.totalCount})</span>
                        </span>
                      </Button>

                      <Button
                        type="button"
                        onClick={() => toggleYearSelection(year)}
                        variant={isYearSelected ? 'primary' : 'secondary'}
                        size="sm"
                        className={`app-sidebar__year-toggle text-[11px] px-2 py-0.5 transition-colors ${
                          isYearSelected ? 'is-selected' : ''
                        }`}
                        title={`複選/取消複選 ${year} 全年作品`}
                      >
                        {isYearSelected ? '已選全年' : '複選全年'}
                      </Button>
                    </div>

                    {/* Expanded Month Grid */}
                    {isExpanded && (
                      <div className="app-sidebar__months-grid grid grid-cols-2 gap-1 p-1.5">
                        {sortedGroupMonths.map((m) => {
                          const isMonthSelected = isYearSelected || selectedMonths.includes(m.month);
                          const monthNum = m.month.split('-')[1] || m.month;

                          return (
                            <Button
                              key={m.month}
                              type="button"
                              onClick={() => toggleMonthSelection(m.month)}
                              variant={isMonthSelected ? 'primary' : 'secondary'}
                              size="sm"
                              fullWidth
                              className={`app-sidebar__month-button flex items-center justify-between px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                isMonthSelected ? 'is-selected' : ''
                              }`}
                            >
                              <span>{monthNum} 月</span>
                              <span className="opacity-70 text-[10px]">({m.count})</span>
                            </Button>
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
