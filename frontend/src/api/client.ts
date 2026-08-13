import {
  Artist,
  HiddenArtist,
  LibraryJob,
  LibraryJobRequest,
  MonthItem,
  ThumbnailCacheRecoveryDetails,
  ThumbnailCacheStats,
  WebConfig,
} from '../types';
import {
  ApiObjectResponse,
  ConfigPathResponse,
  ImagePageResponse,
  LibrarySourceInspection,
  LibraryJobResponse,
  PixivConfigResponse,
  RecycleBinResponse,
  parseArtistsResponse,
  parseHiddenArtistsResponse,
  parseImagePageResponse,
  parseLibrarySourceInspection,
  parseLibraryJobResponse,
  parseMonthsResponse,
  parseObjectResponse,
  parseRecycleBinResponse,
  parseThumbnailCacheRecoveryDetailsResponse,
  parseThumbnailCacheRecycleResponse,
  parseThumbnailCacheRestoreResponse,
  parseThumbnailCacheStatsResponse,
  parseConfigPathResponse,
  parsePixivConfigResponse,
  parseWebConfigResponse,
  parseWebConfigUpdateResponse,
  ThumbnailCacheRecycleResponse,
  ThumbnailCacheRestoreResponse,
  WebConfigUpdateResponse,
} from './parsers';

export type ApiRequestOptions = Pick<RequestInit, 'signal' | 'cache'>;

export interface ThumbnailCacheEntriesQuery {
  offset?: number;
  limit?: number;
}

export type ApiErrorKind = 'http' | 'invalid-json';

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;
  readonly kind: ApiErrorKind;

  constructor(message: string, status: number, data: unknown, kind: ApiErrorKind, cause?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.kind = kind;
    if (cause !== undefined) Object.defineProperty(this, 'cause', { value: cause });
  }
}

export const isAbortError = (error: unknown): boolean => (
  (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
  || (error instanceof Error && error.name === 'AbortError')
);

const getErrorMessage = (data: unknown, status: number): string => {
  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === 'string' && record.detail) return record.detail;
    if (typeof record.message === 'string' && record.message) return record.message;
  }
  return `請求失敗（${status}）`;
};

const readJsonBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (!response.ok) return undefined;
    throw new ApiError('API 回應不是合法 JSON。', response.status, undefined, 'invalid-json', error);
  }
};

export const requestJson = async <T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  parse?: (value: unknown) => T,
): Promise<T> => {
  const response = await fetch(input, init);
  const data = await readJsonBody(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, response.status), response.status, data, 'http');
  }
  return parse ? parse(data) : data as T;
};

export const requestResponse = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const response = await fetch(input, init);
  if (!response.ok) {
    const data = await readJsonBody(response);
    throw new ApiError(getErrorMessage(data, response.status), response.status, data, 'http');
  }
  return response;
};

const withJsonBody = (body: unknown, options: ApiRequestOptions): RequestInit => ({
  ...options,
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const apiClient = {
  webConfig: {
    get: (options: ApiRequestOptions = {}): Promise<WebConfig> => requestJson(
      '/api/web-config',
      { cache: 'no-store', ...options },
      parseWebConfigResponse,
    ),
    update: (
      patch: Partial<WebConfig>,
      options: ApiRequestOptions = {},
    ): Promise<WebConfigUpdateResponse> => requestJson(
      '/api/web-config',
      withJsonBody(patch, options),
      parseWebConfigUpdateResponse,
    ),
  },
  libraryJobs: {
    current: (options: ApiRequestOptions = {}): Promise<LibraryJobResponse> => requestJson(
      '/api/library/jobs/current',
      { cache: 'no-store', ...options },
      parseLibraryJobResponse,
    ),
    get: (jobId: string, options: ApiRequestOptions = {}): Promise<LibraryJob> => requestJson(
      `/api/library/jobs/${encodeURIComponent(jobId)}`,
      { cache: 'no-store', ...options },
      value => {
        const response = parseLibraryJobResponse(value);
        if (!response.job) throw new Error('工作狀態不存在。');
        return response.job;
      },
    ),
    start: (
      request: LibraryJobRequest,
      options: ApiRequestOptions = {},
    ): Promise<LibraryJobResponse> => requestJson(
      '/api/library/jobs',
      withJsonBody(request, options),
      parseLibraryJobResponse,
    ),
    cancel: (jobId: string, options: ApiRequestOptions = {}): Promise<LibraryJobResponse> => requestJson(
      `/api/library/jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: 'POST', ...options },
      parseLibraryJobResponse,
    ),
  },
  images: {
    page: (query: string, options: ApiRequestOptions = {}): Promise<ImagePageResponse> => requestJson(
      `/api/images?${query}`,
      options,
      parseImagePageResponse,
    ),
    downloadZip: (
      imageIds: number[],
      items: Array<{ image_id: number; path: string }>,
      options: ApiRequestOptions = {},
    ): Promise<Response> => requestResponse(
      '/api/images/download-zip',
      withJsonBody({ image_ids: imageIds, items }, options),
    ),
    batchTrash: (
      imageIds: number[],
      items: Array<{ image_id: number; path: string }>,
      options: ApiRequestOptions = {},
    ): Promise<ApiObjectResponse> => requestJson(
      '/api/images/batch-trash',
      withJsonBody({ image_ids: imageIds, items }, options),
      parseObjectResponse,
    ),
  },
  directory: {
    artists: (options: ApiRequestOptions = {}): Promise<Artist[]> => requestJson(
      '/api/artists',
      { cache: 'no-store', ...options },
      parseArtistsResponse,
    ),
    months: (options: ApiRequestOptions = {}): Promise<MonthItem[]> => requestJson(
      '/api/months',
      { cache: 'no-store', ...options },
      parseMonthsResponse,
    ),
  },
  artists: {
    hidden: (options: ApiRequestOptions = {}): Promise<HiddenArtist[]> => requestJson(
      '/api/hidden-artists',
      { cache: 'no-store', ...options },
      parseHiddenArtistsResponse,
    ),
    hide: (artistKey: string | number, folderName: string, options: ApiRequestOptions = {}): Promise<ApiObjectResponse> => requestJson(
      `/api/artists/${encodeURIComponent(artistKey)}/hide`,
      withJsonBody({ folder_name: folderName }, options),
      parseObjectResponse,
    ),
    unhide: (artistKey: string | number, options: ApiRequestOptions = {}): Promise<ApiObjectResponse> => requestJson(
      `/api/artists/${encodeURIComponent(artistKey)}/unhide`,
      { method: 'POST', ...options },
      parseObjectResponse,
    ),
    trash: (artistKey: string | number, options: ApiRequestOptions = {}): Promise<ApiObjectResponse> => requestJson(
      `/api/artists/${encodeURIComponent(artistKey)}/trash`,
      { method: 'POST', ...options },
      parseObjectResponse,
    ),
    updateIdentity: (
      folderId: string,
      status: 'verified' | 'rejected' | 'inferred' | 'unknown',
      memberId?: number | null,
      fanboxId?: string | null,
      options: ApiRequestOptions = {},
    ): Promise<ApiObjectResponse> => requestJson(
      `/api/folders/${encodeURIComponent(folderId)}/identity`,
      {
        ...withJsonBody({
          status,
          ...(typeof memberId === 'number' && Number.isInteger(memberId) && memberId > 0 ? { member_id: memberId } : {}),
          ...(typeof fanboxId === 'string' ? { fanbox_id: fanboxId } : {}),
        }, options),
        method: 'PUT',
      },
      parseObjectResponse,
    ),
  },
  library: {
    inspectSource: (
      mode: 'pixiv' | 'folder',
      path: string,
      options: ApiRequestOptions = {},
    ): Promise<LibrarySourceInspection> => requestJson(
      '/api/library/source/inspect',
      withJsonBody({ mode, path }, options),
      parseLibrarySourceInspection,
    ),
    thumbnailCache: {
      stats: (options: ApiRequestOptions = {}): Promise<ThumbnailCacheStats> => requestJson(
        '/api/library/stats',
        { cache: 'no-store', ...options },
        parseThumbnailCacheStatsResponse,
      ),
      entries: (
        jobId: string,
        query: ThumbnailCacheEntriesQuery = {},
        options: ApiRequestOptions = {},
      ): Promise<ThumbnailCacheRecoveryDetails> => {
        const params = new URLSearchParams();
        if (query.offset !== undefined) params.set('offset', String(query.offset));
        if (query.limit !== undefined) params.set('limit', String(query.limit));
        const queryString = params.toString();
        return requestJson(
          `/api/library/cache/${encodeURIComponent(jobId)}/entries${queryString ? `?${queryString}` : ''}`,
          { cache: 'no-store', ...options },
          parseThumbnailCacheRecoveryDetailsResponse,
        );
      },
      restore: (
        jobId: string,
        options: ApiRequestOptions = {},
      ): Promise<ThumbnailCacheRestoreResponse> => requestJson(
        `/api/library/cache/${encodeURIComponent(jobId)}/restore`,
        { method: 'POST', ...options },
        parseThumbnailCacheRestoreResponse,
      ),
      recycle: (
        jobId: string,
        options: ApiRequestOptions = {},
      ): Promise<ThumbnailCacheRecycleResponse> => requestJson(
        `/api/library/cache/${encodeURIComponent(jobId)}`,
        { method: 'DELETE', ...options },
        parseThumbnailCacheRecycleResponse,
      ),
    },
  },
  pixivConfig: {
    get: (options: ApiRequestOptions = {}): Promise<PixivConfigResponse> => requestJson(
      '/api/pixiv-config',
      { cache: 'no-store', ...options },
      parsePixivConfigResponse,
    ),
    update: (
      updates: Array<{ section: string; option: string; value: string }>,
      options: ApiRequestOptions = {},
    ): Promise<ConfigPathResponse> => requestJson(
      '/api/pixiv-config',
      withJsonBody({ updates }, options),
      parseConfigPathResponse,
    ),
  },
  settings: {
    backup: (options: ApiRequestOptions = {}): Promise<ConfigPathResponse> => requestJson(
      '/api/settings/backup',
      { method: 'POST', ...options },
      parseConfigPathResponse,
    ),
    restore: (options: ApiRequestOptions = {}): Promise<ConfigPathResponse> => requestJson(
      '/api/settings/restore',
      { method: 'POST', ...options },
      parseConfigPathResponse,
    ),
  },
  recycleBin: {
    list: (options: ApiRequestOptions = {}): Promise<RecycleBinResponse> => requestJson(
      '/api/recycle-bin',
      { cache: 'no-store', ...options },
      parseRecycleBinResponse,
    ),
    send: (trashId: number, options: ApiRequestOptions = {}): Promise<ApiObjectResponse> => requestJson(
      `/api/recycle-bin/${encodeURIComponent(trashId)}/send-to-system`,
      { method: 'POST', ...options },
      parseObjectResponse,
    ),
    sendAll: (options: ApiRequestOptions = {}): Promise<ApiObjectResponse> => requestJson(
      '/api/recycle-bin/send-all-to-system',
      { method: 'POST', ...options },
      parseObjectResponse,
    ),
  },
};
