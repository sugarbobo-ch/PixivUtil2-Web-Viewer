import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { ImageItem, VideoPreferencePatch } from '../types';

const VIDEO_CONTROLS_HIT_HEIGHT = 72;
const VIDEO_HOLD_DELAY_MS = 160;
const VIDEO_CENTER_ZONE_START = 0.35;
const VIDEO_CENTER_ZONE_END = 0.65;
const VIDEO_FEEDBACK_DURATION_MS = 700;
const VIDEO_FEEDBACK_EXIT_MS = 120;
const VIDEO_SINGLE_CLICK_DELAY_MS = 120;
const VIDEO_DOUBLE_CLICK_WINDOW_MS = 280;

export type VideoFeedbackKind = 'play' | 'pause' | 'rewind' | 'forward' | 'speed';
export type VideoFeedbackPhase = 'visible' | 'exiting';

export interface VideoFeedback {
  kind: VideoFeedbackKind;
  label: string;
  id: number;
}

export interface PreviousVideoDescriptor {
  url: string;
  style?: React.CSSProperties;
  isReady: boolean;
}

interface VideoHoldGesture {
  pointerId: number;
  video: HTMLVideoElement;
  previousPlaybackRate: number;
  activationTimer: number | null;
  isActive: boolean;
}

export interface UseViewerVideoOptions {
  currentItem?: ImageItem;
  currentItemIsVideo: boolean;
  currentMediaUrl: string;
  demoMode: boolean;
  showFilmstrip: boolean;
  showToolbar: boolean;
  shouldAutoplayVideo: boolean;
  videoMuted: boolean;
  videoVolume: number;
  videoSeekSeconds: number;
  videoHoldPlaybackRate: number;
  onVideoPreferenceChange?: (patch: VideoPreferencePatch) => void;
}

export interface UseViewerVideoResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  videoFrameRef: React.RefObject<HTMLDivElement>;
  outgoingVideoRef: React.RefObject<HTMLVideoElement>;
  videoNaturalSize: { width: number; height: number };
  videoNaturalSizeMediaUrl: string | null;
  videoDisplayStyle?: React.CSSProperties;
  isVideoReady: boolean;
  showOutgoingVideo: boolean;
  previousVideo: PreviousVideoDescriptor | null;
  videoFeedback: VideoFeedback | null;
  videoFeedbackPhase: VideoFeedbackPhase;
  toggleVideoPlayback: () => void;
  handleVideoLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  handleVideoLoadedData: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  handleVideoVolumeChange: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  handleVideoClick: (event: React.MouseEvent<HTMLElement>) => void;
  handleVideoPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  handleVideoPointerEnd: (event: React.PointerEvent<HTMLElement>) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getVideoInteractionRatio = (
  event: { clientX: number; clientY: number },
  video: HTMLVideoElement,
): number | null => {
  const bounds = video.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  if (
    event.clientX < bounds.left
    || event.clientX > bounds.right
    || event.clientY < bounds.top
    || event.clientY > bounds.bottom
  ) return null;

  const controlsHeight = Math.min(
    VIDEO_CONTROLS_HIT_HEIGHT,
    Math.max(48, bounds.height * 0.14),
  );
  if (event.clientY >= bounds.bottom - controlsHeight) return null;

  return clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
};

export const useViewerVideo = ({
  currentItem,
  currentItemIsVideo,
  currentMediaUrl,
  demoMode,
  showFilmstrip,
  showToolbar,
  shouldAutoplayVideo,
  videoMuted,
  videoVolume,
  videoSeekSeconds,
  videoHoldPlaybackRate,
  onVideoPreferenceChange,
}: UseViewerVideoOptions): UseViewerVideoResult => {
  const { t, formatNumber } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoFrameRef = useRef<HTMLDivElement>(null);
  const outgoingVideoRef = useRef<HTMLVideoElement>(null);
  const videoHoldGestureRef = useRef<VideoHoldGesture | null>(null);
  const videoFeedbackTimerRef = useRef<number | null>(null);
  const videoFeedbackSequenceRef = useRef(0);
  const videoSeekFeedbackRef = useRef<{ direction: -1 | 1; totalSeconds: number } | null>(null);
  const videoClickTimerRef = useRef<number | null>(null);
  const videoLastTapAtRef = useRef<number | null>(null);
  const videoClickPlaybackStateRef = useRef<boolean | null>(null);
  const suppressNextVideoClickRef = useRef(false);
  const previousVideoRef = useRef<PreviousVideoDescriptor | null>(null);
  const [videoNaturalSize, setVideoNaturalSize] = useState({ width: 0, height: 0 });
  const [videoNaturalSizeMediaUrl, setVideoNaturalSizeMediaUrl] = useState<string | null>(null);
  const [videoReadyMediaUrl, setVideoReadyMediaUrl] = useState<string | null>(null);
  const [videoFrameSize, setVideoFrameSize] = useState({ width: 0, height: 0 });
  const [videoFeedback, setVideoFeedback] = useState<VideoFeedback | null>(null);
  const [videoFeedbackPhase, setVideoFeedbackPhase] = useState<VideoFeedbackPhase>('visible');

  const videoDisplayStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (
      videoNaturalSizeMediaUrl !== currentMediaUrl
      || videoNaturalSize.width <= 0
      || videoNaturalSize.height <= 0
      || videoFrameSize.width <= 0
      || videoFrameSize.height <= 0
    ) return undefined;

    const scale = Math.min(
      videoFrameSize.width / videoNaturalSize.width,
      videoFrameSize.height / videoNaturalSize.height,
    );
    if (!Number.isFinite(scale) || scale <= 0) return undefined;

    return {
      width: videoNaturalSize.width * scale,
      height: videoNaturalSize.height * scale,
      maxWidth: 'none',
      maxHeight: 'none',
    };
  }, [currentMediaUrl, videoFrameSize.height, videoFrameSize.width, videoNaturalSize.height, videoNaturalSize.width, videoNaturalSizeMediaUrl]);

  const isVideoReady = videoReadyMediaUrl === currentMediaUrl;
  const previousVideo = previousVideoRef.current;
  const showOutgoingVideo = Boolean(
    currentItemIsVideo
    && !demoMode
    && !currentItem?.media_status
    && !isVideoReady
    && previousVideo
    && previousVideo.url !== currentMediaUrl
    && previousVideo.isReady,
  );

  useLayoutEffect(() => {
    const frame = videoFrameRef.current;
    if (!frame || !currentItemIsVideo || demoMode) {
      setVideoFrameSize({ width: 0, height: 0 });
      return undefined;
    }

    const updateFrameSize = () => {
      const nextSize = {
        width: frame.clientWidth,
        height: frame.clientHeight,
      };
      setVideoFrameSize(previous => (
        previous.width === nextSize.width && previous.height === nextSize.height
          ? previous
          : nextSize
      ));
    };

    updateFrameSize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateFrameSize);
    observer?.observe(frame);
    window.addEventListener('resize', updateFrameSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateFrameSize);
    };
  }, [currentItem?.image_id, currentItemIsVideo, demoMode, showFilmstrip, showToolbar]);

  useLayoutEffect(() => {
    if (currentItemIsVideo && !demoMode && !currentItem?.media_status && currentMediaUrl && isVideoReady) {
      previousVideoRef.current = {
        url: currentMediaUrl,
        style: videoDisplayStyle,
        isReady: isVideoReady,
      };
    } else if (!currentItemIsVideo || demoMode || currentItem?.media_status || !currentMediaUrl) {
      previousVideoRef.current = null;
    }
  }, [currentItem?.media_status, currentItemIsVideo, currentMediaUrl, demoMode, isVideoReady, videoDisplayStyle]);

  useLayoutEffect(() => {
    if (showOutgoingVideo) {
      outgoingVideoRef.current?.pause();
    }
  }, [currentMediaUrl, showOutgoingVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentItemIsVideo || demoMode) return;

    const shouldMuteVideo = videoMuted || videoVolume <= 0;
    if (video.muted !== shouldMuteVideo) video.muted = shouldMuteVideo;
    if (Math.abs(video.volume - videoVolume) > 0.001) video.volume = clamp(videoVolume, 0, 1);
  }, [currentItemIsVideo, currentMediaUrl, demoMode, isVideoReady, videoMuted, videoVolume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentItemIsVideo || demoMode || !isVideoReady) return;

    if (!shouldAutoplayVideo) {
      if (!video.paused) video.pause();
      return;
    }

    if ((video.paused || video.ended) && video.readyState >= 2) {
      try {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          void playPromise.catch(() => undefined);
        }
      } catch {
        // Browsers may reject unmuted autoplay before user interaction.
      }
    }
  }, [currentItemIsVideo, currentMediaUrl, demoMode, isVideoReady, shouldAutoplayVideo]);

  const showVideoFeedback = useCallback((
    feedback: Omit<VideoFeedback, 'id'>,
    options: { persist?: boolean } = {},
  ) => {
    if (videoFeedbackTimerRef.current !== null) {
      window.clearTimeout(videoFeedbackTimerRef.current);
    }
    if (feedback.kind !== 'rewind' && feedback.kind !== 'forward') {
      videoSeekFeedbackRef.current = null;
    }
    const id = videoFeedbackSequenceRef.current + 1;
    videoFeedbackSequenceRef.current = id;
    setVideoFeedbackPhase('visible');
    setVideoFeedback({ ...feedback, id });
    if (options.persist) {
      videoFeedbackTimerRef.current = null;
      return;
    }
    videoFeedbackTimerRef.current = window.setTimeout(() => {
      setVideoFeedbackPhase('exiting');
      videoFeedbackTimerRef.current = window.setTimeout(() => {
        setVideoFeedback(null);
        setVideoFeedbackPhase('visible');
        videoSeekFeedbackRef.current = null;
        videoFeedbackTimerRef.current = null;
      }, VIDEO_FEEDBACK_EXIT_MS);
    }, VIDEO_FEEDBACK_DURATION_MS - VIDEO_FEEDBACK_EXIT_MS);
  }, []);

  const clearVideoFeedback = useCallback(() => {
    if (videoFeedbackTimerRef.current !== null) {
      window.clearTimeout(videoFeedbackTimerRef.current);
      videoFeedbackTimerRef.current = null;
    }
    setVideoFeedback(null);
    setVideoFeedbackPhase('visible');
    videoSeekFeedbackRef.current = null;
  }, []);

  const clearVideoClick = useCallback(() => {
    if (videoClickTimerRef.current !== null) {
      window.clearTimeout(videoClickTimerRef.current);
      videoClickTimerRef.current = null;
    }
  }, []);

  const toggleVideoPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch(() => undefined);
      }
      showVideoFeedback({ kind: 'play', label: t('viewer.play') });
    } else {
      video.pause();
      showVideoFeedback({ kind: 'pause', label: t('viewer.pause') });
    }
  }, [showVideoFeedback, t]);

  const releaseVideoHold = useCallback((clearFeedback = true) => {
    const gesture = videoHoldGestureRef.current;
    if (!gesture) return;

    if (gesture.activationTimer !== null) {
      window.clearTimeout(gesture.activationTimer);
    }
    if (gesture.isActive) {
      gesture.video.playbackRate = gesture.previousPlaybackRate;
      if (clearFeedback) clearVideoFeedback();
    }
    videoHoldGestureRef.current = null;
  }, [clearVideoFeedback]);

  useEffect(() => {
    releaseVideoHold();
    clearVideoFeedback();
    clearVideoClick();
    videoLastTapAtRef.current = null;
    videoClickPlaybackStateRef.current = null;
    suppressNextVideoClickRef.current = false;
    setVideoNaturalSize({ width: 0, height: 0 });
    setVideoNaturalSizeMediaUrl(null);
    setVideoReadyMediaUrl(null);
  }, [clearVideoClick, clearVideoFeedback, currentItem?.image_id, currentItemIsVideo, currentMediaUrl, demoMode, releaseVideoHold]);

  useEffect(() => () => {
    releaseVideoHold(false);
  }, [releaseVideoHold]);

  useEffect(() => () => {
    if (videoFeedbackTimerRef.current !== null) {
      window.clearTimeout(videoFeedbackTimerRef.current);
    }
    clearVideoClick();
  }, [clearVideoClick]);

  const handleVideoLoadedMetadata = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    const shouldMuteVideo = videoMuted || videoVolume <= 0;
    if (video.muted !== shouldMuteVideo) video.muted = shouldMuteVideo;
    if (Math.abs(video.volume - videoVolume) > 0.001) video.volume = clamp(videoVolume, 0, 1);
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
    setVideoNaturalSize({ width: video.videoWidth, height: video.videoHeight });
    setVideoNaturalSizeMediaUrl(currentMediaUrl);
  }, [currentMediaUrl, videoMuted, videoVolume]);

  const handleVideoLoadedData = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      setVideoNaturalSize({ width: video.videoWidth, height: video.videoHeight });
      setVideoNaturalSizeMediaUrl(currentMediaUrl);
    }
    setVideoReadyMediaUrl(currentMediaUrl);
  }, [currentMediaUrl]);

  const handleVideoVolumeChange = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const volume = clamp(event.currentTarget.volume, 0, 1);
    const isMuted = event.currentTarget.muted || volume <= 0;
    onVideoPreferenceChange?.({
      videoMuted: isMuted,
      videoVolume: isMuted ? 0 : volume,
    });
  }, [onVideoPreferenceChange]);

  const seekVideo = useCallback((seconds: number, playbackWasPaused?: boolean | null) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const shouldRemainPaused = playbackWasPaused ?? (video.paused || video.ended);
    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    video.currentTime = clamp(currentTime + seconds, 0, video.duration);
    const direction: -1 | 1 = seconds < 0 ? -1 : 1;
    const previous = videoSeekFeedbackRef.current;
    const totalSeconds = previous?.direction === direction
      ? previous.totalSeconds + Math.abs(seconds)
      : Math.abs(seconds);
    videoSeekFeedbackRef.current = { direction, totalSeconds };
    showVideoFeedback({
      kind: direction < 0 ? 'rewind' : 'forward',
      label: t(direction < 0 ? 'viewer.rewindSeconds' : 'viewer.forwardSeconds', { seconds: formatNumber(totalSeconds) }),
    });
    if (shouldRemainPaused) {
      if (!video.paused) video.pause();
    } else if (video.paused || video.ended) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch(() => undefined);
      }
    }
  }, [formatNumber, showVideoFeedback, t]);

  const handleVideoClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const video = videoRef.current;
    if (!video) return;

    event.stopPropagation();
    if (suppressNextVideoClickRef.current) {
      suppressNextVideoClickRef.current = false;
      clearVideoClick();
      videoLastTapAtRef.current = null;
      videoClickPlaybackStateRef.current = null;
      return;
    }

    const ratio = getVideoInteractionRatio(event, video);
    if (ratio === null) {
      clearVideoClick();
      videoLastTapAtRef.current = null;
      videoClickPlaybackStateRef.current = null;
      return;
    }

    event.preventDefault();
    const now = Date.now();
    const previousTapAt = videoLastTapAtRef.current;
    const hasPreviousTap = previousTapAt !== null;
    const isWithinDoubleClickWindow = hasPreviousTap
      && now - previousTapAt <= VIDEO_DOUBLE_CLICK_WINDOW_MS;
    if (isWithinDoubleClickWindow) {
      clearVideoClick();
      const playbackWasPaused = hasPreviousTap
        ? videoClickPlaybackStateRef.current ?? (video.paused || video.ended)
        : (video.paused || video.ended);
      videoLastTapAtRef.current = null;
      videoClickPlaybackStateRef.current = null;
      seekVideo(ratio < 0.5 ? -videoSeekSeconds : videoSeekSeconds, playbackWasPaused);
      return;
    }

    if (previousTapAt === null || now - previousTapAt > VIDEO_DOUBLE_CLICK_WINDOW_MS) {
      videoClickPlaybackStateRef.current = null;
    }
    videoLastTapAtRef.current = now;
    videoClickPlaybackStateRef.current = video.paused || video.ended;
    clearVideoClick();
    videoClickTimerRef.current = window.setTimeout(() => {
      videoClickTimerRef.current = null;
      toggleVideoPlayback();
    }, VIDEO_SINGLE_CLICK_DELAY_MS);
  }, [clearVideoClick, seekVideo, toggleVideoPlayback, videoSeekSeconds]);

  const handleVideoPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const video = videoRef.current;
    if (!video) return;

    event.stopPropagation();
    if (event.button !== 0) return;

    clearVideoClick();
    const ratio = getVideoInteractionRatio(event, video);
    if (
      ratio === null
      || (ratio >= VIDEO_CENTER_ZONE_START && ratio <= VIDEO_CENTER_ZONE_END)
    ) return;

    releaseVideoHold();
    const gesture: VideoHoldGesture = {
      pointerId: event.pointerId,
      video,
      previousPlaybackRate: video.playbackRate,
      activationTimer: null,
      isActive: false,
    };
    videoHoldGestureRef.current = gesture;
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Some embedded browsers expose the method but reject capture on media.
      }
    }
    gesture.activationTimer = window.setTimeout(() => {
      if (videoHoldGestureRef.current !== gesture) return;
      gesture.isActive = true;
      videoLastTapAtRef.current = null;
      videoClickPlaybackStateRef.current = null;
      gesture.video.playbackRate = videoHoldPlaybackRate;
      showVideoFeedback(
        { kind: 'speed', label: t('viewer.speed', { rate: videoHoldPlaybackRate }) },
        { persist: true },
      );
      if (gesture.video.paused) {
        const playPromise = gesture.video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          void playPromise.catch(() => undefined);
        }
      }
    }, VIDEO_HOLD_DELAY_MS);
  }, [clearVideoClick, releaseVideoHold, showVideoFeedback, t, videoHoldPlaybackRate]);

  const handleVideoPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const gesture = videoHoldGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (gesture.isActive) {
      suppressNextVideoClickRef.current = true;
    }
    releaseVideoHold();
  }, [releaseVideoHold]);

  return {
    videoRef,
    videoFrameRef,
    outgoingVideoRef,
    videoNaturalSize,
    videoNaturalSizeMediaUrl,
    videoDisplayStyle,
    isVideoReady,
    showOutgoingVideo,
    previousVideo,
    videoFeedback,
    videoFeedbackPhase,
    toggleVideoPlayback,
    handleVideoLoadedMetadata,
    handleVideoLoadedData,
    handleVideoVolumeChange,
    handleVideoClick,
    handleVideoPointerDown,
    handleVideoPointerEnd,
  };
};
