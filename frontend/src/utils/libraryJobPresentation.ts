import { LibraryJob } from '../types';

type Translate = (key: string, values?: Record<string, number | string>) => string;
type FormatNumber = (value: number) => string;

const numberValue = (value: number, formatNumber?: FormatNumber) => (
  formatNumber ? formatNumber(value) : String(value)
);

export const getLibraryJobStatusTitle = (job: LibraryJob | null, t?: Translate): string => {
  if (!job) return t?.('library.noActive') ?? '目前沒有執行中的工作';
  const isCacheJob = job.job_type === 'organize-thumbnail-cache';
  if (job.status === 'queued') return t?.('library.statusQueued') ?? '工作已排入佇列';
  if (job.status === 'cancelling') return t?.(isCacheJob ? 'library.statusCancellingCache' : 'library.statusCancellingLibrary') ?? (isCacheJob ? '正在停止縮圖整理' : '正在停止圖片資料庫更新');
  if (job.status === 'completed') return t?.(isCacheJob ? 'library.statusCompletedCache' : 'library.statusCompletedLibrary') ?? (isCacheJob ? '縮圖整理完成' : '圖片資料庫更新完成');
  if (job.status === 'cancelled') return t?.(isCacheJob ? 'library.statusCancelledCache' : 'library.statusCancelledLibrary') ?? (isCacheJob ? '縮圖整理已取消' : '圖片資料庫更新已取消');
  if (job.status === 'failed') return t?.(isCacheJob ? 'library.statusFailedCache' : 'library.statusFailedLibrary') ?? (isCacheJob ? '縮圖整理失敗' : '圖片資料庫更新失敗');
  if (job.status === 'interrupted') return t?.(isCacheJob ? 'library.statusInterruptedCache' : 'library.statusInterruptedLibrary') ?? (isCacheJob ? '縮圖整理被中斷' : '圖片資料庫更新被中斷');
  if (job.phase === 'analyzing_colors') return t?.('library.statusAnalyzing') ?? '正在分析圖片色彩';
  if (job.phase === 'organizing_cache') return t?.('library.statusOrganizing') ?? '正在整理縮圖';
  return job.phase === 'discovering'
    ? t?.('library.statusDiscovering') ?? '正在讀取圖片資料夾'
    : t?.('library.statusUpdating') ?? '正在更新圖片資料庫';
};

export const getCompletedLibraryUpdateDescription = (job: LibraryJob, t?: Translate, formatNumber?: FormatNumber): string => {
  const details: string[] = [];
  if (job.added > 0) details.push(t?.('library.addedCount', { count: numberValue(job.added, formatNumber) }) ?? `新增 ${job.added} 張`);
  if (job.updated > 0) details.push(t?.('library.updatedCount', { count: numberValue(job.updated, formatNumber) }) ?? `更新 ${job.updated} 張`);
  if (job.colors_created > 0) details.push(t?.('library.colorsCreatedCount', { count: numberValue(job.colors_created, formatNumber) }) ?? `建立 ${job.colors_created} 筆圖片色彩資料`);
  if (job.errors > 0) details.push(t?.('library.errorCount', { count: numberValue(job.errors, formatNumber) }) ?? `${job.errors} 個檔案處理失敗`);
  if (job.conflicts > 0) details.push(t?.('library.conflictCount', { count: numberValue(job.conflicts, formatNumber) }) ?? `${job.conflicts} 個檔名衝突已保留`);

  if (details.length > 0) return t?.('library.updateSummary', { changes: details.join(t === undefined ? '、' : ', ') }) ?? `${details.join('、')}。`;
  return job.analyze_colors
    ? t?.('library.updateNoChangesWithColors') ?? '沒有新增或變更的圖片，圖片色彩資料也已是最新狀態。'
    : t?.('library.updateNoChanges') ?? '沒有新增或變更的圖片。';
};

export const getLibraryJobStatusDescription = (job: LibraryJob | null, t?: Translate, formatNumber?: FormatNumber): string => {
  if (!job) return t?.('library.noActiveDescription') ?? '開始更新圖片資料庫後，這裡會保留穩定的狀態訊息。';
  const isCacheJob = job.job_type === 'organize-thumbnail-cache';
  if (job.status === 'queued') return t?.('library.queuedDescription') ?? '前一個工作完成後會開始處理。';
  if (job.status === 'cancelling') return t?.(isCacheJob ? 'library.cancellingCacheDescription' : 'library.cancellingLibraryDescription') ?? (isCacheJob ? '正在停止；已完成的縮圖移動會保留。' : '正在停止；已完成的圖片更新會保留。');
  if (job.status === 'completed') {
    if (isCacheJob) return t?.('library.completedCacheDescription', { count: numberValue(job.cache_moved, formatNumber) }) ?? `已移出 ${job.cache_moved} 個縮圖，原檔仍可從可復原位置還原。`;
    return getCompletedLibraryUpdateDescription(job, t, formatNumber);
  }
  if (job.status === 'cancelled') {
    return isCacheJob
      ? t?.('library.cancelledCacheDescription', { count: numberValue(job.cache_moved, formatNumber) }) ?? `已保留完成的整理：移出 ${job.cache_moved} 個縮圖。`
      : t?.('library.cancelledLibraryDescription', { processed: numberValue(job.processed, formatNumber), total: numberValue(job.total ?? job.discovered, formatNumber) }) ?? `已保留完成的更新：處理 ${job.processed} / ${job.total ?? job.discovered} 張`;
  }
  if (job.status === 'failed' || job.status === 'interrupted') {
    return job.error_message || '請確認圖片來源目錄後重新執行。';
  }
  if (job.phase === 'discovering') {
    return t?.('library.discoveringDescription', { count: numberValue(job.discovered, formatNumber) }) ?? `已找到 ${job.discovered} 個媒體檔案，正在準備圖片資料庫。`;
  }
  if (job.phase === 'analyzing_colors') {
    return t?.('library.analyzingDescription', { processed: numberValue(job.processed, formatNumber), total: numberValue(job.total ?? 0, formatNumber) }) ?? `已分析 ${job.processed} / ${job.total ?? '…'} 張圖片色彩。`;
  }
  if (job.phase === 'organizing_cache') {
    return t?.('library.organizingDescription', { processed: numberValue(job.processed, formatNumber), total: numberValue(job.total ?? 0, formatNumber), moved: numberValue(job.cache_moved, formatNumber) }) ?? `已整理 ${job.processed} / ${job.total ?? '…'} 個縮圖，移出 ${job.cache_moved} 個。`;
  }
  return t?.('library.updatingDescription', { processed: numberValue(job.processed, formatNumber), total: numberValue(job.total ?? 0, formatNumber) }) ?? `已處理 ${job.processed} / ${job.total ?? '…'} 張圖片。`;
};
