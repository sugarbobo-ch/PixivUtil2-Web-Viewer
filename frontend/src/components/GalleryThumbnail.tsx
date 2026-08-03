import React from 'react';
import { imageLoadScheduler, ImagePriority, useImageLoadPermission } from '../utils/imageLoadScheduler';

interface GalleryThumbnailProps {
  src: string;
  alt: string;
  priority: ImagePriority;
  loadEnabled?: boolean;
  blurEnabled: boolean;
}

export const GalleryThumbnail: React.FC<GalleryThumbnailProps> = ({
  src,
  alt,
  priority,
  loadEnabled = true,
  blurEnabled,
}) => {
  const [loadState, setLoadState] = React.useState<'loading' | 'loaded' | 'error'>('loading');
  const admitted = useImageLoadPermission({
    url: src,
    priority,
    kind: 'thumbnail',
    owner: 'grid',
    enabled: loadEnabled,
  });
  const showCachedImage = !loadEnabled && imageLoadScheduler.isLoaded(src);
  const shouldRenderImage = admitted || showCachedImage;

  React.useEffect(() => {
    setLoadState('loading');
  }, [src]);

  return (
    <div className={`gallery-thumbnail${loadState === 'loaded' ? ' is-ready' : ''}`}>
      {loadState !== 'loaded' && (
        <div className="gallery-thumbnail__skeleton" aria-hidden="true" />
      )}
      {shouldRenderImage && (
        <img
          src={src}
          alt={alt}
          draggable={false}
          loading={priority <= 1 ? 'eager' : 'lazy'}
          decoding="async"
          {...{ fetchpriority: priority <= 1 ? 'high' : 'low' }}
          onLoad={() => {
            imageLoadScheduler.markLoaded(src);
            setLoadState('loaded');
          }}
          onError={() => {
            imageLoadScheduler.markFinished(src, false);
            setLoadState('error');
          }}
          className={`gallery-thumbnail__image w-full h-full object-cover ${loadState === 'loaded' ? 'is-loaded' : ''} ${blurEnabled ? 'blur-media blur-media--thumbnail' : 'transition-transform duration-300 group-hover:scale-105'}`}
        />
      )}
      {loadState === 'error' && (
        <span className="gallery-thumbnail__error" aria-hidden="true">縮圖載入失敗</span>
      )}
    </div>
  );
};
