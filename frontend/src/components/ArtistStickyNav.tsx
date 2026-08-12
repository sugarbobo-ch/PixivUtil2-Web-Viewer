import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, Check, ExternalLink, FilterX, List, MoreHorizontal, Pencil, RefreshCw, Settings2 } from 'lucide-react';
import { Artist, SortMode } from '../types';
import { fetchArtistSourceLinks } from '../utils/sourceLinks';
import { getArtistScopeKey } from '../utils/artistIdentity';
import {
  readCssCustomProperties,
  useAnchoredPopover,
  type AnchoredPopoverElementRef,
  type FloatingCustomProperties,
} from '../utils/useAnchoredPopover';
import { Button, IconButton } from './ui/Button';

interface GallerySortOption {
  value: SortMode;
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
  sortMode?: SortMode;
  sortOptions?: readonly GallerySortOption[];
  onSortModeChange?: (mode: SortMode) => void;
  itemsPerPage?: number;
  itemsPerPageOptions?: readonly GalleryItemsPerPageOption[];
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  onPageChange?: (page: number) => void;
  boundaryRef?: AnchoredPopoverElementRef;
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
  boundaryRef,
}) => {
  const artistFolderKey = artist ? getArtistScopeKey(artist) : null;
  const [artistSources, setArtistSources] = useState<Awaited<ReturnType<typeof fetchArtistSourceLinks>>>(null);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [optionsMenuVariables, setOptionsMenuVariables] = useState<Record<`--${string}`, string>>({});
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsTriggerRef = useRef<HTMLButtonElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const { position: optionsMenuPosition, verticalPlacement: optionsMenuPlacement } = useAnchoredPopover({
    open: isOptionsOpen,
    anchorRef: optionsTriggerRef,
    contentRef: optionsMenuRef,
    boundaryRef,
    placement: 'end',
  });

  useEffect(() => {
    let cancelled = false;
    setArtistSources(null);

    if (!artist || artist.member_id <= 0 || artist.identity_status !== 'verified') return undefined;

    fetchArtistSourceLinks(artistFolderKey || artist.member_id).then(sources => {
      if (!cancelled) setArtistSources(sources);
    });

    return () => {
      cancelled = true;
    };
  }, [artist?.identity_status, artist?.member_id, artistFolderKey]);

  useEffect(() => {
    setIsOptionsOpen(false);
  }, [artistFolderKey]);

  useLayoutEffect(() => {
    if (!isOptionsOpen || !optionsTriggerRef.current) {
      setOptionsMenuVariables({});
      return;
    }

    // The menu is portaled outside the gallery scope. Carry the resolved
    // viewer button roles so its nested action items keep the same surface.
    setOptionsMenuVariables(readCssCustomProperties(optionsTriggerRef.current, ['--ui-button-']));
  }, [isOptionsOpen]);

  const closeOptionsMenu = (restoreFocus: boolean) => {
    setIsOptionsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => optionsTriggerRef.current?.focus({ preventScroll: true }));
    }
  };

  useEffect(() => {
    if (!isOptionsOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (optionsRef.current?.contains(target) || optionsMenuRef.current?.contains(target)) return;
      setIsOptionsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOptionsMenu(true);
      }
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
  const hasDesktopArtistOptions = hasArtist && Boolean(onRequestUpdate || onOpenSettings || onClearArtist);
  const hasViewOptions = hasSortOptions || hasPageSizeOptions;
  const hasTailActions = Boolean(onToggleEditMode || (hasArtist && onClearArtist));
  const optionsMenuStyle: FloatingCustomProperties = {
    ...optionsMenuVariables,
    position: 'fixed',
    top: `${optionsMenuPosition?.top ?? 0}px`,
    left: `${optionsMenuPosition?.left ?? 0}px`,
    maxHeight: `${optionsMenuPosition?.maxHeight ?? 1}px`,
    visibility: optionsMenuPosition ? 'visible' : 'hidden',
    '--anchored-anchor-width': `${optionsMenuPosition?.anchorWidth ?? 0}px`,
  };

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
            className="ui-button artist-sticky-nav__artist-link"
            data-variant="secondary"
            data-size="md"
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
            className="ui-button artist-sticky-nav__platform-link"
            data-variant="secondary"
            data-size="md"
            aria-label={`在 FANBOX 開啟 ${displayName}`}
            title={`在 FANBOX 開啟 ${displayName}`}
          >
            <span>FANBOX</span>
            <ExternalLink aria-hidden="true" />
          </a>
        )}
        {hasArtist && (isLoading || isUpdating) && (
          <span className="artist-sticky-nav__status" role="status" aria-live="polite">
            <RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? 'is-active' : ''}`} aria-hidden="true" />
            {isUpdating ? '背景更新中…' : '載入作品中…'}
          </span>
        )}
        {hasOptions && (
          <div className={`artist-sticky-nav__options${hasDesktopArtistOptions ? ' artist-sticky-nav__options--desktop' : ''}`} ref={optionsRef}>
            <IconButton
              type="button"
              ref={optionsTriggerRef}
              variant="ghost"
              size="md"
              className="artist-sticky-nav__options-trigger"
              onClick={() => setIsOptionsOpen(open => !open)}
              aria-label={hasArtist ? `開啟 ${displayName} 更多操作` : '開啟更多選項'}
              aria-haspopup="menu"
              aria-expanded={isOptionsOpen}
              aria-controls="artist-sticky-nav-options-menu"
              title="開啟更多選項"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">開啟更多選項</span>
            </IconButton>
            {isOptionsOpen && typeof document !== 'undefined' && createPortal(
              <div
                id="artist-sticky-nav-options-menu"
                ref={optionsMenuRef}
                className={`artist-sticky-nav__options-menu${hasDesktopArtistOptions ? ' artist-sticky-nav__options-menu--desktop' : ''}${optionsMenuPlacement === 'up' ? ' is-up' : ''}`}
                style={optionsMenuStyle}
                role="menu"
              >
                {hasArtistActions && (
                  <div className="artist-sticky-nav__options-group" role="group" aria-labelledby="artist-sticky-nav-artist-group-label">
                    <p id="artist-sticky-nav-artist-group-label" className="artist-sticky-nav__options-heading">繪師</p>
                    {hasArtist && onRequestUpdate && (
                      <Button
                        type="button"
                        role="menuitem"
                        variant="ghost"
                        size="md"
                        fullWidth
                        className="artist-sticky-nav__options-item"
                        onClick={() => {
                          setIsOptionsOpen(false);
                          onRequestUpdate();
                        }}
                        disabled={isUpdating}
                      >
                        <RefreshCw className={`h-4 w-4 ${isUpdating ? 'is-active' : ''}`} aria-hidden="true" />
                        <span className="artist-sticky-nav__options-item-label">{isUpdating ? '更新中…' : '更新作品資料'}</span>
                      </Button>
                    )}
                    {hasArtist && onOpenSettings && (
                      <Button
                        type="button"
                        role="menuitem"
                        variant="ghost"
                        size="md"
                        fullWidth
                        className="artist-sticky-nav__options-item"
                        onClick={() => {
                          setIsOptionsOpen(false);
                          onOpenSettings();
                        }}
                      >
                        <Settings2 className="h-4 w-4" aria-hidden="true" />
                        <span className="artist-sticky-nav__options-item-label">繪師設定</span>
                      </Button>
                    )}
                  </div>
                )}
                {hasArtistActions && (hasViewOptions || hasTailActions) && (
                  <div className="artist-sticky-nav__options-separator" role="separator" />
                )}
                {hasViewOptions && (
                  <div className="artist-sticky-nav__options-group artist-sticky-nav__options-group--view" role="group" aria-labelledby="artist-sticky-nav-view-group-label">
                    <p id="artist-sticky-nav-view-group-label" className="artist-sticky-nav__options-heading">瀏覽</p>
                    {hasSortOptions && (
                      <>
                        <p className="artist-sticky-nav__options-subheading">排序方式</p>
                        {sortOptions?.map(option => (
                          <Button
                            key={option.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={option.value === sortMode}
                            variant={option.value === sortMode ? 'primary' : 'ghost'}
                            size="md"
                            fullWidth
                            className="artist-sticky-nav__options-item"
                            title={option.description}
                            onClick={() => {
                              setIsOptionsOpen(false);
                              onSortModeChange?.(option.value);
                            }}
                          >
                            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                            <span className="artist-sticky-nav__options-item-label">{option.label}</span>
                            <Check className="artist-sticky-nav__options-item-check" aria-hidden="true" />
                          </Button>
                        ))}
                      </>
                    )}
                    {hasPageSizeOptions && (
                      <>
                        <p className="artist-sticky-nav__options-subheading">每頁顯示</p>
                        {itemsPerPageOptions?.map(option => (
                          <Button
                            key={option.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={option.value === itemsPerPage}
                            variant={option.value === itemsPerPage ? 'primary' : 'ghost'}
                            size="md"
                            fullWidth
                            className="artist-sticky-nav__options-item"
                            onClick={() => {
                              setIsOptionsOpen(false);
                              onItemsPerPageChange?.(option.value);
                              onPageChange?.(1);
                            }}
                          >
                            <List className="h-4 w-4" aria-hidden="true" />
                            <span className="artist-sticky-nav__options-item-label">{option.label}</span>
                            <Check className="artist-sticky-nav__options-item-check" aria-hidden="true" />
                          </Button>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {hasViewOptions && hasTailActions && (
                  <div className="artist-sticky-nav__options-separator artist-sticky-nav__options-separator--view" role="separator" />
                )}
                {hasTailActions && (
                  <div className="artist-sticky-nav__options-group artist-sticky-nav__options-group--actions" role="group" aria-labelledby="artist-sticky-nav-actions-group-label">
                    <p id="artist-sticky-nav-actions-group-label" className="artist-sticky-nav__options-heading">操作</p>
                    {onToggleEditMode && (
                      <Button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={isEditMode}
                        variant={isEditMode ? 'primary' : 'ghost'}
                        size="md"
                        fullWidth
                        className="artist-sticky-nav__options-item artist-sticky-nav__options-item--edit-mode"
                        onClick={() => {
                          setIsOptionsOpen(false);
                          onToggleEditMode();
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        <span className="artist-sticky-nav__options-item-label">{isEditMode ? '結束編輯模式' : '編輯'}</span>
                      </Button>
                    )}
                    {hasArtist && onClearArtist && (
                      <Button
                        type="button"
                        role="menuitem"
                        variant="ghost"
                        size="md"
                        fullWidth
                        className="artist-sticky-nav__options-item"
                        onClick={() => {
                          setIsOptionsOpen(false);
                          onClearArtist();
                        }}
                      >
                        <FilterX className="h-4 w-4" aria-hidden="true" />
                        <span className="artist-sticky-nav__options-item-label">清除繪師篩選</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>,
              document.body,
            )}
          </div>
        )}
      </div>
    </nav>
  );
};
