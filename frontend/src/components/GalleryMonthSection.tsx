import React from 'react';
import { Calendar, Check, Film, Layers, Square, CheckSquare } from 'lucide-react';
import { ImageItem, WorkGroup } from '../types';
import { getItemGroupKey } from '../utils/grouping';
import { buildThumbnailUrl } from '../utils/webConfig';
import {
  getRowCount,
  getSectionContentHeight,
  getVirtualRange,
  GridMetrics,
  parseGridMetrics,
  VirtualRange,
} from '../utils/galleryLayout';
import { ImagePriority } from '../utils/imageLoadScheduler';
import { GalleryThumbnail } from './GalleryThumbnail';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';

export interface GalleryMonthGroup {
  key: string;
  label: string;
  items: { item: ImageItem; globalIndex: number }[];
}

interface GalleryMonthSectionProps {
  group: GalleryMonthGroup;
  groupMangaPosts: boolean;
  thumbnailSize: number;
  isEditMode: boolean;
  selectedIds: Set<number>;
  onSetSelection: (imageIds: number[], selected: boolean) => void;
  onOpenFullscreen: (index: number) => void;
  onOpenWorkGroup?: (group: WorkGroup) => void;
  beginPointerGesture: (event: React.PointerEvent<HTMLElement>, cardKey: string, cardIds: number[]) => void;
  handleCardClick: (event: React.MouseEvent<HTMLElement>, cardIds: number[], openCard: () => void) => void;
  handleCardKeyDown: (event: React.KeyboardEvent<HTMLElement>, cardIds: number[], openCard: () => void) => void;
  blurEnabled: boolean;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  scrollTick: number;
  navigationMode: 'idle' | 'click-scrolling' | 'scrubbing-preview' | 'scrubbing-settle' | 'scrubbing-commit';
  destinationMonthKey?: string | null;
  destinationGlobalIndex?: number | null;
}

interface DisplayCard {
  key: string;
  item: ImageItem;
  globalIndex: number;
  ids: number[];
  globalIndices: number[];
  workGroup?: WorkGroup;
}

const FALLBACK_METRICS: GridMetrics = {
  columns: 2,
  cardSize: 180,
  columnGap: 12,
  rowGap: 12,
  rowStride: 192,
};

const rangesEqual = (left: VirtualRange, right: VirtualRange) => (
  left.start === right.start
  && left.end === right.end
  && left.startIndex === right.startIndex
  && left.endIndex === right.endIndex
);

export const GalleryMonthSection: React.FC<GalleryMonthSectionProps> = ({
  group,
  groupMangaPosts,
  thumbnailSize,
  isEditMode,
  selectedIds,
  onSetSelection,
  onOpenFullscreen,
  onOpenWorkGroup,
  beginPointerGesture,
  handleCardClick,
  handleCardKeyDown,
  blurEnabled,
  scrollContainerRef,
  scrollTick,
  navigationMode,
  destinationMonthKey = null,
  destinationGlobalIndex = null,
}) => {
  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  const gridShellRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = React.useState<GridMetrics | null>(null);
  const [virtualRange, setVirtualRange] = React.useState<VirtualRange>({
    start: 0,
    end: 0,
    startIndex: 0,
    endIndex: 0,
  });

  const displayCards = React.useMemo<DisplayCard[]>(() => {
    if (!groupMangaPosts) {
      return group.items.map(({ item, globalIndex }) => ({
        key: `image:${globalIndex}`,
        item,
        globalIndex,
        ids: [item.image_id],
        globalIndices: [globalIndex],
      }));
    }

    const grouped = new Map<string, { cover: ImageItem; items: { item: ImageItem; globalIndex: number }[] }>();
    group.items.forEach(entry => {
      const key = getItemGroupKey(entry.item);
      const current = grouped.get(key);
      if (current) current.items.push(entry);
      else grouped.set(key, { cover: entry.item, items: [entry] });
    });

    return Array.from(grouped, ([groupId, value]) => {
      const coverEntry = value.items[0];
      const workGroup: WorkGroup = {
        group_id: groupId,
        image_id: value.cover.image_id,
        member_id: value.cover.member_id,
        title: value.cover.title,
        artist_name: value.cover.artist_name,
        created_date: value.cover.created_date,
        cover: value.cover,
        items: value.items.map(entry => entry.item),
      };
      return {
        key: `work:${groupId}:${coverEntry.globalIndex}`,
        item: value.cover,
        globalIndex: coverEntry.globalIndex,
        ids: Array.from(new Set(value.items.map(entry => entry.item.image_id))),
        globalIndices: value.items.map(entry => entry.globalIndex),
        workGroup,
      };
    });
  }, [group.items, group.key, groupMangaPosts]);

  const destinationLocalIndex = destinationMonthKey === group.key && destinationGlobalIndex !== null
    ? displayCards.findIndex(card => card.globalIndices.includes(destinationGlobalIndex))
    : undefined;

  const measure = React.useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const next = parseGridMetrics(grid);
    if (!next) return;
    setMetrics(current => (
      current
      && current.columns === next.columns
      && Math.abs(current.cardSize - next.cardSize) < 0.5
      && Math.abs(current.rowGap - next.rowGap) < 0.5
        ? current
        : next
    ));
  }, []);

  React.useLayoutEffect(() => {
    measure();
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [measure, group.key, groupMangaPosts]);

  // Recompute the mounted window before the browser paints after a large
  // scrub jump. A normal effect leaves one frame where scrollTop has moved
  // but the old virtual range is still mounted, which looks like an unloaded
  // gallery while the pointer is held down.
  React.useLayoutEffect(() => {
    const root = scrollContainerRef.current;
    const shell = gridShellRef.current;
    const activeMetrics = metrics ?? FALLBACK_METRICS;
    if (!root || !shell) return;

    const rootRect = root.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const viewportHeight = Math.max(1, rootRect.height);
    const forcedIndex = destinationLocalIndex !== undefined && destinationLocalIndex >= 0
      ? destinationLocalIndex
      : undefined;
    const nextRange = getVirtualRange({
      itemCount: displayCards.length,
      metrics: activeMetrics,
      gridTop: shellRect.top,
      viewportTop: rootRect.top - viewportHeight,
      viewportBottom: rootRect.bottom + viewportHeight,
      overscanRows: Math.max(1, Math.ceil(viewportHeight / activeMetrics.rowStride)),
      forcedIndex,
    });
    setVirtualRange(current => rangesEqual(current, nextRange) ? current : nextRange);
  }, [destinationLocalIndex, displayCards.length, metrics, navigationMode, scrollContainerRef, scrollTick]);

  const activeMetrics = metrics ?? FALLBACK_METRICS;
  const totalRows = getRowCount(displayCards.length, activeMetrics.columns);
  const totalHeight = getSectionContentHeight(totalRows, activeMetrics);
  const destinationMode = destinationMonthKey === group.key;
  const cards = displayCards.slice(virtualRange.startIndex, virtualRange.endIndex);

  const visibleRange = React.useMemo(() => {
    const root = scrollContainerRef.current;
    const shell = gridShellRef.current;
    if (!root || !shell) return virtualRange;
    const rootRect = root.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    return getVirtualRange({
      itemCount: displayCards.length,
      metrics: activeMetrics,
      gridTop: shellRect.top,
      viewportTop: rootRect.top,
      viewportBottom: rootRect.bottom,
      forcedIndex: destinationMode ? destinationLocalIndex : undefined,
    });
  }, [activeMetrics, destinationLocalIndex, destinationMode, displayCards.length, scrollTick, scrollContainerRef, virtualRange]);

  const isClickNavigation = navigationMode === 'click-scrolling';
  const renderCard = (card: DisplayCard, localIndex: number) => {
    const isVisible = localIndex >= visibleRange.startIndex && localIndex < visibleRange.endIndex;
    const destinationRow = destinationLocalIndex !== undefined
      ? Math.floor(destinationLocalIndex / activeMetrics.columns)
      : -1;
    const isDestination = destinationMode
      && destinationRow >= 0
      && Math.floor(localIndex / activeMetrics.columns) === destinationRow;
    const priority: ImagePriority = isDestination ? 0 : isVisible ? 1 : 2;
    // A click jump keeps the destination row at the highest priority, while
    // every card currently visible during the movement is also eligible. This
    // avoids a one-row-only state without admitting the offscreen virtual
    // range before it reaches the viewport.
    // During a scrub, the gallery follows the pointer and the virtual window
    // itself is the admission boundary. A scroll event can arrive one frame
    // before visibleRange is recalculated; gating on that stale range would
    // leave the newly mounted cards as skeletons until another scroll event.
    // Keep all cards in the bounded virtual window eligible, while priority
    // still puts the currently visible row ahead of the overscan rows.
    const loadEnabled = isClickNavigation ? isVisible || isDestination : true;
    const isSelected = card.ids.length > 0 && card.ids.every(imageId => selectedIds.has(imageId));
    const isVideo = card.item.save_name.toLowerCase().endsWith('.mp4');
    const openCard = () => {
      if (card.workGroup && onOpenWorkGroup) onOpenWorkGroup(card.workGroup);
      else onOpenFullscreen(card.globalIndex);
    };

    return (
      <div
        key={card.key}
        data-selection-card="true"
        data-selection-key={card.key}
        data-selection-ids={card.ids.join(',')}
        role={isEditMode ? 'checkbox' : 'button'}
        tabIndex={0}
        aria-checked={isEditMode ? isSelected : undefined}
        aria-label={card.item.title || '作品'}
        onPointerDown={event => beginPointerGesture(event, card.key, card.ids)}
        onClick={event => handleCardClick(event, card.ids, openCard)}
        onKeyDown={event => handleCardKeyDown(event, card.ids, openCard)}
        className={`gallery-card group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 transition-[border-color,box-shadow,transform,background-color] duration-200 cursor-pointer select-none ${
          isSelected ? 'gallery-card--selected' : 'hover:border-zinc-700 hover:shadow-lg hover:shadow-indigo-500/10'
        }${isEditMode ? ' gallery-card--editable' : ''}`}
      >
        {card.item.media_status ? (
          <MediaIssuePlaceholder message={card.item.media_error} />
        ) : (
          <GalleryThumbnail
            src={buildThumbnailUrl(card.item, thumbnailSize)}
            alt={card.item.title}
            priority={priority}
            loadEnabled={loadEnabled}
            blurEnabled={blurEnabled}
            dominantColor={card.item.dominant_color}
          />
        )}

        {card.workGroup && (
          <div className="gallery-card__group-count viewer-group-badge absolute top-2 right-2 px-2 py-0.5 rounded-md font-bold text-xs flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            <span>{card.workGroup.items.length}P</span>
          </div>
        )}

        {isVideo && (
          <div className="gallery-card__video-badge absolute top-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white">
            <Film className="w-3.5 h-3.5" />
          </div>
        )}

        {isEditMode && (
          <div className="absolute top-2 left-2 z-10">
            <div className={`gallery-selection-indicator${isSelected ? ' is-selected' : ''}`} aria-hidden="true">
              <Check className="w-4 h-4" />
            </div>
          </div>
        )}

        <div className="gallery-card__overlay pointer-events-none absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-xs font-medium text-white truncate">{card.item.title || '無題'}</p>
          <p className="text-[10px] text-zinc-400 truncate">{card.item.artist_name || `繪師 ID: ${card.item.member_id}`}</p>
        </div>
      </div>
    );
  };

  const monthIds = Array.from(new Set(group.items.map(({ item }) => item.image_id)));
  const selectedMonthCount = monthIds.filter(imageId => selectedIds.has(imageId)).length;
  const isMonthSelected = monthIds.length > 0 && selectedMonthCount === monthIds.length;

  return (
    <div ref={sectionRef} id={`month-section-${group.key}`} className="gallery-month-section space-y-3">
      <div
        className="gallery-month-header sticky z-10 py-2 px-3.5 bg-zinc-900/90 backdrop-blur border border-zinc-800/80 rounded-xl flex items-center justify-between shadow-md"
        style={{ top: '-1rem' }}
      >
        <div className="gallery-month-header__title flex items-center gap-2 text-xs font-bold text-indigo-300">
          <Calendar className="w-4 h-4 text-indigo-400" />
          <span>{group.label}</span>
        </div>
        <div className="gallery-month-header__actions">
          <span className="gallery-month-header__count gallery-month-header__count--full text-[11px] font-medium text-zinc-400">
            此月份共有 {group.items.length} 張作品
          </span>
          <span className="gallery-month-header__count gallery-month-header__count--compact text-[11px] font-medium text-zinc-400" aria-hidden="true">
            {group.items.length} 張
          </span>
          {isEditMode && (
            <button
              type="button"
              onClick={() => onSetSelection(monthIds, !isMonthSelected)}
              className={`gallery-month-select${isMonthSelected ? ' is-selected' : ''}`}
              aria-pressed={isMonthSelected}
              title={`${isMonthSelected ? '取消' : '選取'}目前頁面中的${group.label}作品`}
            >
              {isMonthSelected ? <CheckSquare aria-hidden="true" /> : <Square aria-hidden="true" />}
              <span>{isMonthSelected ? '取消本月' : '選取本月'}</span>
            </button>
          )}
        </div>
      </div>

      <div ref={gridShellRef} className="gallery-month-virtual-shell relative" style={{ height: `${totalHeight}px` }}>
        <div
          ref={gridRef}
          className="gallery-month-virtual-grid absolute inset-x-0 top-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
          style={{
            top: `${virtualRange.start * activeMetrics.rowStride}px`,
            gridAutoRows: `${activeMetrics.cardSize}px`,
          }}
        >
          {cards.map((card, index) => renderCard(card, virtualRange.startIndex + index))}
        </div>
      </div>
    </div>
  );
};
