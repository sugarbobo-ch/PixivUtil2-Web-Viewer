import React from 'react';
import { imageLoadScheduler, ImagePriority, useImageLoadPermission } from '../utils/imageLoadScheduler';
import { DemoMediaBlock } from './DemoMediaBlock';

interface GalleryThumbnailProps {
  src: string;
  alt: string;
  priority: ImagePriority;
  loadEnabled?: boolean;
  blurEnabled: boolean;
  demoMode: boolean;
  dominantColor?: string;
}

export const GalleryThumbnail: React.FC<GalleryThumbnailProps> = ({
  src,
  alt,
  priority,
  loadEnabled = true,
  blurEnabled,
  demoMode,
  dominantColor,
}) => {
  const [retryToken, setRetryToken] = React.useState(0);
  const requestSrc = retryToken > 0
    ? `${src}${src.includes('?') ? '&' : '?'}thumbnail_retry=${retryToken}`
    : src;
  const [loadResult, setLoadResult] = React.useState<{
    src: string;
    state: 'loading' | 'loaded' | 'error';
  }>(() => ({ src, state: 'loading' }));
  // Derive the reset during render. A passive effect can run after a cached
  // image's onLoad event and incorrectly turn a completed thumbnail back into
  // a permanent loading skeleton during rapid sorting.
  const loadState = loadResult.src === requestSrc ? loadResult.state : 'loading';
  const admitted = useImageLoadPermission({
    url: requestSrc,
    priority,
    kind: 'thumbnail',
    owner: 'grid',
    enabled: loadEnabled && !demoMode,
  });
  const showCachedImage = !demoMode && !loadEnabled && imageLoadScheduler.isLoaded(requestSrc);
  const shouldRenderImage = admitted || showCachedImage;
  const validatedDominantColor = /^#[0-9A-Fa-f]{6}$/.test(dominantColor ?? '')
    ? dominantColor
    : undefined;
  const thumbnailStyle = validatedDominantColor
    ? { '--gallery-thumbnail-dominant': validatedDominantColor } as React.CSSProperties
    : undefined;

  React.useEffect(() => {
    setRetryToken(0);
  }, [src]);

  return (
    <div className={`gallery-thumbnail${loadState === 'loaded' ? ' is-ready' : ''}`} style={thumbnailStyle}>
      {demoMode ? (
        <DemoMediaBlock dominantColor={dominantColor} className="gallery-thumbnail__demo-block" />
      ) : (
        <>
          {loadState !== 'loaded' && (
            <div className="gallery-thumbnail__skeleton" aria-hidden="true" />
          )}
          {shouldRenderImage && (
            <img
              key={requestSrc}
              src={requestSrc}
              alt={alt}
              draggable={false}
              // Rendering this element means the scheduler has already
              // admitted it. Native lazy loading here can occupy a scheduler
              // slot without starting the request and starve newly visible
              // thumbnails after rapid sorting or scrolling.
              loading="eager"
              decoding="async"
              {...{ fetchpriority: priority <= 1 ? 'high' : 'low' }}
              onLoad={() => {
                imageLoadScheduler.markLoaded(requestSrc);
                setLoadResult({ src: requestSrc, state: 'loaded' });
              }}
              onError={() => {
                imageLoadScheduler.markFinished(requestSrc, false);
                if (retryToken === 0) {
                  setRetryToken(1);
                  setLoadResult({ src: requestSrc, state: 'loading' });
                  return;
                }
                setLoadResult({ src: requestSrc, state: 'error' });
              }}
              className={`gallery-thumbnail__image w-full h-full object-cover ${loadState === 'loaded' ? 'is-loaded' : ''} ${blurEnabled ? 'blur-media blur-media--thumbnail' : 'transition-transform duration-300 group-hover:scale-105'}`}
            />
          )}
          {loadState === 'error' && (
            <span className="gallery-thumbnail__error" aria-hidden="true">縮圖載入失敗</span>
          )}
        </>
      )}
    </div>
  );
};
