import React from 'react';
import { Calendar, Check, Copy, Film, Square, CheckSquare } from 'lucide-react';
import type { ImageItem, WorkGroup } from '../types';
import { useI18n } from '../i18n';
import { getItemGroupKey } from '../utils/grouping';
import { isVideoItem } from '../utils/media';
import { buildThumbnailUrl } from '../utils/webConfig';
import { ImagePriority } from '../utils/imageLoadScheduler';
import { getImageSelectionKey, getWorkSelectionKey } from '../utils/gallerySelection';
import type { GalleryLayoutIndex, GalleryMonthLayout } from '../media-window';
import type { GlobalIndex, MediaWindowController, MediaWindowSnapshot } from '../media-window';
import { GalleryThumbnail } from './GalleryThumbnail';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';
import { Badge } from './ui';

export interface GalleryGlobalTrackProps {
  mediaWindow: MediaWindowController;
  snapshot: MediaWindowSnapshot;
  layout: GalleryLayoutIndex;
  thumbnailSize: number;
  groupMangaPosts: boolean;
  isEditMode: boolean;
  selectedIds: Set<number>;
  onSetSelection: (imageIds: number[], selected: boolean) => void;
  onOpenFullscreen: (globalIndex: GlobalIndex) => void;
  onPrefetchReader?: () => void;
  onOpenWorkGroup?: (group: WorkGroup) => void;
  blurEnabled: boolean;
  demoMode: boolean;
  navigationMode?: 'idle' | 'click-scrolling' | 'scrubbing-preview' | 'scrubbing-settle' | 'scrubbing-commit';
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}

interface LoadedCard {
  item?: ImageItem;
  globalIndex?: number;
  dominantColor?: string;
  items: Array<{ item: ImageItem; globalIndex: number }>;
}

const getMonthCard = (
  month: GalleryMonthLayout,
  cardIndex: number,
  grouped: boolean,
  entries: Array<{ item: ImageItem; globalIndex: number }>,
): LoadedCard => {
  if (!grouped) {
    const entry = entries.find(candidate => candidate.globalIndex === month.offset + cardIndex);
    return entry
      ? { item: entry.item, globalIndex: entry.globalIndex, items: [entry] }
      : { items: [] };
  }

  const byCardIndex = entries.find(candidate => candidate.item.group_card_index === cardIndex);
  if (byCardIndex) {
    const groupKey = getItemGroupKey(byCardIndex.item);
    const items = entries.filter(candidate => getItemGroupKey(candidate.item) === groupKey);
    return { item: byCardIndex.item, globalIndex: byCardIndex.globalIndex, items };
  }

  const groups = new Map<string, Array<{ item: ImageItem; globalIndex: number }>>();
  entries.forEach(entry => {
    const key = getItemGroupKey(entry.item);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });
  const fallbackItems = Array.from(groups.values())[cardIndex];
  return fallbackItems?.[0]
    ? { item: fallbackItems[0].item, globalIndex: fallbackItems[0].globalIndex, items: fallbackItems }
    : { items: [] };
};

const GlobalCard: React.FC<{
  card: LoadedCard;
  cardIndex: number;
  month: GalleryMonthLayout;
  thumbnailSize: number;
  groupMangaPosts: boolean;
  isEditMode: boolean;
  selectedIds: Set<number>;
  onSetSelection: (imageIds: number[], selected: boolean) => void;
  onOpenFullscreen: (globalIndex: number) => void;
  onPrefetchReader?: () => void;
  onOpenWorkGroup?: (group: WorkGroup) => void;
  blurEnabled: boolean;
  demoMode: boolean;
  loadEnabled: boolean;
  t: ReturnType<typeof useI18n>['t'];
}> = ({
  card,
  cardIndex,
  month,
  thumbnailSize,
  groupMangaPosts,
  isEditMode,
  selectedIds,
  onSetSelection,
  onOpenFullscreen,
  onPrefetchReader,
  onOpenWorkGroup,
  blurEnabled,
  demoMode,
  loadEnabled,
  t,
}) => {
  const item = card.item;
  if (!item || card.globalIndex === undefined) {
    const dominantColor = /^#[0-9A-Fa-f]{6}$/.test(card.dominantColor ?? '')
      ? card.dominantColor
      : undefined;
    return (
      <div
        className={`gallery-global-card-placeholder gallery-card${dominantColor ? ' has-dominant-color' : ' gallery-global-card-skeleton'}`}
        data-global-card-index={`${month.key}:${cardIndex}`}
        style={dominantColor
          ? { '--gallery-thumbnail-dominant': dominantColor } as React.CSSProperties
          : undefined}
        aria-busy="true"
        aria-label={t('gallery.loadingWorks')}
      />
    );
  }

  const ids = Array.from(new Set(card.items.map(entry => entry.item.image_id)));
  const isSelected = ids.length > 0 && ids.every(imageId => selectedIds.has(imageId));
  const group = groupMangaPosts && card.items.length > 0
    ? {
      group_id: getItemGroupKey(item),
      image_id: item.image_id,
      member_id: item.member_id,
      title: item.title,
      artist_name: item.artist_name,
      created_date: item.created_date,
      cover: item,
      items: card.items.map(entry => entry.item),
    } satisfies WorkGroup
    : undefined;
  const isVideo = isVideoItem(item);
  const open = () => {
    if (isEditMode) {
      onSetSelection(ids, !isSelected);
    } else if (group && onOpenWorkGroup) {
      onOpenWorkGroup(group);
    } else {
      onOpenFullscreen(card.globalIndex!);
    }
  };

  return (
    <button
      type="button"
      className={`gallery-card group relative aspect-square overflow-hidden cursor-pointer select-none${isSelected ? ' gallery-card--selected' : ''}${isEditMode ? ' gallery-card--editable' : ''}`}
      data-selection-card="true"
      data-selection-key={group ? getWorkSelectionKey(month.key, group.group_id, item) : getImageSelectionKey(item)}
      data-selection-ids={ids.join(',')}
      data-gallery-index={card.globalIndex}
      data-gallery-indices={card.items.map(entry => entry.globalIndex).join(' ')}
      role={isEditMode ? 'checkbox' : undefined}
      aria-checked={isEditMode ? isSelected : undefined}
      aria-label={item.title || t('gallery.work')}
      onPointerEnter={onPrefetchReader}
      onFocus={onPrefetchReader}
      onClick={open}
    >
      <div className="gallery-card__media relative h-full min-w-0">
        {item.media_status ? (
          <MediaIssuePlaceholder message={item.media_error} />
        ) : (
          <GalleryThumbnail
            src={buildThumbnailUrl(item, thumbnailSize)}
            alt={item.title}
            priority={1 as ImagePriority}
            loadEnabled={loadEnabled && !demoMode}
            blurEnabled={blurEnabled}
            demoMode={demoMode}
            dominantColor={item.dominant_color}
          />
        )}

        {(group || isVideo) && (
          <div className="gallery-card__badges" aria-hidden="true">
            {group && (
              <Badge variant="surface" size="sm" className="gallery-card__group-count">
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{item.group_page_total ?? group.items.length}</span>
              </Badge>
            )}
            {isVideo && (
              <Badge variant="surface" size="sm" iconOnly className="gallery-card__video-badge">
                <Film className="w-3.5 h-3.5" aria-hidden="true" />
              </Badge>
            )}
          </div>
        )}

        {isEditMode && (
          <div className="absolute inset-block-start-2 inset-inline-start-2 z-10">
            <div className={`gallery-selection-indicator${isSelected ? ' is-selected' : ''}`} aria-hidden="true">
              <Check className="w-4 h-4" />
            </div>
          </div>
        )}
      </div>
      <div className="gallery-card__caption pointer-events-none absolute inset-inline-0 inset-block-end-0" aria-hidden="true">
        <p className="gallery-card__title" title={item.title || t('gallery.noTitle')}>{item.title || t('gallery.noTitle')}</p>
        <p className="gallery-card__artist" title={item.artist_name || t('gallery.artistId', { id: item.member_id })}>
          {item.artist_name || t('gallery.artistId', { id: item.member_id })}
        </p>
      </div>
    </button>
  );
};

export const GalleryGlobalTrack: React.FC<GalleryGlobalTrackProps> = ({
  mediaWindow,
  snapshot,
  layout,
  thumbnailSize,
  groupMangaPosts,
  isEditMode,
  selectedIds,
  onSetSelection,
  onOpenFullscreen,
  onPrefetchReader,
  onOpenWorkGroup,
  blurEnabled,
  demoMode,
  navigationMode = 'idle',
  scrollContainerRef,
}) => {
  const { t, formatNumber } = useI18n();
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(720);
  const viewportPinRef = React.useRef<(() => void) | null>(null);
  const metrics = layout.metrics;

  React.useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;
    const update = () => {
      setScrollTop(container.scrollTop);
      setViewportHeight(Math.max(1, container.clientHeight));
    };
    update();
    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        update();
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
    };
  }, [scrollContainerRef]);

  const visibleMonths = React.useMemo(() => {
    const overscan = viewportHeight;
    return layout.months.filter(month => (
      month.top < scrollTop + viewportHeight + overscan
      && month.top + month.height > Math.max(0, scrollTop - overscan)
    ));
  }, [layout.months, scrollTop, viewportHeight]);

  const loadedEntriesByMonth = React.useMemo(() => {
    const result = new Map<string, Array<{ item: ImageItem; globalIndex: number }>>();
    const loadedSlots = snapshot.getLoaded?.() ?? [];
    loadedSlots.forEach(slot => {
      if (slot.status !== 'ready' || !slot.item) return;
      const month = layout.getMonthForGlobalIndex(slot.index);
      if (!month || slot.index < month.offset || slot.index >= month.offset + month.imageCount) return;
      const current = result.get(month.key) ?? [];
      current.push({ item: slot.item, globalIndex: slot.index });
      result.set(month.key, current);
    });
    result.forEach(entries => entries.sort((left, right) => left.globalIndex - right.globalIndex));
    return result;
  }, [layout, snapshot]);

  React.useEffect(() => {
    // During a long jump the layout index already knows the destination and
    // App pins its target range. Do not chase every intermediate scroll frame
    // with a new viewport request; unloaded cards keep their fixed geometry
    // and dominant-color placeholder until navigation settles.
    if (navigationMode !== 'idle') {
      viewportPinRef.current?.();
      viewportPinRef.current = null;
      return undefined;
    }

    // Keep the viewport request limited to rows that can actually be seen.
    // Overscanning whole adjacent months can span thousands of cards and
    // exceed the bounded media window, causing loaded cards to be evicted and
    // painted as skeletons again while the user is still at the same scroll
    // position.
    const range = layout.getViewportRange(scrollTop, scrollTop + viewportHeight, 0, groupMangaPosts);
    viewportPinRef.current?.();
    viewportPinRef.current = mediaWindow.pin('gallery-viewport', range);
    void mediaWindow.ensure(range, 'viewport').catch(() => undefined);
    return () => {
      viewportPinRef.current?.();
      viewportPinRef.current = null;
    };
  }, [groupMangaPosts, layout, mediaWindow, navigationMode, scrollTop, snapshot.revision, viewportHeight]);

  React.useEffect(() => () => viewportPinRef.current?.(), []);

  return (
    <div
      ref={trackRef}
      className="gallery-global-track relative min-h-full"
      style={{ height: `${layout.totalHeight}px` }}
      data-global-total={snapshot.total}
      data-global-revision={snapshot.revision}
      data-global-loading={snapshot.getLoaded?.().filter(slot => slot.status === 'loading').length ?? -1}
      aria-busy={snapshot.revision === ''}
    >
      {visibleMonths.map(month => {
        const contentGap = month.rows > 0 ? metrics.contentGap : 0;
        const contentHeight = Math.max(0, month.height - metrics.headerHeight - contentGap);
        const contentTop = month.top + metrics.headerHeight + contentGap;
        const firstVisibleRow = Math.max(
          0,
          Math.floor((scrollTop - contentTop) / (metrics.cardSize + metrics.rowGap)) - 2,
        );
        const lastVisibleRow = Math.min(
          month.rows,
          Math.ceil((scrollTop + viewportHeight - contentTop) / (metrics.cardSize + metrics.rowGap)) + 2,
        );
        const startCard = firstVisibleRow * metrics.columns;
        const endCard = Math.min(month.cardCount, Math.max(startCard, lastVisibleRow * metrics.columns));
        const cards = Array.from({ length: Math.max(0, endCard - startCard) }, (_, index) => {
          const cardIndex = startCard + index;
          return {
            cardIndex,
            card: (() => {
              const card = getMonthCard(month, cardIndex, groupMangaPosts, loadedEntriesByMonth.get(month.key) ?? []);
              if (!card.item && !groupMangaPosts) {
                card.dominantColor = snapshot.getPlaceholderColor?.(month.offset + cardIndex);
              }
              return card;
            })(),
          };
        });
        const loadedIds = cards.flatMap(({ card }) => card.items.map(entry => entry.item.image_id));
        const selectedCount = loadedIds.filter(imageId => selectedIds.has(imageId)).length;
        const isMonthSelected = loadedIds.length > 0 && selectedCount === loadedIds.length;

        return (
          <section
            key={month.key}
            id={`month-section-${month.key}`}
            className="gallery-month-section gallery-global-track__month"
            style={{ top: `${month.top}px`, height: `${month.height}px` }}
            data-global-month={month.key}
          >
            <div
              className="gallery-month-header flex items-center justify-between"
              style={{ height: `${metrics.headerHeight}px` }}
            >
              <div className="gallery-month-header__title flex items-center gap-2 text-xs font-bold">
                <Calendar className="gallery-month-header__icon w-4 h-4" aria-hidden="true" />
                <span>{month.label}</span>
              </div>
              <div className="gallery-month-header__actions">
                <span className="gallery-month-header__count gallery-month-header__count--full">
                  {t('gallery.monthWorks', { count: formatNumber(month.imageCount) })}
                </span>
                {isEditMode && (
                  <button
                    type="button"
                    className="gallery-month-select"
                    onClick={() => onSetSelection(loadedIds, !isMonthSelected)}
                    disabled={loadedIds.length === 0}
                    aria-pressed={isMonthSelected}
                  >
                    {isMonthSelected ? <CheckSquare aria-hidden="true" /> : <Square aria-hidden="true" />}
                    <span>{t(isMonthSelected ? 'gallery.deselectMonth' : 'gallery.selectMonth')}</span>
                  </button>
                )}
              </div>
            </div>
            <div
              className="gallery-global-track__grid-shell relative"
              style={{ height: `${contentHeight}px`, marginBlockStart: `${contentGap}px` }}
            >
              <div
                className="gallery-global-track__grid absolute inset-inline-0 grid"
                style={{
                  insetInline: '0px',
                  top: `${firstVisibleRow * (metrics.cardSize + metrics.rowGap)}px`,
                  gridTemplateColumns: `repeat(${metrics.columns}, minmax(0, 1fr))`,
                  gridAutoRows: `${metrics.cardSize}px`,
                  gap: `${metrics.rowGap}px`,
                }}
              >
                {cards.map(({ card, cardIndex }) => (
                  <GlobalCard
                    key={`${month.key}:${cardIndex}:${card.globalIndex ?? 'skeleton'}`}
                    card={card}
                    cardIndex={cardIndex}
                    month={month}
                    thumbnailSize={thumbnailSize}
                    groupMangaPosts={groupMangaPosts}
                    isEditMode={isEditMode}
                    selectedIds={selectedIds}
                    onSetSelection={onSetSelection}
                    onOpenFullscreen={onOpenFullscreen}
                    onPrefetchReader={onPrefetchReader}
                    onOpenWorkGroup={onOpenWorkGroup}
                    blurEnabled={blurEnabled}
                    demoMode={demoMode}
                    loadEnabled={navigationMode === 'idle'}
                    t={t}
                  />
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};
