import { DEFAULT_WEB_CONFIG, ImageItem, WebConfig } from '../types';

type WebConfigInput = Partial<WebConfig> & {
  // Legacy keys are accepted so existing web_config.json files migrate safely.
  thumbnailWidth?: unknown;
  thumbnailHeight?: unknown;
  mosaicEnabled?: unknown;
};

const clampInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
};

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value.toLowerCase() !== 'false';
  return Boolean(value);
};

export const normalizeDominantColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const color = value.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : undefined;
};

export const normalizeWebConfig = (value: WebConfigInput | null | undefined): WebConfig => {
  const source = value ?? {};
  const legacyThumbnailSize = source.thumbnailWidth ?? source.thumbnailHeight;

  const normalizedConfig: WebConfig = {
    webTheme: source.webTheme === 'light' ? 'light' : DEFAULT_WEB_CONFIG.webTheme,
    defaultViewMode: source.defaultViewMode === 'webtoon' ? 'webtoon' : 'fullscreen',
    thumbnailSize: clampInteger(source.thumbnailSize ?? legacyThumbnailSize, DEFAULT_WEB_CONFIG.thumbnailSize, 16, 4096),
    itemsPerPage: clampInteger(source.itemsPerPage, DEFAULT_WEB_CONFIG.itemsPerPage, 1, 5000),
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
    fullscreenShowThumbnails: toBoolean(
      source.fullscreenShowThumbnails,
      DEFAULT_WEB_CONFIG.fullscreenShowThumbnails,
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

  return `/api/thumbnail?${params.toString()}`;
};
