import {
  DEFAULT_WEB_CONFIG,
  FullscreenPageLayout,
  FullscreenReadingDirection,
  FullscreenSpreadPairing,
  FullscreenZoomMode,
  ImageItem,
  UiLanguage,
  WebConfig,
} from '../types';
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from './sidebarLayout';
import { normalizeUiLanguage } from '../i18n';

type WebConfigInput = Record<string, unknown>;

const clampInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numericValue * 100) / 100));
};

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    return !['', '0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
};

export const normalizeDominantColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const color = value.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : undefined;
};

export const normalizeWebConfig = (value: unknown): WebConfig => {
  const source: WebConfigInput = (
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { ...(value as WebConfigInput) }
      : {}
  );
  if (source.videoMuted === undefined && source.fullscreenVideoMuted !== undefined) {
    source.videoMuted = source.fullscreenVideoMuted;
  }
  const legacyThumbnailSize = source.thumbnailWidth ?? source.thumbnailHeight;
  const fullscreenZoomModes: FullscreenZoomMode[] = ['auto', 'lock', 'width', 'height', 'fit', 'fill'];
  const fullscreenZoomMode = typeof source.fullscreenZoomMode === 'string'
    && fullscreenZoomModes.includes(source.fullscreenZoomMode as FullscreenZoomMode)
    ? source.fullscreenZoomMode as FullscreenZoomMode
    : DEFAULT_WEB_CONFIG.fullscreenZoomMode;
  const uiLanguage: UiLanguage = normalizeUiLanguage(source.uiLanguage);
  const fullscreenPageLayout: FullscreenPageLayout = source.fullscreenPageLayout === 'spread'
    ? 'spread'
    : DEFAULT_WEB_CONFIG.fullscreenPageLayout;
  const fullscreenReadingDirection: FullscreenReadingDirection = source.fullscreenReadingDirection === 'rtl'
    ? 'rtl'
    : DEFAULT_WEB_CONFIG.fullscreenReadingDirection;
  const fullscreenSpreadPairing: FullscreenSpreadPairing = source.fullscreenSpreadPairing === 'first-page'
    ? 'first-page'
    : DEFAULT_WEB_CONFIG.fullscreenSpreadPairing;

  const normalizedVideoVolume = clampNumber(
    source.videoVolume,
    DEFAULT_WEB_CONFIG.videoVolume,
    0,
    1,
  );
  const normalizedVideoMuted = source.videoMuted === undefined
    ? normalizedVideoVolume <= 0
    : toBoolean(source.videoMuted, DEFAULT_WEB_CONFIG.videoMuted);

  const normalizedConfig: WebConfig = {
    webTheme: source.webTheme === 'light' ? 'light' : DEFAULT_WEB_CONFIG.webTheme,
    uiLanguage,
    defaultViewMode: source.defaultViewMode === 'webtoon' ? 'webtoon' : 'fullscreen',
    thumbnailSize: clampInteger(source.thumbnailSize ?? legacyThumbnailSize, DEFAULT_WEB_CONFIG.thumbnailSize, 16, 4096),
    itemsPerPage: clampInteger(source.itemsPerPage, DEFAULT_WEB_CONFIG.itemsPerPage, 1, 5000),
    sidebarWidth: clampInteger(
      source.sidebarWidth,
      DEFAULT_WEB_CONFIG.sidebarWidth,
      SIDEBAR_MIN_WIDTH,
      SIDEBAR_MAX_WIDTH,
    ),
    autoOpenBrowser: toBoolean(source.autoOpenBrowser, DEFAULT_WEB_CONFIG.autoOpenBrowser),
    groupMangaPosts: toBoolean(source.groupMangaPosts, DEFAULT_WEB_CONFIG.groupMangaPosts),
    blurEnabled: toBoolean(
      source.blurEnabled ?? source.mosaicEnabled,
      DEFAULT_WEB_CONFIG.blurEnabled,
    ),
    demoMode: toBoolean(source.demoMode, DEFAULT_WEB_CONFIG.demoMode),
    preloadImageCount: clampInteger(source.preloadImageCount, DEFAULT_WEB_CONFIG.preloadImageCount, 0, 10),
    fullscreenToolbarSimpleMode: toBoolean(
      source.fullscreenToolbarSimpleMode,
      DEFAULT_WEB_CONFIG.fullscreenToolbarSimpleMode,
    ),
    fullscreenShowToolbar: toBoolean(
      source.fullscreenShowToolbar,
      DEFAULT_WEB_CONFIG.fullscreenShowToolbar,
    ),
    fullscreenShowThumbnails: toBoolean(
      source.fullscreenShowThumbnails,
      DEFAULT_WEB_CONFIG.fullscreenShowThumbnails,
    ),
    fullscreenShowCheckerboard: toBoolean(
      source.fullscreenShowCheckerboard,
      DEFAULT_WEB_CONFIG.fullscreenShowCheckerboard,
    ),
    fullscreenPageLayout,
    fullscreenReadingDirection,
    fullscreenSpreadPairing,
    fullscreenZoomMode,
    fullscreenVideoSeekSeconds: clampInteger(
      source.fullscreenVideoSeekSeconds,
      DEFAULT_WEB_CONFIG.fullscreenVideoSeekSeconds,
      1,
      60,
    ),
    fullscreenVideoHoldPlaybackRate: clampNumber(
      source.fullscreenVideoHoldPlaybackRate,
      DEFAULT_WEB_CONFIG.fullscreenVideoHoldPlaybackRate,
      1.25,
      4,
    ),
    videoMuted: normalizedVideoMuted,
    videoVolume: normalizedVideoVolume,
    videoAutoplay: toBoolean(
      source.videoAutoplay,
      DEFAULT_WEB_CONFIG.videoAutoplay,
    ),
    webtoonImageScale: clampInteger(
      source.webtoonImageScale,
      DEFAULT_WEB_CONFIG.webtoonImageScale,
      30,
      100,
    ),
    webtoonImageGap: clampInteger(
      source.webtoonImageGap,
      DEFAULT_WEB_CONFIG.webtoonImageGap,
      0,
      300,
    ),
    webtoonShowInfo: toBoolean(source.webtoonShowInfo, DEFAULT_WEB_CONFIG.webtoonShowInfo),
    webtoonShowPageNumber: toBoolean(
      source.webtoonShowPageNumber,
      DEFAULT_WEB_CONFIG.webtoonShowPageNumber,
    ),
    webtoonShowThumbnails: toBoolean(
      source.webtoonShowThumbnails,
      DEFAULT_WEB_CONFIG.webtoonShowThumbnails,
    ),
    analyzeColorsAfterLibraryUpdate: toBoolean(
      source.analyzeColorsAfterLibraryUpdate,
      DEFAULT_WEB_CONFIG.analyzeColorsAfterLibraryUpdate,
    ),
    manageThumbnailCache: toBoolean(source.manageThumbnailCache, DEFAULT_WEB_CONFIG.manageThumbnailCache),
    thumbnailCacheLimitMiB: clampInteger(
      source.thumbnailCacheLimitMiB,
      DEFAULT_WEB_CONFIG.thumbnailCacheLimitMiB,
      128,
      102400,
    ),
    librarySourceMode: source.librarySourceMode === 'pixiv' || source.librarySourceMode === 'folder'
      ? source.librarySourceMode
      : DEFAULT_WEB_CONFIG.librarySourceMode,
    mediaRootPath: typeof source.mediaRootPath === 'string' ? source.mediaRootPath : '',
    onboardingCompleted: toBoolean(source.onboardingCompleted, DEFAULT_WEB_CONFIG.onboardingCompleted),
  };

  if (source.pixivConfigPath !== undefined) {
    normalizedConfig.pixivConfigPath = String(source.pixivConfigPath);
  }

  return normalizedConfig;
};

export const buildThumbnailUrl = (
  item: ImageItem,
  thumbnailSize: number,
): string => {
  const params = new URLSearchParams({
    path: item.save_name || '',
    image_id: String(item.image_id),
    size: String(clampInteger(thumbnailSize, DEFAULT_WEB_CONFIG.thumbnailSize, 16, 4096)),
  });
  const sourceRevision = item.last_update_date || item.created_date;
  if (sourceRevision) params.set('revision', sourceRevision);

  return `/api/thumbnail?${params.toString()}`;
};
