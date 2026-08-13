import React from 'react';
import {
  AlignLeft,
  AlignRight,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Columns2,
  Expand,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  GalleryThumbnails,
  Grid2X2,
  BookOpen,
  Image as ImageIcon,
  Info,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  MoveHorizontal,
  MoveVertical,
  PanelTop,
  PanelTopDashed,
  Pause,
  Presentation,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scan,
  ScanSearch,
  ScrollText,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import {
  FullscreenPageLayout,
  FullscreenReadingDirection,
  FullscreenSpreadPairing,
  ImageItem,
  ViewerMode,
} from '../types';
import {
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  ViewerZoomMode,
} from '../hooks/useViewerTransform';
import { isVideoItem } from '../utils/media';
import { IconButton } from './ui/Button';

export interface ViewerToolbarZoomShortcut {
  mode: Exclude<ViewerZoomMode, 'custom'>;
  key: string;
  label: string;
}

export interface ViewerToolbarProps {
  currentItem: ImageItem;
  counterLabel: string;
  currentIndex: number;
  imageCount: number;
  activeMode: ViewerMode;
  readerVariant?: 'fullscreen' | 'spread';
  fullscreenPageLayout?: FullscreenPageLayout;
  allowSpreadLayout?: boolean;
  fullscreenReadingDirection?: FullscreenReadingDirection;
  fullscreenSpreadPairing?: FullscreenSpreadPairing;
  simpleToolbar: boolean;
  isMediaLoading: boolean;
  showToolbar: boolean;
  showFilmstrip: boolean;
  showShortcutHelp: boolean;
  isMobileToolbarOpen: boolean;
  showDetails: boolean;
  hasTransformableMedia: boolean;
  zoomMode: ViewerZoomMode;
  effectiveZoomPercent: number;
  zoomShortcuts: readonly ViewerToolbarZoomShortcut[];
  flipHorizontal: boolean;
  flipVertical: boolean;
  checkerboardEnabled: boolean;
  isBrowserFullscreen: boolean;
  isSlideshowPlaying: boolean;
  groupMangaPosts: boolean;
  blurEnabled: boolean;
  mobileToolbarToggleRef: React.RefObject<HTMLButtonElement>;
  mobileToolbarMenuRef: React.RefObject<HTMLDivElement>;
  toolbarRestoreButtonRef: React.RefObject<HTMLButtonElement>;
  onToggleMobileToolbar: () => void;
  onToggleDetails: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onChangeMode: (mode: ViewerMode) => void;
  onPageLayoutChange?: (layout: FullscreenPageLayout) => void;
  onReadingDirectionChange?: (direction: FullscreenReadingDirection) => void;
  onSpreadPairingChange?: (pairing: FullscreenSpreadPairing) => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onShowActualSize: () => void;
  onFitToViewer: () => void;
  onApplyZoomMode: (mode: Exclude<ViewerZoomMode, 'custom'>) => void;
  onRotate: (degrees: number) => void;
  onToggleFlipHorizontal: () => void;
  onToggleFlipVertical: () => void;
  onReloadMedia: () => void;
  onToggleCheckerboard: () => void;
  onToggleBrowserFullscreen: () => void;
  onToggleSlideshow: () => void;
  onHideToolbar: () => void;
  onToggleFilmstrip: () => void;
  onToggleGroupMangaPosts?: () => void;
  onToggleBlur?: () => void;
  onToggleShortcutHelp: () => void;
  onSimpleToolbarChange?: (simpleMode: boolean) => void;
  showTransformControls?: boolean;
  showZoomModes?: boolean;
  showDisplayControls?: boolean;
  showDetailsControl?: boolean;
  onDeleteCurrent?: (imageId: number) => void;
  onShowToolbarAgain: () => void;
  onClose: () => void;
}

const renderZoomModeIcon = (mode: Exclude<ViewerZoomMode, 'custom'>) => {
  const iconClassName = 'w-5 h-5';
  switch (mode) {
    case 'auto': return <ScanSearch className={iconClassName} aria-hidden="true" />;
    case 'lock': return <Lock className={iconClassName} aria-hidden="true" />;
    case 'width': return <MoveHorizontal className={iconClassName} aria-hidden="true" />;
    case 'height': return <MoveVertical className={iconClassName} aria-hidden="true" />;
    case 'fit': return <Minimize2 className={iconClassName} aria-hidden="true" />;
    case 'fill': return <Expand className={iconClassName} aria-hidden="true" />;
    default: return null;
  }
};

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
  currentItem,
  counterLabel,
  currentIndex,
  imageCount,
  activeMode,
  readerVariant = 'fullscreen',
  fullscreenPageLayout,
  allowSpreadLayout = true,
  fullscreenReadingDirection,
  fullscreenSpreadPairing,
  simpleToolbar,
  isMediaLoading,
  showToolbar,
  showFilmstrip,
  showShortcutHelp,
  isMobileToolbarOpen,
  showDetails,
  hasTransformableMedia,
  zoomMode,
  effectiveZoomPercent,
  zoomShortcuts,
  flipHorizontal,
  flipVertical,
  checkerboardEnabled,
  isBrowserFullscreen,
  isSlideshowPlaying,
  groupMangaPosts,
  blurEnabled,
  mobileToolbarToggleRef,
  mobileToolbarMenuRef,
  toolbarRestoreButtonRef,
  onToggleMobileToolbar,
  onToggleDetails,
  onPrevious,
  onNext,
  onChangeMode,
  onPageLayoutChange,
  onReadingDirectionChange,
  onSpreadPairingChange,
  onZoomOut,
  onZoomIn,
  onShowActualSize,
  onFitToViewer,
  onApplyZoomMode,
  onRotate,
  onToggleFlipHorizontal,
  onToggleFlipVertical,
  onReloadMedia,
  onToggleCheckerboard,
  onToggleBrowserFullscreen,
  onToggleSlideshow,
  onHideToolbar,
  onToggleFilmstrip,
  onToggleGroupMangaPosts,
  onToggleBlur,
  onToggleShortcutHelp,
  onSimpleToolbarChange,
  showTransformControls = true,
  showZoomModes = true,
  showDisplayControls = true,
  showDetailsControl = true,
  onDeleteCurrent,
  onShowToolbarAgain,
  onClose,
}) => {
  const { t, formatNumber } = useI18n();
  const isSpreadReader = readerVariant === 'spread';
  const currentItemIsVideo = isVideoItem(currentItem);
  const detailsActionLabel = showDetails
    ? t(currentItemIsVideo ? 'viewer.hideVideoDetails' : 'viewer.hideDetails')
    : t(currentItemIsVideo ? 'viewer.showVideoDetails' : 'viewer.showDetails');
  const closeDetailsLabel = currentItemIsVideo ? t('viewer.closeVideoDetails') : t('viewer.closeDetails');
  const showContentControls = showDetailsControl
    || (!simpleToolbar && Boolean(onToggleGroupMangaPosts || onToggleBlur));

  return (
    <div className={`fullscreen-viewer__topbar${showToolbar ? '' : ' is-toolbar-hidden'}`}>
      <div className="fullscreen-viewer__topbar-group">
        <span className="fullscreen-viewer__counter">{counterLabel}</span>
        <h3 className="fullscreen-viewer__title" title={currentItem.title || t('viewer.untitled')}>
          {currentItem.title || t('viewer.untitled')}
        </h3>
        {currentItem.media_status && (
          <span className="fullscreen-viewer__status" title={currentItem.media_error}>
            ⚠ {t('viewer.openIssue')}
          </span>
        )}
      </div>

      <div className="fullscreen-viewer__mobile-toolbar-toggle">
        <IconButton
          ref={mobileToolbarToggleRef}
          type="button"
          onClick={onToggleMobileToolbar}
          aria-expanded={isMobileToolbarOpen}
          aria-controls="fullscreen-mobile-toolbar"
          aria-label={t(isMobileToolbarOpen ? 'viewer.closeToolbar' : 'viewer.openToolbar')}
          variant={isMobileToolbarOpen ? 'primary' : 'ghost'}
          title={t(isMobileToolbarOpen ? 'viewer.closeToolbar' : 'viewer.openToolbar')}
        >
          <PanelTopDashed className="w-5 h-5" aria-hidden="true" />
        </IconButton>
      </div>

      {showDetailsControl && (
        <div className="fullscreen-viewer__mobile-details-toggle">
          <IconButton
            type="button"
            onClick={onToggleDetails}
            aria-label={detailsActionLabel}
            aria-pressed={showDetails}
            aria-controls="fullscreen-details-panel"
            variant={showDetails ? 'primary' : 'plain'}
            title={detailsActionLabel}
          >
            <Info className="w-5 h-5" aria-hidden="true" />
          </IconButton>
        </div>
      )}

      <div
        ref={mobileToolbarMenuRef}
        id="fullscreen-mobile-toolbar"
        role="region"
        aria-label={t('viewer.mobileToolbar')}
        className={`fullscreen-viewer__topbar-actions${simpleToolbar ? ' is-simple' : ''}${isMediaLoading ? ' is-media-loading' : ''}${isMobileToolbarOpen ? ' is-mobile-open' : ''}`}
      >
        <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--navigation fullscreen-viewer__toolbar-navigation" role="group" aria-label={t('viewer.navigation')}>
          <IconButton type="button" onClick={onPrevious} disabled={currentIndex <= 0} variant="ghost" aria-label={t('viewer.previousImage')} data-mobile-label={t('viewer.previousPage')} title={`${t('viewer.previousImage')} (← / J)`}>
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </IconButton>
          <IconButton type="button" onClick={onNext} disabled={currentIndex >= imageCount - 1} variant="ghost" aria-label={t('viewer.nextImage')} data-mobile-label={t('viewer.nextPage')} className="fullscreen-viewer__toolbar-next" title={`${t('viewer.nextImage')} (→ / K)`}>
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="fullscreen-viewer__toolbar-center">
          <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--mode fullscreen-viewer__mode-switcher" role="group" aria-label={t('viewer.readingMode')}>
            <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><Maximize2 className="h-4 w-4" /><span>{t('viewer.readingMode')}</span></span>
            <IconButton type="button" onClick={() => onChangeMode('fullscreen')} aria-pressed={activeMode === 'fullscreen'} variant={activeMode === 'fullscreen' ? 'primary' : 'ghost'} aria-label={t('viewer.singleView')} className="fullscreen-viewer__mode-button" data-mobile-label={t('viewer.singleMobileLabel')} title={t('viewer.singleView')}>
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            <IconButton type="button" onClick={() => onChangeMode('webtoon')} aria-pressed={activeMode === 'webtoon'} variant={activeMode === 'webtoon' ? 'primary' : 'ghost'} aria-label={t('viewer.webtoonView')} className="fullscreen-viewer__mode-button" data-mobile-label={t('viewer.webtoonMobileLabel')} title={t('viewer.webtoonView')}>
              <ScrollText className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </div>

          {fullscreenPageLayout && onPageLayoutChange && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--layout fullscreen-viewer__layout-switcher" role="group" aria-label={t('viewer.pageLayout')}>
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><BookOpen className="h-4 w-4" /><span>{t('viewer.pageLayout')}</span></span>
              <IconButton type="button" onClick={() => onPageLayoutChange('single')} aria-pressed={fullscreenPageLayout === 'single' || !allowSpreadLayout} variant={fullscreenPageLayout === 'single' || !allowSpreadLayout ? 'primary' : 'ghost'} aria-label={t('viewer.singlePage')} data-mobile-label={t('viewer.singlePage')} title={t('viewer.singlePage')}>
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
              </IconButton>
              {allowSpreadLayout && (
                <IconButton type="button" onClick={() => onPageLayoutChange('spread')} aria-pressed={fullscreenPageLayout === 'spread'} variant={fullscreenPageLayout === 'spread' ? 'primary' : 'ghost'} aria-label={t('viewer.spreadPage')} data-mobile-label={t('viewer.spreadPage')} title={t('viewer.spreadPage')}>
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              )}
            </div>
          )}

          {fullscreenReadingDirection && onReadingDirectionChange && fullscreenPageLayout !== 'single' && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--direction fullscreen-viewer__direction-switcher" role="group" aria-label={t('viewer.readingDirection')}>
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><AlignLeft className="h-4 w-4" /><span>{t('viewer.readingDirection')}</span></span>
              <IconButton type="button" onClick={() => onReadingDirectionChange('ltr')} aria-pressed={fullscreenReadingDirection === 'ltr'} variant={fullscreenReadingDirection === 'ltr' ? 'primary' : 'ghost'} aria-label={t('viewer.ltr')} data-mobile-label={t('viewer.ltr')} title={t('viewer.ltr')}>
                <AlignLeft className="h-4 w-4" aria-hidden="true" />
              </IconButton>
              <IconButton type="button" onClick={() => onReadingDirectionChange('rtl')} aria-pressed={fullscreenReadingDirection === 'rtl'} variant={fullscreenReadingDirection === 'rtl' ? 'primary' : 'ghost'} aria-label={t('viewer.rtl')} data-mobile-label={t('viewer.rtl')} title={t('viewer.rtl')}>
                <AlignRight className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </div>
          )}

          {isSpreadReader && fullscreenPageLayout === 'spread' && fullscreenSpreadPairing && onSpreadPairingChange && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--pairing" role="group" aria-label={t('viewer.spreadPairing')}>
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><Columns2 className="h-4 w-4" /><span>{t('viewer.spreadPairing')}</span></span>
              <IconButton
                type="button"
                onClick={() => onSpreadPairingChange(
                  fullscreenSpreadPairing === 'cover-single' ? 'first-page' : 'cover-single'
                )}
                aria-pressed={fullscreenSpreadPairing === 'first-page'}
                variant={fullscreenSpreadPairing === 'first-page' ? 'primary' : 'ghost'}
                aria-label={t('viewer.firstPagePairingToggle')}
                data-mobile-label={t(
                  fullscreenSpreadPairing === 'cover-single'
                    ? 'viewer.coverSinglePairing'
                    : 'viewer.firstPagePairing'
                )}
                title={t(
                  fullscreenSpreadPairing === 'cover-single'
                    ? 'viewer.switchToFirstPagePairing'
                    : 'viewer.switchToCoverSinglePairing'
                )}
              >
                <Columns2 className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </div>
          )}

          <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--zoom fullscreen-viewer__zoom-controls" role="group" aria-label={t('viewer.zoom')}>
            <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><ScanSearch className="h-4 w-4" /><span>{t('viewer.zoom')}</span></span>
            <IconButton type="button" onClick={onZoomOut} disabled={!hasTransformableMedia || effectiveZoomPercent <= MIN_ZOOM_PERCENT} variant="ghost" aria-label={t('viewer.zoomOut')} title={`${t('viewer.zoomOut')} (- / Num-)`}><Minus className="w-5 h-5" aria-hidden="true" /></IconButton>
            <span className="fullscreen-viewer__zoom-current" aria-live="polite" aria-atomic="true">{formatNumber(Math.round(effectiveZoomPercent))}%</span>
            <IconButton type="button" onClick={onZoomIn} disabled={!hasTransformableMedia || effectiveZoomPercent >= MAX_ZOOM_PERCENT} variant="ghost" aria-label={t('viewer.zoomIn')} title={`${t('viewer.zoomIn')} (+ / Num+)`}><Plus className="w-5 h-5" aria-hidden="true" /></IconButton>
            <IconButton type="button" onClick={onShowActualSize} disabled={!hasTransformableMedia} variant="ghost" aria-label={`${formatNumber(Math.round(effectiveZoomPercent))}%: ${t('viewer.originalSize')}`} className="fullscreen-viewer__zoom-value" data-mobile-label={t('viewer.originalSize')} title={`${t('viewer.originalSize')} (Ctrl + 0)`}><ScanSearch className="w-5 h-5" aria-hidden="true" /></IconButton>
            {simpleToolbar && <IconButton type="button" onClick={onFitToViewer} disabled={!hasTransformableMedia} aria-pressed={zoomMode === 'fit'} variant={zoomMode === 'fit' ? 'primary' : 'ghost'} aria-label={t('viewer.fitToWindow')} title={`${t('viewer.fitToWindow')} (Ctrl + M)`}><Scan className="w-5 h-5" aria-hidden="true" /></IconButton>}
          </div>

          {!simpleToolbar && showZoomModes && zoomShortcuts.length > 0 && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--zoom-modes fullscreen-viewer__zoom-modes" role="group" aria-label={t('viewer.zoomModes')}>
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><Scan className="h-4 w-4" /><span>{t('viewer.zoomModes')}</span></span>
              {zoomShortcuts.map(item => <IconButton key={item.mode} type="button" onClick={() => onApplyZoomMode(item.mode)} disabled={!hasTransformableMedia} aria-pressed={zoomMode === item.mode} aria-label={`${item.label}, ${t('viewer.shortcutKey')} ${item.key}`} variant={zoomMode === item.mode ? 'primary' : 'ghost'} title={`${item.key} / Num${item.key} · ${item.label}`}>{renderZoomModeIcon(item.mode)}</IconButton>)}
            </div>
          )}

          {!simpleToolbar && showTransformControls && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--transform" role="group" aria-label={t('viewer.orientation')}>
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><RotateCw className="h-4 w-4" /><span>{t('viewer.orientation')}</span></span>
              <IconButton type="button" onClick={() => onRotate(-90)} disabled={!hasTransformableMedia} aria-label={t('viewer.rotateLeft')} variant="ghost" title={`${t('viewer.rotateLeft')} (Ctrl + ←)`}><RotateCcw className="w-5 h-5" aria-hidden="true" /></IconButton>
              <IconButton type="button" onClick={() => onRotate(90)} disabled={!hasTransformableMedia} aria-label={t('viewer.rotateRight')} variant="ghost" title={`${t('viewer.rotateRight')} (Ctrl + →)`}><RotateCw className="w-5 h-5" aria-hidden="true" /></IconButton>
              <IconButton type="button" onClick={onToggleFlipHorizontal} disabled={!hasTransformableMedia} aria-pressed={flipHorizontal} aria-label={t('viewer.flipHorizontal')} variant={flipHorizontal ? 'primary' : 'ghost'} title={`${t('viewer.flipHorizontal')} (Ctrl + H)`}><FlipHorizontal2 className="w-5 h-5" aria-hidden="true" /></IconButton>
              <IconButton type="button" onClick={onToggleFlipVertical} disabled={!hasTransformableMedia} aria-pressed={flipVertical} aria-label={t('viewer.flipVertical')} variant={flipVertical ? 'primary' : 'ghost'} title={`${t('viewer.flipVertical')} (Ctrl + V)`}><FlipVertical2 className="w-5 h-5" aria-hidden="true" /></IconButton>
            </div>
          )}

          {!simpleToolbar && showDisplayControls && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--display" role="group" aria-label={t('viewer.viewFunctions')}>
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><GalleryThumbnails className="h-4 w-4" /><span>{t('viewer.viewFunctions')}</span></span>
              <IconButton type="button" onClick={onReloadMedia} aria-label={t('viewer.reloadImage')} variant="ghost" title={`${t('viewer.reloadImage')} (R)`}><RefreshCw className="w-5 h-5" aria-hidden="true" /></IconButton>
              <IconButton type="button" onClick={onToggleCheckerboard} aria-pressed={checkerboardEnabled} aria-label={t(checkerboardEnabled ? 'viewer.checkerboardOff' : 'viewer.checkerboardOn')} variant={checkerboardEnabled ? 'primary' : 'ghost'} title={`${t(checkerboardEnabled ? 'viewer.checkerboardOff' : 'viewer.checkerboardOn')} (B)`}><Grid2X2 className="w-5 h-5" aria-hidden="true" /></IconButton>
              <IconButton type="button" onClick={onToggleBrowserFullscreen} aria-pressed={isBrowserFullscreen} aria-label={t(isBrowserFullscreen ? 'viewer.browserFullscreenOff' : 'viewer.browserFullscreenOn')} variant={isBrowserFullscreen ? 'primary' : 'ghost'} title={`${t(isBrowserFullscreen ? 'viewer.browserFullscreenOff' : 'viewer.browserFullscreenOn')} (F)`}>{isBrowserFullscreen ? <Minimize2 className="w-5 h-5" aria-hidden="true" /> : <Maximize2 className="w-5 h-5" aria-hidden="true" />}</IconButton>
              {imageCount > 1 && <IconButton type="button" onClick={onToggleSlideshow} aria-pressed={isSlideshowPlaying} aria-label={t(isSlideshowPlaying ? 'viewer.pauseSlideshow' : 'viewer.startSlideshow')} variant={isSlideshowPlaying ? 'primary' : 'ghost'} title={`${t(isSlideshowPlaying ? 'viewer.pauseSlideshow' : 'viewer.startSlideshow')} (S)`}>{isSlideshowPlaying ? <Pause className="w-5 h-5" aria-hidden="true" /> : <Presentation className="w-5 h-5" aria-hidden="true" />}</IconButton>}
            </div>
          )}

          <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--visibility" role="group" aria-label={t('viewer.toolbarAndFilmstrip')}>
            <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><PanelTop className="h-4 w-4" /><span>{t('viewer.toolbarAndFilmstrip')}</span></span>
            <IconButton type="button" onClick={onHideToolbar} aria-pressed={showToolbar} aria-label={t('viewer.hideToolbar')} data-mobile-label={t('viewer.fullscreenToolbar')} variant={showToolbar ? 'primary' : 'ghost'} title={`${t('viewer.hideToolbar')} (T)`}><PanelTopDashed className="w-5 h-5" aria-hidden="true" /></IconButton>
            {imageCount > 1 && <IconButton type="button" onClick={onToggleFilmstrip} aria-pressed={showFilmstrip} aria-label={t(showFilmstrip ? 'viewer.hideFilmstrip' : 'viewer.showFilmstrip')} data-mobile-label={t('viewer.showFilmstrip')} variant={showFilmstrip ? 'primary' : 'ghost'} title={`${t(showFilmstrip ? 'viewer.hideFilmstrip' : 'viewer.showFilmstrip')} (G)`}><GalleryThumbnails className="w-5 h-5" aria-hidden="true" /></IconButton>}
          </div>

          {showContentControls && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--content" role="group" aria-label={t('viewer.contentSettings')}>
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><Layers className="h-4 w-4" /><span>{t('viewer.contentSettings')}</span></span>
              {!simpleToolbar && onToggleGroupMangaPosts && <IconButton type="button" onClick={onToggleGroupMangaPosts} aria-pressed={groupMangaPosts} aria-label={t(groupMangaPosts ? 'common.closeGroupMode' : 'common.openGroupMode')} data-mobile-label={t('common.groupMode')} variant={groupMangaPosts ? 'primary' : 'ghost'} title={t(groupMangaPosts ? 'common.closeGroupMode' : 'common.openGroupMode')}><Layers className="w-5 h-5" aria-hidden="true" /></IconButton>}
              {!simpleToolbar && onToggleBlur && <IconButton type="button" onClick={onToggleBlur} aria-pressed={blurEnabled} aria-label={t(blurEnabled ? 'common.closeBlur' : 'common.openBlur')} data-mobile-label={t('common.blur')} variant={blurEnabled ? 'primary' : 'ghost'} title={t(blurEnabled ? 'common.closeBlur' : 'common.openBlur')}>{blurEnabled ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}</IconButton>}
              {showDetailsControl && <IconButton type="button" onClick={onToggleDetails} aria-label={detailsActionLabel} aria-pressed={showDetails} aria-controls="fullscreen-details-panel" className="fullscreen-viewer__details-toolbar-button" data-mobile-label={detailsActionLabel} variant={showDetails ? 'primary' : 'ghost'} title={`${showDetails ? closeDetailsLabel : detailsActionLabel} (I)`}><Info className="w-5 h-5" aria-hidden="true" /></IconButton>}
            </div>
          )}
        </div>

        <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--settings fullscreen-viewer__toolbar-settings" role="group" aria-label={t('viewer.toolbarSettings')}>
          <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><Settings2 className="h-4 w-4" /><span>{t('viewer.toolbarSettings')}</span></span>
          <IconButton type="button" onClick={onToggleShortcutHelp} aria-label={t('viewer.showShortcutHelp')} aria-expanded={showShortcutHelp} aria-controls="fullscreen-shortcut-help" data-mobile-label={t('viewer.shortcutHelp')} variant={showShortcutHelp ? 'primary' : 'ghost'} title={`${t('viewer.shortcutHelp')} (F1)`}><CircleHelp className="w-5 h-5" aria-hidden="true" /></IconButton>
          {onSimpleToolbarChange && <IconButton type="button" onClick={() => onSimpleToolbarChange(!simpleToolbar)} aria-pressed={!simpleToolbar} aria-label={t(simpleToolbar ? 'viewer.expandToolbar' : 'viewer.simpleToolbar')} data-mobile-label={t(simpleToolbar ? 'viewer.expandToolbar' : 'viewer.simpleToolbar')} variant={!simpleToolbar ? 'primary' : 'ghost'} title={t(simpleToolbar ? 'viewer.expandToolbar' : 'viewer.simpleToolbar')}><Settings2 className="w-5 h-5" aria-hidden="true" /></IconButton>}
        </div>

        {onDeleteCurrent && <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--danger fullscreen-viewer__toolbar-danger" role="group" aria-label={t('viewer.deleteImage')}>
          <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true"><Trash2 className="h-4 w-4" /><span>{t('viewer.deleteImage')}</span></span>
          <IconButton type="button" onClick={() => onDeleteCurrent(currentItem.image_id)} aria-label={t('viewer.moveToRecycleBin')} data-mobile-label={t('viewer.deleteImage')} variant="danger" title={`${t('viewer.moveToRecycleBin')} (Delete)`}><Trash2 className="w-5 h-5" aria-hidden="true" /></IconButton>
        </div>}
      </div>

      {!showToolbar && <div className="fullscreen-viewer__hidden-toolbar-actions" role="group" aria-label={t('viewer.fullscreenToolbar')}>
        <IconButton ref={toolbarRestoreButtonRef} type="button" onClick={onShowToolbarAgain} aria-label={t('viewer.showToolbar')} variant="ghost" title={`${t('viewer.showToolbar')} (T)`}><PanelTopDashed className="w-5 h-5" aria-hidden="true" /></IconButton>
      </div>}

      <IconButton type="button" onClick={onClose} aria-label={t('viewer.close')} variant="ghost" className="fullscreen-viewer__close-button" title={`${t('viewer.close')} (Esc)`}>
        <X className="w-5 h-5" aria-hidden="true" />
      </IconButton>
    </div>
  );
};
