import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpDown, Check, ChevronDown, ChevronUp, ExternalLink, FilterX, List, Pencil, RefreshCw, Settings2 } from 'lucide-react';
import { Artist } from '../types';
import { fetchArtistSourceLinks } from '../utils/sourceLinks';

type GallerySortMode = 'newest_month' | 'oldest_month' | 'oldest' | 'natural_name';

interface GallerySortOption {
  value: GallerySortMode;
  label: string;
  description?: string;
}

interface GalleryItemsPerPageOption {
  value: number;
  label: string;
}

interface ArtistStickyNavProps {
  artist: Artist | null;
  onClearArtist?: () => void;
  isLoading?: boolean;
  isUpdating?: boolean;
  onRequestUpdate?: () => void;
  onOpenSettings?: () => void;
  isEditMode?: boolean;
  onToggleEditMode?: () => void;
  sortMode?: GallerySortMode;
  sortOptions?: readonly GallerySortOption[];
  onSortModeChange?: (mode: GallerySortMode) => void;
  itemsPerPage?: number;
  itemsPerPageOptions?: readonly GalleryItemsPerPageOption[];
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  onPageChange?: (page: number) => void;
}

const removeMemberSuffix = (name: string, memberId: number) => {
  const suffixPattern = new RegExp(`\\s*(?:\\(|\\[)?${memberId}(?:\\)|\\])?\\s*$`);
  return name.replace(suffixPattern, '').trim();
};

const getArtistDisplayName = (artist: Artist) => {
  const sourceName = artist.name?.trim() || '';
  const cleanedName = removeMemberSuffix(sourceName, artist.member_id)
    .replace(/^(?:Discord\s+)?FANBOX\s+Archive\s+/i, '')
    .replace(/^FANBOX\s+/i, '')
    .replace(/\s*(?:\(|\[)?\d{3,}(?:\)|\])?\s*$/, '')
    .trim();

  return cleanedName || `繪師 ${artist.member_id}`;
};

export const ArtistStickyNav: React.FC<ArtistStickyNavProps> = ({
  artist,
  onClearArtist,
  isLoading = false,
  isUpdating = false,
  onRequestUpdate,
  onOpenSettings,
  isEditMode = false,
  onToggleEditMode,
  sortMode,
  sortOptions,
  onSortModeChange,
  itemsPerPage,
  itemsPerPageOptions,
  onItemsPerPageChange,
  onPageChange,
}) => {
  const [artistSources, setArtistSources] = useState<Awaited<ReturnType<typeof fetchArtistSourceLinks>>>(null);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [optionsMenuPlacement, setOptionsMenuPlacement] = useState<'down' | 'up'>('down');
  const [optionsMenuMaxHeight, setOptionsMenuMaxHeight] = useState<number | null>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsTriggerRef = useRef<HTMLButtonElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setArtistSources(null);

    if (!artist || artist.member_id <= 0) return undefined;

    fetchArtistSourceLinks(artist.member_id).then(sources => {
      if (!cancelled) setArtistSources(sources);
    });

    return () => {
      cancelled = true;
    };
  }, [artist?.member_id]);

  useEffect(() => {
    setIsOptionsOpen(false);
  }, [artist?.member_id]);

  useEffect(() => {
    if (!isOptionsOpen) {
      setOptionsMenuPlacement('down');
      setOptionsMenuMaxHeight(null);
    }
  }, [isOptionsOpen]);

  useLayoutEffect(() => {
    if (!isOptionsOpen) return undefined;

    const updateMenuPlacement = () => {
      const trigger = optionsTriggerRef.current;
      const menu = optionsMenuRef.current;
      if (!trigger || !menu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const availableBelow = Math.max(1, window.innerHeight - triggerRect.bottom - 8);
      const availableAbove = Math.max(1, triggerRect.top - 8);
      const contentHeight = menu.scrollHeight;
      const shouldOpenUp = contentHeight > availableBelow && availableAbove > availableBelow;
      const availableHeight = shouldOpenUp ? availableAbove : availableBelow;
      const nextPlacement = shouldOpenUp ? 'up' : 'down';

      setOptionsMenuPlacement(current => current === nextPlacement ? current : nextPlacement);
      setOptionsMenuMaxHeight(current => current === availableHeight ? current : availableHeight);
    };

    const frameId = window.requestAnimationFrame(updateMenuPlacement);
    window.addEventListener('resize', updateMenuPlacement);
    window.addEventListener('scroll', updateMenuPlacement, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateMenuPlacement);
      window.removeEventListener('scroll', updateMenuPlacement, true);
    };
  }, [isOptionsOpen, itemsPerPage, sortMode]);

  useEffect(() => {
    if (!isOptionsOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!optionsRef.current?.contains(event.target as Node)) {
        setIsOptionsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOptionsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOptionsOpen]);

  const hasArtist = Boolean(artist && artist.member_id > 0);
  const displayName = artist && artist.member_id > 0
    ? getArtistDisplayName(artist)
    : '全部繪師';
  const verifiedMemberId = artistSources?.verified_member_id;
  const pixivUrl = artistSources?.pixiv?.url
    ?? (verifiedMemberId ? `https://www.pixiv.net/users/${verifiedMemberId}` : null);
  const fanboxUrl = artistSources?.fanbox?.url ?? null;
  const hasSortOptions = Boolean(sortMode && sortOptions?.length && onSortModeChange);
  const hasPageSizeOptions = Boolean(itemsPerPage !== undefined && itemsPerPageOptions?.length && onItemsPerPageChange);
  const hasOptions = Boolean(onRequestUpdate || onOpenSettings || onToggleEditMode || onClearArtist || hasSortOptions || hasPageSizeOptions);
  const hasArtistActions = hasArtist && Boolean(onRequestUpdate || onOpenSettings);
  const hasViewOptions = hasSortOptions || hasPageSizeOptions;
  const hasTailActions = Boolean(onToggleEditMode || (hasArtist && onClearArtist));
  const OptionsIcon = isOptionsOpen ? ChevronUp : ChevronDown;

  return (
    <nav className="artist-sticky-nav" aria-label="目前繪師">
      <div
        className="artist-sticky-nav__current"
        role="group"
        aria-label={`目前繪師：${displayName}`}
      >
        {hasArtist && pixivUrl ? (
          <a
            href={pixivUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="artist-sticky-nav__artist-link"
            aria-label={`在 Pixiv 開啟 ${displayName} @${verifiedMemberId}`}
            title={`在 Pixiv 開啟 ${displayName}`}
          >
            <span className="artist-sticky-nav__name">{displayName}</span>
            <span className="artist-sticky-nav__id">@{verifiedMemberId}</span>
          </a>
        ) : (
          <span className="artist-sticky-nav__artist-link is-static" aria-label={`目前繪師：${displayName}`}>
            <span className="artist-sticky-nav__name">{displayName}</span>
            {verifiedMemberId && <span className="artist-sticky-nav__id">@{verifiedMemberId}</span>}
          </span>
        )}
        {hasArtist && fanboxUrl && (
          <a
            href={fanboxUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="artist-sticky-nav__platform-link"
            aria-label={`在 FANBOX 開啟 ${displayName}`}
            title={`在 FANBOX 開啟 ${displayName}`}
          >
            <span>FANBOX</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        {hasArtist && onClearArtist && (
          <button
            type="button"
            className="artist-sticky-nav__clear"
            onClick={onClearArtist}
            aria-label={`清除繪師篩選：${displayName}`}
            title="清除繪師篩選"
          >
            <FilterX className="h-5 w-5" aria-hidden="true" />
            <span>清除繪師篩選</span>
          </button>
        )}
        {hasArtist && (isLoading || isUpdating) && (
          <span className="artist-sticky-nav__status" role="status" aria-live="polite">
            <RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? 'is-active' : ''}`} aria-hidden="true" />
            {isUpdating ? '背景更新中…' : '載入作品中…'}
          </span>
        )}
        {hasArtist && onRequestUpdate && (
          <button
            type="button"
            className="artist-sticky-nav__manage artist-sticky-nav__manage--update"
            onClick={onRequestUpdate}
            disabled={isUpdating}
            aria-label={`更新 ${displayName} 的作品資料`}
            title="在背景更新圖片資料庫"
          >
            <RefreshCw className={`h-4 w-4 ${isUpdating ? 'is-active' : ''}`} aria-hidden="true" />
            <span>更新</span>
          </button>
        )}
        {hasArtist && onOpenSettings && (
          <button
            type="button"
            className="artist-sticky-nav__manage artist-sticky-nav__manage--settings"
            onClick={onOpenSettings}
            aria-label={`開啟 ${displayName} 設定`}
            title="繪師設定"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            <span>設定</span>
          </button>
        )}
        {hasOptions && (
          <div className="artist-sticky-nav__options" ref={optionsRef}>
            <button
              type="button"
              ref={optionsTriggerRef}
              className="artist-sticky-nav__options-trigger"
              onClick={() => setIsOptionsOpen(open => !open)}
              aria-label={hasArtist ? `開啟 ${displayName} 選單` : '開啟選項'}
              aria-haspopup="menu"
              aria-expanded={isOptionsOpen}
              aria-controls="artist-sticky-nav-options-menu"
              title="開啟選項"
            >
              <OptionsIcon className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">開啟選項</span>
            </button>
            {isOptionsOpen && (
              <div
                id="artist-sticky-nav-options-menu"
                ref={optionsMenuRef}
                className={`artist-sticky-nav__options-menu${optionsMenuPlacement === 'up' ? ' is-up' : ''}`}
                style={optionsMenuMaxHeight === null ? undefined : { maxHeight: `${optionsMenuMaxHeight}px` }}
                role="menu"
              >
                {hasArtistActions && (
                  <div className="artist-sticky-nav__options-group" role="group" aria-labelledby="artist-sticky-nav-artist-group-label">
                    <p id="artist-sticky-nav-artist-group-label" className="artist-sticky-nav__options-heading">繪師</p>
                    {hasArtist && onRequestUpdate && (
                      <button
                        type="button"
                        role="menuitem"
                        className="artist-sticky-nav__options-item"
                        onClick={() => {
                          setIsOptionsOpen(false);
                          onRequestUpdate();
                        }}
                        disabled={isUpdating}
                      >
                        <RefreshCw className={`h-4 w-4 ${isUpdating ? 'is-active' : ''}`} aria-hidden="true" />
                        <span className="artist-sticky-nav__options-item-label">{isUpdating ? '更新中…' : '更新作品資料'}</span>
                      </button>
                    )}
                    {hasArtist && onOpenSettings && (
                      <button
                        type="button"
                        role="menuitem"
                        className="artist-sticky-nav__options-item"
                        onClick={() => {
                          setIsOptionsOpen(false);
                          onOpenSettings();
                        }}
                      >
                        <Settings2 className="h-4 w-4" aria-hidden="true" />
                        <span className="artist-sticky-nav__options-item-label">繪師設定</span>
                      </button>
                    )}
                  </div>
                )}
                {hasArtistActions && (hasViewOptions || hasTailActions) && (
                  <div className="artist-sticky-nav__options-separator" role="separator" />
                )}
                {hasViewOptions && (
                  <div className="artist-sticky-nav__options-group" role="group" aria-labelledby="artist-sticky-nav-view-group-label">
                    <p id="artist-sticky-nav-view-group-label" className="artist-sticky-nav__options-heading">瀏覽</p>
                    {hasSortOptions && (
                      <>
                        <p className="artist-sticky-nav__options-subheading">排序方式</p>
                        {sortOptions?.map(option => (
                          <button
                            key={option.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={option.value === sortMode}
                            className={`artist-sticky-nav__options-item${option.value === sortMode ? ' is-selected' : ''}`}
                            title={option.description}
                            onClick={() => {
                              setIsOptionsOpen(false);
                              onSortModeChange?.(option.value);
                            }}
                          >
                            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                            <span className="artist-sticky-nav__options-item-label">{option.label}</span>
                            <Check className="artist-sticky-nav__options-item-check" aria-hidden="true" />
                          </button>
                        ))}
                      </>
                    )}
                    {hasPageSizeOptions && (
                      <>
                        <p className="artist-sticky-nav__options-subheading">每頁顯示</p>
                        {itemsPerPageOptions?.map(option => (
                          <button
                            key={option.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={option.value === itemsPerPage}
                            className={`artist-sticky-nav__options-item${option.value === itemsPerPage ? ' is-selected' : ''}`}
                            onClick={() => {
                              setIsOptionsOpen(false);
                              onItemsPerPageChange?.(option.value);
                              onPageChange?.(1);
                            }}
                          >
                            <List className="h-4 w-4" aria-hidden="true" />
                            <span className="artist-sticky-nav__options-item-label">{option.label}</span>
                            <Check className="artist-sticky-nav__options-item-check" aria-hidden="true" />
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {hasViewOptions && hasTailActions && (
                  <div className="artist-sticky-nav__options-separator" role="separator" />
                )}
                {hasTailActions && (
                  <div className="artist-sticky-nav__options-group" role="group" aria-labelledby="artist-sticky-nav-actions-group-label">
                    <p id="artist-sticky-nav-actions-group-label" className="artist-sticky-nav__options-heading">操作</p>
                    {onToggleEditMode && (
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={isEditMode}
                        className={`artist-sticky-nav__options-item${isEditMode ? ' is-active' : ''}`}
                        onClick={() => {
                          setIsOptionsOpen(false);
                          onToggleEditMode();
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        <span className="artist-sticky-nav__options-item-label">{isEditMode ? '結束編輯模式' : '編輯'}</span>
                      </button>
                    )}
                    {hasArtist && onClearArtist && (
                      <button
                        type="button"
                        role="menuitem"
                        className="artist-sticky-nav__options-item"
                        onClick={() => {
                          setIsOptionsOpen(false);
                          onClearArtist();
                        }}
                      >
                        <FilterX className="h-4 w-4" aria-hidden="true" />
                        <span className="artist-sticky-nav__options-item-label">清除繪師篩選</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};
