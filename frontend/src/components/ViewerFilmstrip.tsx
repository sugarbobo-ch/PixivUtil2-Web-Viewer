import React, { useRef } from 'react';
import { useI18n } from '../i18n';
import { ImageItem } from '../types';
import { buildThumbnailUrl } from '../utils/webConfig';
import { imageLoadScheduler, useImageLoadPermission } from '../utils/imageLoadScheduler';
import { FilmstripLayout } from '../utils/viewerLayout';
import { DemoMediaBlock } from './DemoMediaBlock';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';
import { Button } from './ui/Button';

interface FilmstripThumbnailProps {
  item: ImageItem;
  pageNumber: number;
  isNearCurrent: boolean;
  isVisible: boolean;
  thumbnailSize: number;
  blurEnabled: boolean;
  demoMode: boolean;
}

const FilmstripThumbnail = React.memo<FilmstripThumbnailProps>(({
  item,
  pageNumber,
  isNearCurrent,
  isVisible,
  thumbnailSize,
  blurEnabled,
  demoMode,
}) => {
  const { t, formatNumber } = useI18n();
  const url = buildThumbnailUrl(item, thumbnailSize);
  const loadEnabled = isNearCurrent || isVisible;
  const admitted = useImageLoadPermission({
    url,
    priority: 2,
    kind: 'thumbnail',
    owner: 'filmstrip',
    enabled: loadEnabled && !demoMode,
  });

  return (
    <span className="fullscreen-viewer__thumbnail-slot">
      {demoMode ? (
        <DemoMediaBlock dominantColor={item.dominant_color} />
      ) : admitted ? (
        <img
          src={url}
          alt={item.title || t('viewer.pageShortAlt', { page: formatNumber(pageNumber) })}
          loading="lazy"
          decoding="async"
          {...{ fetchpriority: 'low' }}
          onLoad={() => imageLoadScheduler.markLoaded(url)}
          onError={() => imageLoadScheduler.markFinished(url, false)}
          className={`fullscreen-viewer__thumbnail-image ${blurEnabled ? 'blur-media blur-media--filmstrip' : ''}`}
        />
      ) : (
        <span className="fullscreen-viewer__thumbnail-placeholder" aria-hidden="true" />
      )}
    </span>
  );
});

export interface ViewerFilmstripProps {
  images: ImageItem[];
  currentIndex: number;
  pageNumbers: number[];
  filmstripLayout: FilmstripLayout;
  filmstripStartIndex: number;
  filmstripEndIndex: number;
  filmstripLoadStart: number;
  filmstripLoadEnd: number;
  filmstripViewportWidth: number;
  filmstripItemSize: number;
  isFilmstripPositioned: boolean;
  filmstripScrollRef: React.RefObject<HTMLDivElement>;
  onFilmstripScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  onNavigate: (index: number) => void;
  activeIndexes?: readonly number[];
  thumbnailSize: number;
  blurEnabled: boolean;
  demoMode: boolean;
}

export const ViewerFilmstrip: React.FC<ViewerFilmstripProps> = ({
  images,
  currentIndex,
  pageNumbers,
  filmstripLayout,
  filmstripStartIndex,
  filmstripEndIndex,
  filmstripLoadStart,
  filmstripLoadEnd,
  filmstripViewportWidth,
  filmstripItemSize,
  isFilmstripPositioned,
  filmstripScrollRef,
  onFilmstripScroll,
  onNavigate,
  activeIndexes,
  thumbnailSize,
  blurEnabled,
  demoMode,
}) => {
  const { t, formatNumber } = useI18n();
  const resolvedActiveIndexes = activeIndexes ?? [currentIndex];
  const suppressTouchFocusRef = useRef(false);

  const handleThumbnailPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const isNarrowViewport = window.matchMedia?.('(max-width: 640px)').matches ?? false;
    if (event.pointerType === 'mouse' && !isNarrowViewport) return;
    suppressTouchFocusRef.current = true;
    event.currentTarget.blur();
    window.setTimeout(() => {
      suppressTouchFocusRef.current = false;
    }, 0);
  };

  const handleThumbnailFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    if (!suppressTouchFocusRef.current) return;
    suppressTouchFocusRef.current = false;
    event.currentTarget.blur();
  };

  const handleFilmstripWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return;

    const rawDelta = Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
    if (rawDelta === 0) return;

    const deltaMultiplier = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? event.currentTarget.clientWidth
        : 1;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.scrollLeft += rawDelta * deltaMultiplier;
  };

  return (
    <>
      <div className={`fullscreen-viewer__filmstrip${isFilmstripPositioned ? '' : ' is-positioning'}`}>
        <div
          ref={filmstripScrollRef}
          className="fullscreen-viewer__filmstrip-scroll"
          onScroll={onFilmstripScroll}
          onWheel={handleFilmstripWheel}
        >
          <div
            className="fullscreen-viewer__filmstrip-track"
            style={{
              width: `${Math.max(filmstripLayout.totalWidth, filmstripViewportWidth)}px`,
              height: `${filmstripItemSize}px`,
            }}
          >
            {images.slice(filmstripStartIndex, filmstripEndIndex).map((item, offset) => {
              const index = filmstripStartIndex + offset;
              const pageNumber = pageNumbers[index] ?? index + 1;
              const itemLeft = filmstripLayout.itemOffsets[index] ?? 0;
              const boundaryLeft = filmstripLayout.boundaryOffsets[index];
              const isActive = resolvedActiveIndexes.includes(index);
              const isVisible = itemLeft < filmstripLoadEnd
                && itemLeft + filmstripItemSize > filmstripLoadStart;
              const isCurrentAnchor = index === currentIndex;

              return (
                <React.Fragment key={item.image_id || index}>
                  {boundaryLeft !== null && boundaryLeft !== undefined && (
                    <div
                      className="fullscreen-viewer__boundary"
                      style={{ left: `${boundaryLeft}px` }}
                      title={t('viewer.workBoundary', { title: item.title || t('viewer.nextWork') })}
                    />
                  )}

                  <Button
                    type="button"
                    size="xs"
                    shape="card"
                    variant="secondary"
                    data-filmstrip-index={index}
                    onClick={() => onNavigate(index)}
                    onPointerDown={handleThumbnailPointerDown}
                    onFocus={handleThumbnailFocus}
                    aria-label={t('viewer.previewGroupPage', { page: formatNumber(pageNumber) })}
                    aria-current={isCurrentAnchor ? 'page' : undefined}
                    aria-pressed={isActive}
                    className={`fullscreen-viewer__thumbnail ${isActive ? 'is-active' : ''}`}
                    style={{ left: `${itemLeft}px` }}
                  >
                    {item.media_status ? (
                      <MediaIssuePlaceholder message={item.media_error} compact />
                    ) : (
                      <FilmstripThumbnail
                        item={item}
                        pageNumber={pageNumber}
                        isNearCurrent={Math.abs(index - currentIndex) <= 3}
                        isVisible={isVisible}
                        thumbnailSize={thumbnailSize}
                        blurEnabled={blurEnabled}
                        demoMode={demoMode}
                      />
                    )}
                    <span className="fullscreen-viewer__thumbnail-index">
                      {formatNumber(pageNumber)}
                    </span>
                  </Button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};
