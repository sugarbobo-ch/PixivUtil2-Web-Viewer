import { useCallback, useEffect, useState } from 'react';
import {
  ImagePriority,
  imageLoadScheduler,
  useImageLoadPermission,
} from '../utils/imageLoadScheduler';

interface UseViewerMediaAdmissionOptions {
  thumbnailUrl: string;
  mediaUrl: string;
  thumbnailEnabled: boolean;
  originalEnabled: boolean;
  thumbnailPriority: ImagePriority;
  originalPriority: ImagePriority;
  owner: 'fullscreen' | 'webtoon';
}

/**
 * Keeps admission and ready/error state for the two-stage viewer media path.
 * The component still owns aspect ratio and display transitions; this hook
 * only owns request admission and the lifecycle that belongs to the URLs.
 */
export const useViewerMediaAdmission = ({
  thumbnailUrl,
  mediaUrl,
  thumbnailEnabled,
  originalEnabled,
  thumbnailPriority,
  originalPriority,
  owner,
}: UseViewerMediaAdmissionOptions) => {
  const [thumbnailReady, setThumbnailReady] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [originalReady, setOriginalReady] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);

  const thumbnailAdmitted = useImageLoadPermission({
    url: thumbnailUrl,
    priority: thumbnailPriority,
    kind: 'thumbnail',
    owner,
    enabled: thumbnailEnabled,
  });
  const originalAdmitted = useImageLoadPermission({
    url: mediaUrl,
    priority: originalPriority,
    kind: 'original',
    owner,
    enabled: originalEnabled,
  });

  useEffect(() => {
    setThumbnailReady(false);
    setThumbnailFailed(false);
    setOriginalReady(false);
    setOriginalFailed(false);
  }, [mediaUrl, thumbnailUrl]);

  const markThumbnailLoaded = useCallback(() => {
    imageLoadScheduler.markLoaded(thumbnailUrl);
    setThumbnailReady(true);
    setThumbnailFailed(false);
  }, [thumbnailUrl]);

  const markThumbnailError = useCallback(() => {
    imageLoadScheduler.markFinished(thumbnailUrl, false);
    setThumbnailFailed(true);
  }, [thumbnailUrl]);

  const markOriginalLoaded = useCallback(() => {
    imageLoadScheduler.markLoaded(mediaUrl);
    setOriginalReady(true);
    setOriginalFailed(false);
  }, [mediaUrl]);

  const markOriginalError = useCallback(() => {
    imageLoadScheduler.markFinished(mediaUrl, false);
    setOriginalFailed(true);
  }, [mediaUrl]);

  return {
    thumbnailAdmitted,
    originalAdmitted,
    thumbnailReady,
    thumbnailFailed,
    originalReady,
    originalFailed,
    markThumbnailLoaded,
    markThumbnailError,
    markOriginalLoaded,
    markOriginalError,
  };
};
