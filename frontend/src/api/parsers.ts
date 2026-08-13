import {
  Artist,
  HiddenArtist,
  ImageItem,
  LibraryJob,
  LibraryJobPhase,
  LibraryJobStatus,
  MonthItem,
  MonthIndexItem,
  RecycleEntry,
  ThumbnailCacheRecoveryDetails,
  ThumbnailCacheRecoveryEntry,
  ThumbnailCacheRecoveryJob,
  ThumbnailCacheStats,
  WebConfig,
} from '../types';
import { normalizeWebConfig } from '../utils/webConfig';

export interface LibraryJobResponse {
  job: LibraryJob | null;
}

export interface WebConfigUpdateResponse {
  status: string;
  webConfig: WebConfig;
}

export interface ImagePageResponse {
  images: ImageItem[];
  total: number;
  monthIndexItems: MonthIndexItem[];
  revision?: string;
  offset?: number;
  limit?: number;
}

export interface LibrarySourceInspection {
  mode: 'pixiv' | 'folder';
  configPath?: string;
  rootDirectory: string;
  databaseDetected: boolean;
  databasePath: string | null;
}

export interface PixivConfigResponse {
  sections: Record<string, Record<string, string>>;
  hasBackup: boolean;
  configPath: string;
  backupPath: string;
  defaultConfigPath: string;
  usingDefaultPath: boolean;
}

export interface ConfigPathResponse {
  configPath?: string;
  backupPath?: string;
  defaultConfigPath?: string;
  usingDefaultPath?: boolean;
  hasBackup?: boolean;
  message?: string;
  status?: string;
}

export interface ApiObjectResponse {
  [key: string]: unknown;
}

export interface RecycleBinResponse {
  entries: RecycleEntry[];
  total: number;
}

export interface ThumbnailCacheRestoreResponse {
  status: string;
  restored: number;
  conflicts: number;
  errors: string[];
}

export interface ThumbnailCacheRecycleResponse {
  status: string;
  moved: number;
  bytes_freed: number;
  metadata_removed: number;
  remaining: number;
  errors: string[];
}

type JsonRecord = Record<string, unknown>;

export class ApiValidationError extends Error {
  readonly path: string;

  constructor(message: string, path = '$') {
    super(`${message} at ${path}`);
    this.name = 'ApiValidationError';
    this.path = path;
  }
}

const isRecord = (value: unknown): value is JsonRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const requireRecord = (value: unknown, path: string): JsonRecord => {
  if (!isRecord(value)) throw new ApiValidationError('expected an object', path);
  return value;
};

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') throw new ApiValidationError('expected a string', path);
  return value;
};

const requireInteger = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new ApiValidationError('expected a safe integer', path);
  }
  return value;
};

const requireNonNegativeInteger = (value: unknown, path: string): number => {
  const number = requireInteger(value, path);
  if (number < 0) throw new ApiValidationError('expected a non-negative integer', path);
  return number;
};

const requireNumber = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiValidationError('expected a finite number', path);
  }
  return value;
};

const requireBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') throw new ApiValidationError('expected a boolean', path);
  return value;
};

const requireNullableString = (value: unknown, path: string): string | null => {
  if (value === null) return null;
  return requireString(value, path);
};

const requireNullableNumber = (value: unknown, path: string): number | null => {
  if (value === null) return null;
  return requireNumber(value, path);
};

const requireNullableInteger = (value: unknown, path: string): number | null => {
  if (value === null) return null;
  return requireInteger(value, path);
};

const requireStringArray = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value)) throw new ApiValidationError('expected an array', path);
  return value.map((item, index) => requireString(item, `${path}[${index}]`));
};

const optionalString = (value: unknown, path: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  return requireString(value, path);
};

const optionalInteger = (value: unknown, path: string): number | undefined => {
  if (value === undefined || value === null) return undefined;
  return requireInteger(value, path);
};

const optionalBoolean = (value: unknown, path: string): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  return requireBoolean(value, path);
};

const parseArtist = (value: unknown, index: number): Artist => {
  const record = requireRecord(value, `$.artists[${index}]`);
  const folderId = optionalString(record.folder_id, `$.artists[${index}].folder_id`);
  const scopeKey = optionalString(record.scope_key, `$.artists[${index}].scope_key`);
  const indexScopeKey = optionalString(record.index_scope_key, `$.artists[${index}].index_scope_key`);
  const folderName = optionalString(record.folder_name, `$.artists[${index}].folder_name`);
  const displayName = optionalString(record.display_name, `$.artists[${index}].display_name`);
  const sourceKind = optionalString(record.source_kind, `$.artists[${index}].source_kind`);
  const identityStatus = optionalString(record.identity_status, `$.artists[${index}].identity_status`);
  if (sourceKind && !['pixiv', 'fanbox', 'discord', 'unknown'].includes(sourceKind)) {
    throw new ApiValidationError('unexpected source_kind', `$.artists[${index}].source_kind`);
  }
  if (identityStatus && !['inferred', 'verified', 'rejected', 'unknown'].includes(identityStatus)) {
    throw new ApiValidationError('unexpected identity_status', `$.artists[${index}].identity_status`);
  }
  return {
    ...(folderId === undefined ? {} : { folder_id: folderId }),
    ...(scopeKey === undefined ? {} : { scope_key: scopeKey }),
    ...(indexScopeKey === undefined ? {} : { index_scope_key: indexScopeKey }),
    member_id: requireInteger(record.member_id, `$.artists[${index}].member_id`),
    name: requireString(record.name, `$.artists[${index}].name`),
    artwork_count: requireInteger(record.artwork_count, `$.artists[${index}].artwork_count`),
    ...(folderName === undefined ? {} : { folder_name: folderName }),
    ...(displayName === undefined ? {} : { display_name: displayName }),
    ...(sourceKind === undefined ? {} : { source_kind: sourceKind as Artist['source_kind'] }),
    ...(identityStatus === undefined ? {} : { identity_status: identityStatus as Artist['identity_status'] }),
  };
};

const parseMonthItem = (value: unknown, index: number): MonthItem => {
  const record = requireRecord(value, `$.months[${index}]`);
  const count = requireInteger(record.count, `$.months[${index}].count`);
  if (count < 0) throw new ApiValidationError('expected a non-negative count', `$.months[${index}].count`);
  return {
    month: requireString(record.month, `$.months[${index}].month`),
    count,
  };
};

export const parseArtistsResponse = (value: unknown): Artist[] => {
  if (!Array.isArray(value)) throw new ApiValidationError('expected an array', '$');
  return value.map(parseArtist);
};

export const parseMonthsResponse = (value: unknown): MonthItem[] => {
  if (!Array.isArray(value)) throw new ApiValidationError('expected an array', '$');
  return value.map(parseMonthItem);
};

export const parseHiddenArtistsResponse = (value: unknown): HiddenArtist[] => {
  if (!Array.isArray(value)) throw new ApiValidationError('expected an array', '$');
  return value.map((item, index) => {
    const record = requireRecord(item, `$.hiddenArtists[${index}]`);
    const folderId = optionalString(record.folder_id, `$.hiddenArtists[${index}].folder_id`);
    const scopeKey = optionalString(record.scope_key, `$.hiddenArtists[${index}].scope_key`);
    const name = optionalString(record.name, `$.hiddenArtists[${index}].name`);
    const displayName = optionalString(record.display_name, `$.hiddenArtists[${index}].display_name`);
    return {
      ...(folderId === undefined ? {} : { folder_id: folderId }),
      ...(scopeKey === undefined ? {} : { scope_key: scopeKey }),
      member_id: requireInteger(record.member_id, `$.hiddenArtists[${index}].member_id`),
      folder_name: requireString(record.folder_name, `$.hiddenArtists[${index}].folder_name`),
      ...(name === undefined ? {} : { name }),
      ...(displayName === undefined ? {} : { display_name: displayName }),
      hidden_at: requireString(record.hidden_at, `$.hiddenArtists[${index}].hidden_at`),
    };
  });
};

export const parseLibrarySourceInspection = (value: unknown): LibrarySourceInspection => {
  const record = requireRecord(value, '$');
  const mode = record.mode;
  if (mode !== 'pixiv' && mode !== 'folder') {
    throw new ApiValidationError('unexpected source mode', '$.mode');
  }
  return {
    mode,
    configPath: optionalString(record.configPath, '$.configPath'),
    rootDirectory: requireString(record.rootDirectory, '$.rootDirectory'),
    databaseDetected: requireBoolean(record.databaseDetected, '$.databaseDetected'),
    databasePath: requireNullableString(record.databasePath, '$.databasePath'),
  };
};

export const parseObjectResponse = (value: unknown): ApiObjectResponse => requireRecord(value, '$');

export const parseRecycleBinResponse = (value: unknown): RecycleBinResponse => {
  const record = requireRecord(value, '$');
  const entriesValue = record.entries;
  if (!Array.isArray(entriesValue)) throw new ApiValidationError('expected an array', '$.entries');
  const entries = entriesValue.map((item, index): RecycleEntry => {
    const entry = requireRecord(item, `$.entries[${index}]`);
    return {
      folder_id: optionalString(entry.folder_id, `$.entries[${index}].folder_id`),
      trash_id: requireInteger(entry.trash_id, `$.entries[${index}].trash_id`),
      image_id: requireInteger(entry.image_id, `$.entries[${index}].image_id`),
      original_path: requireString(entry.original_path, `$.entries[${index}].original_path`),
      trash_path: requireNullableString(entry.trash_path, `$.entries[${index}].trash_path`),
      trashed_at: requireString(entry.trashed_at, `$.entries[${index}].trashed_at`),
      member_id: requireNullableNumber(entry.member_id, `$.entries[${index}].member_id`),
      artist_name: requireString(entry.artist_name, `$.entries[${index}].artist_name`),
      file_name: requireString(entry.file_name, `$.entries[${index}].file_name`),
      file_size: requireNullableNumber(entry.file_size, `$.entries[${index}].file_size`),
      available: requireBoolean(entry.available, `$.entries[${index}].available`),
    };
  });
  const total = record.total === undefined ? entries.length : requireInteger(record.total, '$.total');
  if (total < 0) throw new ApiValidationError('expected a non-negative total', '$.total');
  return { entries, total };
};

const parseThumbnailCacheRecoveryJob = (value: unknown, index: number): ThumbnailCacheRecoveryJob => {
  const path = `$.recovery_jobs[${index}]`;
  const record = requireRecord(value, path);
  return {
    job_id: requireString(record.job_id, `${path}.job_id`),
    created_at: requireNullableString(record.created_at, `${path}.created_at`),
    moved: requireNonNegativeInteger(record.moved, `${path}.moved`),
    recoverable_files: requireNonNegativeInteger(record.recoverable_files, `${path}.recoverable_files`),
    recoverable_bytes: requireNonNegativeInteger(record.recoverable_bytes, `${path}.recoverable_bytes`),
    restorable: requireBoolean(record.restorable, `${path}.restorable`),
  };
};

const parseThumbnailCacheRecoveryEntry = (value: unknown, index: number): ThumbnailCacheRecoveryEntry => {
  const path = `$.entries[${index}]`;
  const record = requireRecord(value, path);
  return {
    recovery_name: requireString(record.recovery_name, `${path}.recovery_name`),
    cache_name: requireNullableString(record.cache_name, `${path}.cache_name`),
    cache_bytes: requireNonNegativeInteger(record.cache_bytes, `${path}.cache_bytes`),
    width: requireNullableInteger(record.width, `${path}.width`),
    height: requireNullableInteger(record.height, `${path}.height`),
    reason: requireString(record.reason, `${path}.reason`),
    moved_at: requireNullableString(record.moved_at, `${path}.moved_at`),
    source_path: requireNullableString(record.source_path, `${path}.source_path`),
    source_file_size: requireNullableInteger(record.source_file_size, `${path}.source_file_size`),
    source_mtime_ns: requireNullableInteger(record.source_mtime_ns, `${path}.source_mtime_ns`),
    generated_at: requireNullableString(record.generated_at, `${path}.generated_at`),
    last_accessed_at: requireNullableString(record.last_accessed_at, `${path}.last_accessed_at`),
  };
};

export const parseThumbnailCacheStatsResponse = (value: unknown): ThumbnailCacheStats => {
  const record = requireRecord(value, '$');
  if (!Array.isArray(record.recovery_jobs)) {
    throw new ApiValidationError('expected an array', '$.recovery_jobs');
  }
  return {
    active_files: requireNonNegativeInteger(record.active_files, '$.active_files'),
    active_bytes: requireNonNegativeInteger(record.active_bytes, '$.active_bytes'),
    tracked_files: requireNonNegativeInteger(record.tracked_files, '$.tracked_files'),
    recoverable_files: requireNonNegativeInteger(record.recoverable_files, '$.recoverable_files'),
    recoverable_bytes: requireNonNegativeInteger(record.recoverable_bytes, '$.recoverable_bytes'),
    recovery_jobs: record.recovery_jobs.map(parseThumbnailCacheRecoveryJob),
  };
};

export const parseThumbnailCacheRecoveryDetailsResponse = (
  value: unknown,
): ThumbnailCacheRecoveryDetails => {
  const record = requireRecord(value, '$');
  if (!Array.isArray(record.entries)) throw new ApiValidationError('expected an array', '$.entries');
  return {
    job_id: requireString(record.job_id, '$.job_id'),
    created_at: requireNullableString(record.created_at, '$.created_at'),
    moved: requireNonNegativeInteger(record.moved, '$.moved'),
    total: requireNonNegativeInteger(record.total, '$.total'),
    total_bytes: requireNonNegativeInteger(record.total_bytes, '$.total_bytes'),
    offset: requireNonNegativeInteger(record.offset, '$.offset'),
    limit: requireNonNegativeInteger(record.limit, '$.limit'),
    has_more: requireBoolean(record.has_more, '$.has_more'),
    entries: record.entries.map(parseThumbnailCacheRecoveryEntry),
  };
};

export const parseThumbnailCacheRestoreResponse = (value: unknown): ThumbnailCacheRestoreResponse => {
  const record = requireRecord(value, '$');
  return {
    status: requireString(record.status, '$.status'),
    restored: requireNonNegativeInteger(record.restored, '$.restored'),
    conflicts: requireNonNegativeInteger(record.conflicts, '$.conflicts'),
    errors: requireStringArray(record.errors, '$.errors'),
  };
};

export const parseThumbnailCacheRecycleResponse = (value: unknown): ThumbnailCacheRecycleResponse => {
  const record = requireRecord(value, '$');
  return {
    status: requireString(record.status, '$.status'),
    moved: requireNonNegativeInteger(record.moved, '$.moved'),
    bytes_freed: requireNonNegativeInteger(record.bytes_freed, '$.bytes_freed'),
    metadata_removed: requireNonNegativeInteger(record.metadata_removed, '$.metadata_removed'),
    remaining: requireNonNegativeInteger(record.remaining, '$.remaining'),
    errors: requireStringArray(record.errors, '$.errors'),
  };
};

export const parsePixivConfigResponse = (value: unknown): PixivConfigResponse => {
  const record = requireRecord(value, '$');
  const sectionsRecord = requireRecord(record.sections, '$.sections');
  const sections = Object.fromEntries(Object.entries(sectionsRecord).map(([sectionName, sectionValue]) => {
    const section = requireRecord(sectionValue, `$.sections.${sectionName}`);
    return [sectionName, Object.fromEntries(Object.entries(section).map(([key, item]) => [
      key,
      requireString(item, `$.sections.${sectionName}.${key}`),
    ]))];
  }));
  return {
    sections,
    hasBackup: requireBoolean(record.hasBackup, '$.hasBackup'),
    configPath: requireString(record.configPath, '$.configPath'),
    backupPath: requireString(record.backupPath, '$.backupPath'),
    defaultConfigPath: requireString(record.defaultConfigPath, '$.defaultConfigPath'),
    usingDefaultPath: requireBoolean(record.usingDefaultPath, '$.usingDefaultPath'),
  };
};

export const parseConfigPathResponse = (value: unknown): ConfigPathResponse => {
  const record = requireRecord(value, '$');
  return {
    ...(optionalString(record.configPath, '$.configPath') === undefined
      ? {}
      : { configPath: optionalString(record.configPath, '$.configPath') }),
    ...(optionalString(record.backupPath, '$.backupPath') === undefined
      ? {}
      : { backupPath: optionalString(record.backupPath, '$.backupPath') }),
    ...(optionalString(record.defaultConfigPath, '$.defaultConfigPath') === undefined
      ? {}
      : { defaultConfigPath: optionalString(record.defaultConfigPath, '$.defaultConfigPath') }),
    ...(optionalBoolean(record.usingDefaultPath, '$.usingDefaultPath') === undefined
      ? {}
      : { usingDefaultPath: optionalBoolean(record.usingDefaultPath, '$.usingDefaultPath') }),
    ...(optionalBoolean(record.hasBackup, '$.hasBackup') === undefined
      ? {}
      : { hasBackup: optionalBoolean(record.hasBackup, '$.hasBackup') }),
    ...(optionalString(record.message, '$.message') === undefined
      ? {}
      : { message: optionalString(record.message, '$.message') }),
    ...(optionalString(record.status, '$.status') === undefined
      ? {}
      : { status: optionalString(record.status, '$.status') }),
  };
};

const getMonthKeyFromDate = (dateValue: string): string | null => {
  const value = dateValue.trim();
  const match = value.match(/^(\d{4})[\-/](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`;

  const compactMatch = value.match(/^(\d{4})(\d{2})/);
  return compactMatch ? `${compactMatch[1]}-${compactMatch[2]}` : null;
};

const monthLabel = (key: string): string => {
  const [year, month] = key.split('-');
  return year && month ? `${year} 年 ${month.padStart(2, '0')} 月` : key;
};

const deriveMonthIndexItems = (images: ImageItem[]): MonthIndexItem[] => {
  const counts = new Map<string, number>();
  images.forEach(image => {
    const key = getMonthKeyFromDate(image.created_date);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts, ([key, count]) => ({
    key,
    label: monthLabel(key),
    count,
  }));
};

const parseImageItem = (value: unknown, index: number): ImageItem => {
  const record = requireRecord(value, `$.images[${index}]`);
  const mediaStatus = record.media_status;
  if (
    mediaStatus !== undefined
    && mediaStatus !== null
    && mediaStatus !== 'invalid'
    && mediaStatus !== 'missing'
    && mediaStatus !== 'internal'
  ) {
    throw new ApiValidationError('unexpected media_status', `$.images[${index}].media_status`);
  }

  return {
    folder_id: optionalString(record.folder_id, `$.images[${index}].folder_id`),
    image_id: requireInteger(record.image_id, `$.images[${index}].image_id`),
    member_id: requireInteger(record.member_id, `$.images[${index}].member_id`),
    title: requireString(record.title, `$.images[${index}].title`),
    save_name: requireString(record.save_name, `$.images[${index}].save_name`),
    file_size: (() => {
      if (record.file_size === undefined) return undefined;
      const value = requireNullableInteger(record.file_size, `$.images[${index}].file_size`);
      if (value !== null && value < 0) {
        throw new ApiValidationError('expected a non-negative file size', `$.images[${index}].file_size`);
      }
      return value;
    })(),
    created_date: requireString(record.created_date, `$.images[${index}].created_date`),
    last_update_date: requireString(record.last_update_date, `$.images[${index}].last_update_date`),
    artist_name: optionalString(record.artist_name, `$.images[${index}].artist_name`),
    dominant_color: optionalString(record.dominant_color, `$.images[${index}].dominant_color`),
    group_page_index: optionalInteger(record.group_page_index, `$.images[${index}].group_page_index`),
    group_page_total: optionalInteger(record.group_page_total, `$.images[${index}].group_page_total`),
    group_card_index: optionalInteger(record.group_card_index, `$.images[${index}].group_card_index`),
    group_card_total: optionalInteger(record.group_card_total, `$.images[${index}].group_card_total`),
    media_status: mediaStatus === null ? undefined : mediaStatus,
    media_error: optionalString(record.media_error, `$.images[${index}].media_error`),
  };
};

const parseMonthIndexItems = (value: unknown, path = '$.months'): MonthIndexItem[] => {
  if (!Array.isArray(value)) throw new ApiValidationError('expected an array', path);

  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const record = requireRecord(item, itemPath);
    const key = record.key === undefined
      ? requireString(record.month, `${itemPath}.month`)
      : requireString(record.key, `${itemPath}.key`);
    const countField = record.image_count === undefined ? 'count' : 'image_count';
    const count = requireNumber(record[countField], `${itemPath}.${countField}`);
    if (count < 0) throw new ApiValidationError('expected a non-negative count', `${itemPath}.${countField}`);

    const offset = record.offset === undefined || record.offset === null
      ? undefined
      : requireInteger(record.offset, `${itemPath}.offset`);
    if (offset !== undefined && offset < 0) {
      throw new ApiValidationError('expected a non-negative offset', `${itemPath}.offset`);
    }

    const cardCount = record.card_count === undefined || record.card_count === null
      ? undefined
      : requireInteger(record.card_count, `${itemPath}.card_count`);
    if (cardCount !== undefined && cardCount < 0) {
      throw new ApiValidationError('expected a non-negative card count', `${itemPath}.card_count`);
    }

    return {
      key,
      label: monthLabel(key),
      count,
      ...(offset === undefined ? {} : { offset }),
      ...(record.image_count === undefined ? {} : { imageCount: count }),
      ...(cardCount === undefined ? {} : { cardCount }),
    };
  });
};

export const parseImagePageResponse = (value: unknown): ImagePageResponse => {
  if (Array.isArray(value)) {
    const images = value.map(parseImageItem);
    return { images, total: images.length, monthIndexItems: deriveMonthIndexItems(images) };
  }

  const record = requireRecord(value, '$');
  const images = record.images === undefined
    ? []
    : Array.isArray(record.images)
      ? record.images.map(parseImageItem)
      : (() => {
        throw new ApiValidationError('expected an array', '$.images');
      })();
  const total = record.total === undefined
    ? images.length
    : requireInteger(record.total, '$.total');
  if (total < 0) throw new ApiValidationError('expected a non-negative total', '$.total');

  const revision = optionalString(record.revision, '$.revision');
  const offset = optionalInteger(record.offset, '$.offset');
  const limit = optionalInteger(record.limit, '$.limit');
  if (offset !== undefined && offset < 0) throw new ApiValidationError('expected a non-negative offset', '$.offset');
  if (limit !== undefined && limit < 0) throw new ApiValidationError('expected a non-negative limit', '$.limit');
  const monthIndexValue = record.month_index === undefined ? record.months : record.month_index;

  return {
    images,
    total,
    monthIndexItems: monthIndexValue === undefined
      ? deriveMonthIndexItems(images)
      : parseMonthIndexItems(
        monthIndexValue,
        record.month_index === undefined ? '$.months' : '$.month_index',
      ),
    ...(revision === undefined ? {} : { revision }),
    ...(offset === undefined ? {} : { offset }),
    ...(limit === undefined ? {} : { limit }),
  };
};

const libraryJobStatuses: readonly LibraryJobStatus[] = [
  'queued',
  'running',
  'cancelling',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
];

const libraryJobPhases: readonly LibraryJobPhase[] = [
  'queued',
  'discovering',
  'indexing',
  'analyzing_colors',
  'organizing_cache',
  'cancelling',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
];

const parseLibraryJob = (value: unknown, path = '$.job'): LibraryJob => {
  const record = requireRecord(value, path);
  const jobType = record.job_type;
  if (jobType !== 'update-library' && jobType !== 'analyze-missing-colors' && jobType !== 'organize-thumbnail-cache') {
    throw new ApiValidationError('unexpected job_type', `${path}.job_type`);
  }
  if (!libraryJobStatuses.includes(record.status as LibraryJobStatus)) {
    throw new ApiValidationError('unexpected status', `${path}.status`);
  }
  if (!libraryJobPhases.includes(record.phase as LibraryJobPhase)) {
    throw new ApiValidationError('unexpected phase', `${path}.phase`);
  }

  const scopes = record.scopes === undefined || record.scopes === null
    ? undefined
    : (() => {
      if (!Array.isArray(record.scopes)) throw new ApiValidationError('expected an array', `${path}.scopes`);
      return record.scopes.map((scopeValue, index) => {
        const scope = requireRecord(scopeValue, `${path}.scopes[${index}]`);
        let scopeType: 'root' | 'artist' | 'directory';
        if (scope.scope_type === 'root' || scope.scope_type === 'artist' || scope.scope_type === 'directory') {
          scopeType = scope.scope_type;
        } else {
          throw new ApiValidationError('unexpected scope_type', `${path}.scopes[${index}].scope_type`);
        }
        const memberId = scope.member_id === null
          ? null
          : requireInteger(scope.member_id, `${path}.scopes[${index}].member_id`);
        return {
          scope_key: requireString(scope.scope_key, `${path}.scopes[${index}].scope_key`),
          scope_type: scopeType,
          member_id: memberId,
          directory: requireString(scope.directory, `${path}.scopes[${index}].directory`),
          folder_id: optionalString(scope.folder_id, `${path}.scopes[${index}].folder_id`),
        };
      });
    })();

  return {
    job_id: requireString(record.job_id, `${path}.job_id`),
    job_type: jobType,
    status: record.status as LibraryJobStatus,
    phase: record.phase as LibraryJobPhase,
    directory: requireString(record.directory, `${path}.directory`),
    scopes,
    priority: optionalInteger(record.priority, `${path}.priority`),
    automatic: optionalBoolean(record.automatic, `${path}.automatic`),
    analyze_colors: requireBoolean(record.analyze_colors, `${path}.analyze_colors`),
    discovered: requireInteger(record.discovered, `${path}.discovered`),
    total: requireNullableNumber(record.total, `${path}.total`),
    processed: requireInteger(record.processed, `${path}.processed`),
    added: requireInteger(record.added, `${path}.added`),
    updated: requireInteger(record.updated, `${path}.updated`),
    unchanged: requireInteger(record.unchanged, `${path}.unchanged`),
    conflicts: requireInteger(record.conflicts, `${path}.conflicts`),
    errors: requireInteger(record.errors, `${path}.errors`),
    colors_created: requireInteger(record.colors_created, `${path}.colors_created`),
    colors_reused: requireInteger(record.colors_reused, `${path}.colors_reused`),
    cache_moved: requireInteger(record.cache_moved, `${path}.cache_moved`),
    current_file: requireNullableString(record.current_file, `${path}.current_file`),
    error_message: requireNullableString(record.error_message, `${path}.error_message`),
    cancel_requested: requireBoolean(record.cancel_requested, `${path}.cancel_requested`),
    created_at: requireString(record.created_at, `${path}.created_at`),
    started_at: requireNullableString(record.started_at, `${path}.started_at`),
    finished_at: requireNullableString(record.finished_at, `${path}.finished_at`),
    updated_at: requireString(record.updated_at, `${path}.updated_at`),
  };
};

export const parseLibraryJobResponse = (value: unknown): LibraryJobResponse => {
  const record = requireRecord(value, '$');
  if (!Object.prototype.hasOwnProperty.call(record, 'job')) {
    throw new ApiValidationError('missing job field', '$.job');
  }
  return { job: record.job === null ? null : parseLibraryJob(record.job) };
};

export const parseWebConfigResponse = (value: unknown): WebConfig => {
  requireRecord(value, '$');
  return normalizeWebConfig(value);
};

export const parseWebConfigUpdateResponse = (value: unknown): WebConfigUpdateResponse => {
  const record = requireRecord(value, '$');
  return {
    status: record.status === undefined ? 'success' : requireString(record.status, '$.status'),
    webConfig: parseWebConfigResponse(record.webConfig),
  };
};
