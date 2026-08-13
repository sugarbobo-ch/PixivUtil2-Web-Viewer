import React, { useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
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
import { useI18n } from '../i18n';
import { getArtistScopeKey } from '../utils/artistIdentity';
import {
  getYearFromTimeFilter,
  hasCompleteYearSelection,
  isYearTimeFilter,
  normalizeSelectedMonths,
} from '../utils/timeFilters';
import { Badge, Button, IconButton, Input } from './ui';
import { SidebarSectionHeader } from './ui/SidebarSectionHeader';
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_KEYBOARD_LARGE_STEP,
  SIDEBAR_KEYBOARD_STEP,
  SIDEBAR_MIN_WIDTH,
  snapSidebarWidth,
} from '../utils/sidebarLayout';

interface SidebarProps {
  isOpen: boolean;
  sidebarWidth: number;
  maxSidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  onSidebarWidthCommit?: (width: number) => void;
  onClose: () => void;
  months: MonthItem[];
  artists: Artist[];
  selectedMonths: string[];
  setSelectedMonths: React.Dispatch<React.SetStateAction<string[]>>;
  selectedArtist: string | null;
  setSelectedArtist: (artistKey: string | null) => void;
  onPrefetchArtist?: (artistKey: string | null) => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  onResetAllFilters?: () => void;
  isLoading?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  sidebarWidth,
  maxSidebarWidth,
  onSidebarWidthChange,
  onSidebarWidthCommit,
  onClose,
  months,
  artists,
  selectedMonths,
  setSelectedMonths,
  selectedArtist,
  setSelectedArtist,
  onPrefetchArtist,
  searchQuery = '',
  setSearchQuery,
  onResetAllFilters,
  isLoading = false,
}) => {
  const { t } = useI18n();
  const [artistFilter, setArtistFilter] = useState('');
  const [isMonthSectionOpen, setIsMonthSectionOpen] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [isActiveFiltersExpanded, setIsActiveFiltersExpanded] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeWidthRef = useRef(sidebarWidth);
  const resizeSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    direction: 1 | -1;
  } | null>(null);
  resizeWidthRef.current = sidebarWidth;

  const filteredArtists = artists.filter(a =>
    a.name.toLowerCase().includes(artistFilter.toLowerCase())
  );

  const activeArtistObj = artists.find(a => getArtistScopeKey(a) === selectedArtist);
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

  const getResizeDirection = (element: HTMLElement): 1 | -1 => (
    window.getComputedStyle(element).direction === 'rtl' ? -1 : 1
  );

  const setResizeState = (nextIsResizing: boolean) => {
    setIsResizing(nextIsResizing);
  };

  const updateSidebarWidth = (value: number) => {
    const nextWidth = snapSidebarWidth(value, maxSidebarWidth);
    resizeWidthRef.current = nextWidth;
    onSidebarWidthChange(nextWidth);
  };

  const commitSidebarWidth = (width = resizeWidthRef.current) => {
    const nextWidth = clampSidebarWidth(width, maxSidebarWidth);
    resizeWidthRef.current = nextWidth;
    onSidebarWidthChange(nextWidth);
    onSidebarWidthCommit?.(nextWidth);
  };

  const finishPointerResize = () => {
    if (!resizeSessionRef.current) return;
    resizeSessionRef.current = null;
    setResizeState(false);
    commitSidebarWidth();
  };

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: resizeWidthRef.current,
      direction: getResizeDirection(event.currentTarget),
    };
    setResizeState(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    updateSidebarWidth(
      session.startWidth + ((event.clientX - session.startX) * session.direction),
    );
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishPointerResize();
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = getResizeDirection(event.currentTarget);
    const currentWidth = resizeWidthRef.current;
    let nextWidth: number | null = null;

    if (event.key === 'ArrowRight') {
      nextWidth = currentWidth + (SIDEBAR_KEYBOARD_STEP * direction);
    } else if (event.key === 'ArrowLeft') {
      nextWidth = currentWidth - (SIDEBAR_KEYBOARD_STEP * direction);
    } else if (event.key === 'PageUp') {
      nextWidth = currentWidth + (SIDEBAR_KEYBOARD_LARGE_STEP * direction);
    } else if (event.key === 'PageDown') {
      nextWidth = currentWidth - (SIDEBAR_KEYBOARD_LARGE_STEP * direction);
    } else if (event.key === 'Home') {
      nextWidth = SIDEBAR_MIN_WIDTH;
    } else if (event.key === 'End') {
      nextWidth = maxSidebarWidth;
    }

    if (nextWidth === null) return;
    event.preventDefault();
    const snappedWidth = snapSidebarWidth(nextWidth, maxSidebarWidth);
    if (snappedWidth === currentWidth) return;
    commitSidebarWidth(snappedWidth);
  };

  const handleResizeDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    commitSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
  };

  if (!isOpen) return null;

  return (
    <aside
      id="gallery-filter-sidebar"
      className={`app-sidebar flex flex-col h-full min-h-0 overflow-hidden overscroll-contain z-20 shrink-0 select-none${isResizing ? ' is-resizing' : ''}`}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
    >
      {/* Header Bar */}
      <div className="app-sidebar__header flex items-center justify-between">
        <div className="app-sidebar__heading flex items-center gap-2">
          <Filter className="app-sidebar__section-icon w-4 h-4" />
          <h2 className="app-sidebar__title text-sm font-semibold">{t('filters.title')}</h2>
        </div>
        <IconButton
          type="button"
          onClick={onClose}
          className="app-sidebar__close"
          aria-label={t('filters.closeSidebar')}
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
            title={t('filters.active')}
            count={(
              <Badge
                variant="neutral"
                size="xs"
                className="app-sidebar__section-header-count-badge"
                aria-label={`${t('filters.active')}: ${activeFilterCount}`}
              >
                {activeFilterCount}
              </Badge>
            )}
            actions={(
              <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={handleResetFilters}
                className="app-sidebar__auxiliary-action"
              >
                <RotateCcw className="w-3 h-3" /> {t('filters.reset')}
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
              <span>{isActiveFiltersExpanded ? t('filters.collapse') : t('filters.showAll')}</span>
              <ChevronDown aria-hidden="true" />
            </Button>
          )}

          <div
            id="sidebar-active-filter-chips"
            className="app-sidebar__active-filters-chips"
            aria-label={t('filters.applied')}
          >
            {searchQuery && setSearchQuery && (
              <span className="app-sidebar__filter-chip">
                <span className="app-sidebar__filter-chip-label" title={`${t('filters.keyword')}: "${searchQuery}"`}>
                  {t('common.searchTitleArtist')}: "{searchQuery}"
                </span>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="app-sidebar__filter-chip-remove"
                  aria-label={t('filters.removeSearch')}
                  onClick={() => setSearchQuery('')}
                >
                  <X aria-hidden="true" />
                </IconButton>
              </span>
            )}
            {selectedArtist !== null && (
              <span className="app-sidebar__filter-chip">
                <span className="app-sidebar__filter-chip-label" title={`${t('filters.artistLabel')}: ${activeArtistObj?.name || selectedArtist}`}>
                  {t('filters.artistList')}: {activeArtistObj?.name || selectedArtist}
                </span>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="app-sidebar__filter-chip-remove"
                  aria-label={t('filters.removeArtist')}
                  onClick={() => setSelectedArtist(null)}
                  onPointerEnter={() => onPrefetchArtist?.(null)}
                  onPointerDown={() => onPrefetchArtist?.(null)}
                  onFocus={() => onPrefetchArtist?.(null)}
                >
                  <X aria-hidden="true" />
                </IconButton>
              </span>
            )}

            {selectedMonths.map(mStr => (
              <span key={mStr} className="app-sidebar__filter-chip">
                <span className="app-sidebar__filter-chip-label">{/^\d{4}$/.test(mStr.trim()) ? t('filters.year') : t('filters.month')}: {mStr}</span>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="app-sidebar__filter-chip-remove"
                  aria-label={t('filters.removeMonth')}
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
            title={t('filters.artistList')}
            count={`(${artists.length})`}
            actions={selectedArtist !== null ? (
              <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={() => setSelectedArtist(null)}
                className="app-sidebar__auxiliary-action"
              >
                {t('filters.cancelSelection')}
              </Button>
            ) : undefined}
          />

          <Input
            controlSize="sm"
            type="text"
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value)}
            placeholder={t('filters.searchArtist')}
            className="app-sidebar__search w-full mb-2 px-2.5 py-1.5 text-xs rounded-lg"
          />

          <div className="app-sidebar__list app-sidebar__artist-list flex-1 overflow-y-auto overscroll-contain space-y-1 pr-1 rounded-xl p-1">
            {isLoading ? (
              <div className="app-sidebar__loading" role="status" aria-live="polite" aria-busy="true">
                <span className="app-sidebar__loading-dot" aria-hidden="true" />
                <span>{t('filters.loadingArtists')}</span>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => setSelectedArtist(null)}
                  onPointerEnter={() => onPrefetchArtist?.(null)}
                  onPointerDown={() => onPrefetchArtist?.(null)}
                  onFocus={() => onPrefetchArtist?.(null)}
                  variant={selectedArtist === null ? 'primary' : 'ghost'}
                  fullWidth
                  className={`app-sidebar__artist-option ${
                    selectedArtist === null ? 'is-selected' : ''
                  }`}
                >
                  <span>{t('filters.allArtists')}</span>
                  {selectedArtist === null && <Check className="w-3.5 h-3.5" />}
                </Button>

                {filteredArtists.map((a) => {
                  const artistKey = getArtistScopeKey(a);
                  return (
                  <Button
                    key={artistKey}
                    type="button"
                    onClick={() => setSelectedArtist(artistKey === selectedArtist ? null : artistKey)}
                    onPointerEnter={() => onPrefetchArtist?.(artistKey)}
                    onPointerDown={() => onPrefetchArtist?.(artistKey)}
                    onFocus={() => onPrefetchArtist?.(artistKey)}
                    variant={selectedArtist === artistKey ? 'primary' : 'ghost'}
                    fullWidth
                    className={`app-sidebar__artist-option ${
                      selectedArtist === artistKey ? 'is-selected' : ''
                    }`}
                  >
                    <span className="app-sidebar__artist-name">{a.name || `ID: ${a.member_id}`}</span>
                    <span className="app-sidebar__artist-count">({a.artwork_count})</span>
                  </Button>
                  );
                })}
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
            title={t('filters.timeMultiSelect')}
            count={selectedMonths.length > 0 ? (
              <Badge
                variant="neutral"
                size="xs"
                className="app-sidebar__section-header-count-badge"
                aria-label={`${t('filters.timeMultiSelect')}: ${selectedMonths.length}`}
              >
                {selectedMonths.length}
              </Badge>
            ) : undefined}
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
                <IconButton
                  type="button"
                  onClick={() => setMonthSortAsc(!monthSortAsc)}
                  variant="ghost"
                  size="sm"
                  className="app-sidebar__sort-toggle"
                  aria-label={monthSortAsc ? t('filters.sortOldToNew') : t('filters.sortNewToOld')}
                  title={monthSortAsc ? t('filters.sortOldToNew') : t('filters.sortNewToOld')}
                  aria-pressed={monthSortAsc}
                >
                  {monthSortAsc
                    ? <ArrowUpNarrowWide aria-hidden="true" />
                    : <ArrowDownWideNarrow aria-hidden="true" />}
                </IconButton>
                <IconButton
                  type="button"
                  onClick={() => setIsMonthSectionOpen(previous => !previous)}
                  variant="ghost"
                  size="md"
                  className="app-sidebar__section-toggle-button"
                  aria-label={isMonthSectionOpen ? t('filters.collapseTime') : t('filters.expandTime')}
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
                <span>{t('filters.unlimitedTime')}</span>
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
                          <span className="app-sidebar__year-label-year">{t('filters.yearValue', { year })}</span>
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
                        title={`${t('filters.selectAllYear')} ${year}`}
                      >
                        {isYearSelected ? t('filters.selectedAllYear') : t('filters.selectAllYear')}
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
                              <span>{t('filters.monthValue', { month: monthNum })}</span>
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

      <div
        className="app-sidebar__resize-handle"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={t('filters.resizeSidebar')}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={maxSidebarWidth}
        aria-valuenow={sidebarWidth}
        aria-valuetext={sidebarWidth === SIDEBAR_DEFAULT_WIDTH ? t('filters.sidebarDefaultWidth') : t('filters.sidebarCurrentWidth')}
        title={t('filters.resizeSidebarHint')}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={finishPointerResize}
        onLostPointerCapture={finishPointerResize}
        onKeyDown={handleResizeKeyDown}
        onDoubleClick={handleResizeDoubleClick}
      />
    </aside>
  );
};
