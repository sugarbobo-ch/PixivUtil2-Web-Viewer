import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Database,
  Eye,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { PathPickerField } from './PathPickerField';
import {
  getFieldMetadata,
  getSectionMetadata,
  PixivConfigFieldMetadata,
} from '../pixivConfigMetadata';
import {
  DEFAULT_WEB_CONFIG,
  LibraryJob,
  ThumbnailCacheRecoveryDetails,
  ThumbnailCacheRecoveryJob,
  ThumbnailCacheStats,
  HiddenArtist,
  Artist,
  WebConfig,
} from '../types';
import { normalizeWebConfig } from '../utils/webConfig';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved: () => void;
  onOpenRecycleBin?: () => void;
  artists?: Artist[];
}

type MainTab = 'web' | 'library' | 'pixiv' | 'backup';

interface WebViewerConfig {
  webTheme: WebConfig['webTheme'];
  defaultViewMode: WebConfig['defaultViewMode'];
  thumbnailSize: number;
  itemsPerPage: number;
  autoOpenBrowser: boolean;
  groupMangaPosts: boolean;
  blurEnabled: boolean;
  preloadImageCount: number;
  analyzeColorsAfterLibraryUpdate: boolean;
  manageThumbnailCache: boolean;
  thumbnailCacheLimitMiB: number;
  pixivConfigPath: string;
}

interface PixivConfigResponse {
  sections: Record<string, Record<string, string>>;
  hasBackup: boolean;
  configPath: string;
  backupPath: string;
  defaultConfigPath: string;
  usingDefaultPath: boolean;
}

interface ConfigPathInfo {
  configPath: string;
  backupPath: string;
  defaultConfigPath: string;
  usingDefaultPath: boolean;
}

interface FeedbackMessage {
  type: 'success' | 'error';
  text: string;
}

interface LibraryJobResponse {
  job: LibraryJob | null;
}

const emptyThumbnailCacheStats: ThumbnailCacheStats = {
  active_files: 0,
  active_bytes: 0,
  tracked_files: 0,
  recoverable_files: 0,
  recoverable_bytes: 0,
  recovery_jobs: [],
};

const RECOVERY_PAGE_SIZE = 24;

const defaultWebConfig: WebViewerConfig = {
  ...DEFAULT_WEB_CONFIG,
  pixivConfigPath: '',
};

const inputClass =
  'settings-modal__control w-full rounded-lg px-3 py-2 text-sm transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-1';

const selectClass =
  'settings-modal__control select-control w-full rounded-lg py-2 text-sm transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-1';

const themeOptions = [
  { value: 'dark', label: '深色', description: '深色背景，適合夜間瀏覽' },
  { value: 'light', label: '淺色', description: '明亮背景，適合日間瀏覽' },
] as const;

const tabClass = (selected: boolean) =>
  `settings-modal__tab flex min-h-11 items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-[color,border-color,background-color] focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${selected ? 'is-selected' : ''}`;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '發生未知錯誤，請稍後再試。';

const isLibraryJobActive = (job: LibraryJob | null) =>
  !!job && ['queued', 'running', 'cancelling'].includes(job.status);

const getLibraryJobStatusTitle = (job: LibraryJob | null) => {
  if (!job) return '目前沒有執行中的工作';
  const isCacheJob = job.job_type === 'organize-thumbnail-cache';
  if (job.status === 'queued') return '工作已排入佇列';
  if (job.status === 'cancelling') return isCacheJob ? '正在停止縮圖整理' : '正在停止圖片資料庫更新';
  if (job.status === 'completed') return isCacheJob ? '縮圖整理完成' : '圖片資料庫更新完成';
  if (job.status === 'cancelled') return isCacheJob ? '縮圖整理已取消' : '圖片資料庫更新已取消';
  if (job.status === 'failed') return isCacheJob ? '縮圖整理失敗' : '圖片資料庫更新失敗';
  if (job.status === 'interrupted') return isCacheJob ? '縮圖整理被中斷' : '圖片資料庫更新被中斷';
  if (job.phase === 'analyzing_colors') return '正在分析圖片色彩';
  if (job.phase === 'organizing_cache') return '正在整理縮圖';
  return job.phase === 'discovering' ? '正在讀取圖片資料夾' : '正在更新圖片資料庫';
};

const getLibraryJobStatusDescription = (job: LibraryJob | null) => {
  if (!job) return '開始更新圖片資料庫後，這裡會保留穩定的狀態訊息。';
  const isCacheJob = job.job_type === 'organize-thumbnail-cache';
  if (job.status === 'queued') return '前一個工作完成後會開始處理。';
  if (job.status === 'cancelling') return isCacheJob ? '正在停止；已完成的縮圖移動會保留。' : '正在停止；已完成的圖片更新會保留。';
  if (job.status === 'completed') {
    if (isCacheJob) return `已移出 ${job.cache_moved} 個縮圖，原檔仍可從可復原位置還原。`;
    return `新增 ${job.added} 張、更新 ${job.updated} 張、分析 ${job.colors_created} 張色彩`;
  }
  if (job.status === 'cancelled') {
    return isCacheJob
      ? `已保留完成的整理：移出 ${job.cache_moved} 個縮圖。`
      : `已保留完成的更新：處理 ${job.processed} / ${job.total ?? job.discovered} 張`;
  }
  if (job.status === 'failed' || job.status === 'interrupted') {
    return job.error_message || '請確認圖片來源目錄後重新執行。';
  }
  if (job.phase === 'discovering') {
    return `已找到 ${job.discovered} 個媒體檔案，正在準備圖片資料庫。`;
  }
  if (job.phase === 'analyzing_colors') {
    return `已分析 ${job.processed} / ${job.total ?? '…'} 張圖片色彩。`;
  }
  if (job.phase === 'organizing_cache') {
    return `已整理 ${job.processed} / ${job.total ?? '…'} 個縮圖，移出 ${job.cache_moved} 個。`;
  }
  return `已處理 ${job.processed} / ${job.total ?? '…'} 張圖片。`;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
  onOpenRecycleBin,
  artists = [],
}) => {
  const [mainTab, setMainTab] = useState<MainTab>('web');
  const [webConfig, setWebConfig] = useState<WebViewerConfig>(defaultWebConfig);
  const [pixivSections, setPixivSections] = useState<Record<string, Record<string, string>>>({});
  const [activeSection, setActiveSection] = useState('Settings');
  const [sectionFilter, setSectionFilter] = useState('');
  const [hasBackup, setHasBackup] = useState(false);
  const [configPathInfo, setConfigPathInfo] = useState<ConfigPathInfo>({
    configPath: '',
    backupPath: '',
    defaultConfigPath: '',
    usingDefaultPath: true,
  });

  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [libraryJob, setLibraryJob] = useState<LibraryJob | null>(null);
  const [thumbnailCacheStats, setThumbnailCacheStats] = useState<ThumbnailCacheStats>(emptyThumbnailCacheStats);
  const [thumbnailCacheLoading, setThumbnailCacheLoading] = useState(false);
  const [expandedRecoveryJobId, setExpandedRecoveryJobId] = useState<string | null>(null);
  const [recoveryDetails, setRecoveryDetails] = useState<ThumbnailCacheRecoveryDetails | null>(null);
  const [recoveryDetailsLoading, setRecoveryDetailsLoading] = useState(false);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<ThumbnailCacheRecoveryJob | null>(null);
  const [hardDeleteLoading, setHardDeleteLoading] = useState(false);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [hiddenArtists, setHiddenArtists] = useState<HiddenArtist[]>([]);
  const [selectedArtistIds, setSelectedArtistIds] = useState<number[]>([]);
  const libraryPollTimerRef = useRef<number | null>(null);

  const sectionKeys = Object.keys(pixivSections);
  const isSearching = sectionFilter.trim().length > 0;
  const rootDirectory = pixivSections.Settings?.rootdirectory
    || pixivSections.Settings?.rootDirectory
    || '.';

  useEffect(() => {
    const availableIds = new Set(artists.map(artist => artist.member_id));
    setSelectedArtistIds(current => current.filter(memberId => availableIds.has(memberId)));
  }, [artists]);

  const readJsonResponse = async <T,>(response: Response): Promise<T> => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.message || `請求失敗（${response.status}）`);
    }
    return data as T;
  };

  const loadThumbnailCacheStats = async () => {
    setThumbnailCacheLoading(true);
    try {
      const response = await fetch('/api/library/stats');
      const data = await readJsonResponse<Partial<ThumbnailCacheStats>>(response);
      setThumbnailCacheStats({
        ...emptyThumbnailCacheStats,
        ...data,
        recovery_jobs: Array.isArray(data.recovery_jobs) ? data.recovery_jobs : [],
      });
    } catch (error) {
      setMessage({ type: 'error', text: `無法讀取縮圖容量：${getErrorMessage(error)}` });
    } finally {
      setThumbnailCacheLoading(false);
    }
  };

  const loadThumbnailCacheDetails = async (jobId: string, offset = 0) => {
    setRecoveryDetailsLoading(true);
    try {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(RECOVERY_PAGE_SIZE),
      });
      const response = await fetch(`/api/library/cache/${encodeURIComponent(jobId)}/entries?${params.toString()}`);
      const data = await readJsonResponse<ThumbnailCacheRecoveryDetails>(response);
      setRecoveryDetails(data);
    } catch (error) {
      setRecoveryDetails(null);
      setMessage({ type: 'error', text: `無法讀取縮圖內容：${getErrorMessage(error)}` });
    } finally {
      setRecoveryDetailsLoading(false);
    }
  };

  const handleToggleRecoveryDetails = (jobId: string) => {
    if (expandedRecoveryJobId === jobId) {
      setExpandedRecoveryJobId(null);
      setRecoveryDetails(null);
      return;
    }

    setExpandedRecoveryJobId(jobId);
    setRecoveryDetails(null);
    void loadThumbnailCacheDetails(jobId);
  };

  const handleRecoveryPageChange = (jobId: string, offset: number) => {
    void loadThumbnailCacheDetails(jobId, offset);
  };

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return '未知時間';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-TW', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const getRecoveryReasonLabel = (reason: string) => ({
    'missing-source': '來源圖片已不存在',
    'stale-source': '來源圖片已變更',
    'old-size': '縮圖尺寸已變更',
    lru: '長時間未使用',
  }[reason] || '快取整理');

  const getPathFileName = (path: string | null) => {
    if (!path) return '未找到來源資料';
    return path.split(/[\\/]/).pop() || path;
  };

  const loadHiddenArtists = async () => {
    try {
      const response = await fetch('/api/hidden-artists', { cache: 'no-store' });
      const data = await readJsonResponse<HiddenArtist[]>(response);
      setHiddenArtists(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage({ type: 'error', text: `無法讀取已隱藏繪師：${getErrorMessage(error)}` });
    }
  };

  const handleUnhideArtist = async (artist: HiddenArtist) => {
    try {
      const response = await fetch(`/api/artists/${encodeURIComponent(artist.member_id)}/unhide`, { method: 'POST' });
      await readJsonResponse(response);
      await loadHiddenArtists();
      setMessage({ type: 'success', text: `已恢復顯示「${artist.folder_name || artist.member_id}」。` });
    } catch (error) {
      setMessage({ type: 'error', text: `無法恢復繪師：${getErrorMessage(error)}` });
    }
  };

  const stopLibraryPolling = () => {
    if (libraryPollTimerRef.current !== null) {
      window.clearTimeout(libraryPollTimerRef.current);
      libraryPollTimerRef.current = null;
    }
  };

  const finishLibraryJob = (job: LibraryJob) => {
    setScanning(false);
    void loadThumbnailCacheStats();
    if (job.status === 'completed') {
      if (job.job_type === 'organize-thumbnail-cache') {
        setMessage({
          type: 'success',
          text: `縮圖整理完成：移出 ${job.cache_moved} 個縮圖；檔案仍保留在可復原位置。`,
        });
        return;
      }
      const errorSuffix = job.errors > 0 ? `，${job.errors} 個檔案處理失敗` : '';
      const conflictSuffix = job.conflicts > 0 ? `，${job.conflicts} 個檔名衝突已保留` : '';
      setMessage({
        type: 'success',
        text: `圖片資料庫更新完成：新增 ${job.added} 張、更新 ${job.updated} 張、分析 ${job.colors_created} 張色彩${errorSuffix}${conflictSuffix}。`,
      });
      onSettingsSaved();
      return;
    }
    if (job.status === 'cancelled') {
      setMessage({
        type: 'success',
        text: job.job_type === 'organize-thumbnail-cache'
          ? `縮圖整理已取消；已移出的 ${job.cache_moved} 個縮圖仍可還原。`
          : '圖片資料庫更新已取消；已完成的更新已保留。',
      });
      onSettingsSaved();
      return;
    }
    if (job.status === 'failed' || job.status === 'interrupted') {
      setMessage({
        type: 'error',
        text: job.error_message || '圖片資料庫更新未完成，請確認來源目錄後重新執行。',
      });
    }
  };

  const pollLibraryJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/library/jobs/${encodeURIComponent(jobId)}`);
      const data = await readJsonResponse<LibraryJobResponse>(response);
      if (!data.job) throw new Error('找不到圖片資料庫工作。');

      setLibraryJob(data.job);
      if (isLibraryJobActive(data.job)) {
        setScanning(true);
        libraryPollTimerRef.current = window.setTimeout(() => {
          void pollLibraryJob(jobId);
        }, 800);
        return;
      }

      stopLibraryPolling();
      finishLibraryJob(data.job);
    } catch (error) {
      stopLibraryPolling();
      setScanning(false);
      setMessage({ type: 'error', text: `無法讀取圖片資料庫工作：${getErrorMessage(error)}` });
    }
  };

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const [webResponse, pixivResponse, libraryJobResponse] = await Promise.all([
        fetch('/api/web-config'),
        fetch('/api/pixiv-config'),
        fetch('/api/library/jobs/current'),
      ]);
       const webData = await readJsonResponse<Partial<WebViewerConfig> & {
         thumbnailWidth?: number;
         thumbnailHeight?: number;
      }>(webResponse);
      const pixivData = await readJsonResponse<PixivConfigResponse>(pixivResponse);
      const libraryData = await readJsonResponse<LibraryJobResponse>(libraryJobResponse);
      const nextSections = pixivData.sections || {};
      const nextSectionKeys = Object.keys(nextSections);

       setWebConfig({
         ...normalizeWebConfig(webData),
         pixivConfigPath: webData.pixivConfigPath || '',
       });
      setPixivSections(nextSections);
      setLibraryJob(libraryData.job);
      if (isLibraryJobActive(libraryData.job)) {
        setScanning(true);
        stopLibraryPolling();
        void pollLibraryJob(libraryData.job!.job_id);
      } else {
        stopLibraryPolling();
        setScanning(false);
      }
      setHasBackup(!!pixivData.hasBackup);
      setConfigPathInfo({
        configPath: pixivData.configPath || '',
        backupPath: pixivData.backupPath || '',
        defaultConfigPath: pixivData.defaultConfigPath || '',
        usingDefaultPath: !!pixivData.usingDefaultPath,
      });
      void loadThumbnailCacheStats();

      setActiveSection(current => {
        if (current && nextSectionKeys.includes(current)) return current;
        if (nextSectionKeys.includes('Settings')) return 'Settings';
        return nextSectionKeys[0] || '';
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopLibraryPolling();
      setScanning(false);
      setShowSaveConfirm(false);
      setHardDeleteTarget(null);
      setExpandedRecoveryJobId(null);
      setRecoveryDetails(null);
      return;
    }

    setMessage(null);
    setSectionFilter('');
    void loadConfigs();
    void loadHiddenArtists();
  }, [isOpen]);

  useEffect(() => () => stopLibraryPolling(), []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (hardDeleteTarget) {
        if (!hardDeleteLoading) setHardDeleteTarget(null);
      } else if (showSaveConfirm) {
        setShowSaveConfirm(false);
      } else {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [hardDeleteLoading, hardDeleteTarget, isOpen, onClose, showSaveConfirm]);

  const handleSaveWebConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const normalizedWebConfig = normalizeWebConfig(webConfig);
      const payload: WebViewerConfig = {
        ...defaultWebConfig,
        ...normalizedWebConfig,
        defaultViewMode: 'grid',
        pixivConfigPath: webConfig.pixivConfigPath.trim(),
      };
      const response = await fetch('/api/web-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await readJsonResponse(response);
      setWebConfig(payload);
      setMessage({ type: 'success', text: 'Web Viewer 設定已儲存。' });
      onSettingsSaved();
    } catch (error) {
      setMessage({ type: 'error', text: `無法儲存 Web Viewer 設定：${getErrorMessage(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfigPath = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/web-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pixivConfigPath: webConfig.pixivConfigPath.trim() }),
      });
      await readJsonResponse(response);
      await loadConfigs();
      setMainTab('pixiv');
      setMessage({ type: 'success', text: 'PixivUtil2 設定檔路徑已儲存，內容已重新載入。' });
      onSettingsSaved();
    } catch (error) {
      setMessage({ type: 'error', text: `無法儲存設定檔路徑：${getErrorMessage(error)}` });
      setLoading(false);
    }
  };

  const handleSavePixivConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const updates = Object.entries(pixivSections).flatMap(([section, options]) =>
        Object.entries(options).map(([option, value]) => ({
          section,
          option,
          value: String(value),
        })),
      );

      const response = await fetch('/api/pixiv-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await readJsonResponse<Partial<PixivConfigResponse> & { message?: string }>(response);

      setHasBackup(true);
      setConfigPathInfo(current => ({
        ...current,
        configPath: data.configPath || current.configPath,
        backupPath: data.backupPath || current.backupPath,
      }));
      setShowSaveConfirm(false);
      setMessage({ type: 'success', text: 'PixivUtil2 config.ini 已儲存，並已自動建立 .bak 備份。' });
      onSettingsSaved();
    } catch (error) {
      setMessage({ type: 'error', text: `無法儲存 PixivUtil2 設定：${getErrorMessage(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings/backup', { method: 'POST' });
      const data = await readJsonResponse<Partial<ConfigPathInfo> & { message?: string }>(response);
      setHasBackup(true);
      setConfigPathInfo(current => ({
        ...current,
        configPath: data.configPath || current.configPath,
        backupPath: data.backupPath || current.backupPath,
      }));
      setMessage({ type: 'success', text: data.message || '已建立手動備份。' });
    } catch (error) {
      setMessage({ type: 'error', text: `無法建立手動備份：${getErrorMessage(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings/restore', { method: 'POST' });
      await readJsonResponse(response);
      await loadConfigs();
      setMessage({ type: 'success', text: '已從 .bak 備份還原 PixivUtil2 設定。' });
      onSettingsSaved();
    } catch (error) {
      setMessage({ type: 'error', text: `無法還原備份：${getErrorMessage(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleRescanDirectory = async () => {
    if (isLibraryJobActive(libraryJob)) return;
    setScanning(true);
    setMessage(null);
    try {
      const response = await fetch('/api/library/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'update-library',
          directory: rootDirectory,
          analyze_colors: webConfig.analyzeColorsAfterLibraryUpdate,
        }),
      });
      const data = await readJsonResponse<LibraryJobResponse>(response);
      if (!data.job) throw new Error('工作未成功建立。');
      setLibraryJob(data.job);
      setMessage({ type: 'success', text: '圖片資料庫更新已開始。' });
      window.dispatchEvent(new Event('web-viewer-library-job-changed'));
      stopLibraryPolling();
      void pollLibraryJob(data.job.job_id);
    } catch (error) {
      setMessage({ type: 'error', text: `更新圖片資料庫失敗：${getErrorMessage(error)}` });
      setScanning(false);
    }
  };

  const handleUpdateSelectedArtists = async () => {
    if (libraryJobIsBusy || selectedArtistIds.length === 0) return;
    setScanning(true);
    setMessage(null);
    try {
      const response = await fetch('/api/library/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'update-library',
          member_ids: selectedArtistIds,
          analyze_colors: webConfig.analyzeColorsAfterLibraryUpdate,
          priority: 20,
        }),
      });
      const data = await readJsonResponse<LibraryJobResponse>(response);
      if (!data.job) throw new Error('無法建立繪師更新工作。');
      setLibraryJob(data.job);
      setMessage({ type: 'success', text: `已排程 ${selectedArtistIds.length} 位繪師的背景更新。` });
      window.dispatchEvent(new Event('web-viewer-library-job-changed'));
      stopLibraryPolling();
      void pollLibraryJob(data.job.job_id);
    } catch (error) {
      setMessage({ type: 'error', text: `無法排程繪師更新：${getErrorMessage(error)}` });
    } finally {
      setScanning(false);
    }
  };

  const handleAnalyzeMissingColors = async () => {
    if (libraryJobIsBusy) return;
    setScanning(true);
    setMessage(null);
    try {
      const response = await fetch('/api/library/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'analyze-missing-colors',
          directory: rootDirectory,
        }),
      });
      const data = await readJsonResponse<LibraryJobResponse>(response);
      if (!data.job) throw new Error('工作未成功建立。');
      setLibraryJob(data.job);
      setMessage({ type: 'success', text: '圖片色彩分析已開始。' });
      window.dispatchEvent(new Event('web-viewer-library-job-changed'));
      stopLibraryPolling();
      void pollLibraryJob(data.job.job_id);
    } catch (error) {
      setMessage({ type: 'error', text: `開始圖片色彩分析失敗：${getErrorMessage(error)}` });
      setScanning(false);
    }
  };

  const handleOrganizeThumbnailCache = async () => {
    if (libraryJobIsBusy) return;
    setScanning(true);
    setMessage(null);
    try {
      const response = await fetch('/api/library/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'organize-thumbnail-cache',
          directory: rootDirectory,
        }),
      });
      const data = await readJsonResponse<LibraryJobResponse>(response);
      if (!data.job) throw new Error('工作未成功建立。');
      setLibraryJob(data.job);
      setMessage({ type: 'success', text: '縮圖整理已開始。' });
      window.dispatchEvent(new Event('web-viewer-library-job-changed'));
      stopLibraryPolling();
      void pollLibraryJob(data.job.job_id);
    } catch (error) {
      setMessage({ type: 'error', text: `開始縮圖整理失敗：${getErrorMessage(error)}` });
      setScanning(false);
    }
  };

  const handleRestoreThumbnailCache = async (jobId: string) => {
    if (libraryJobIsBusy) return;
    setThumbnailCacheLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/library/cache/${encodeURIComponent(jobId)}/restore`, { method: 'POST' });
      const data = await readJsonResponse<{ restored: number; conflicts: number }>(response);
      const conflictText = data.conflicts > 0 ? `，${data.conflicts} 個檔案因同名新快取而略過` : '';
      setMessage({ type: 'success', text: `已還原 ${data.restored} 個縮圖${conflictText}。` });
      await loadThumbnailCacheStats();
    } catch (error) {
      setMessage({ type: 'error', text: `無法還原縮圖：${getErrorMessage(error)}` });
    } finally {
      setThumbnailCacheLoading(false);
    }
  };

  const handleHardDeleteThumbnailCache = async () => {
    if (!hardDeleteTarget || libraryJobIsBusy) return;
    setHardDeleteLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/library/cache/${encodeURIComponent(hardDeleteTarget.job_id)}`, {
        method: 'DELETE',
      });
      const data = await readJsonResponse<{
        deleted: number;
        bytes_freed: number;
        remaining: number;
        errors: string[];
      }>(response);
      setHardDeleteTarget(null);
      setExpandedRecoveryJobId(null);
      setRecoveryDetails(null);
      await loadThumbnailCacheStats();
      if (data.errors.length > 0) {
        setMessage({
          type: 'error',
          text: `已將 ${data.deleted} 個縮圖送到資源回收筒、釋放 ${formatBytes(data.bytes_freed)}；仍有 ${data.remaining} 個檔案未完成。`,
        });
      } else {
        setMessage({
          type: 'success',
          text: `已將 ${data.deleted} 個縮圖送到資源回收筒，釋放 ${formatBytes(data.bytes_freed)}。原始圖片不受影響。`,
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `無法將縮圖送到資源回收筒：${getErrorMessage(error)}` });
    } finally {
      setHardDeleteLoading(false);
    }
  };

  const handleCancelLibraryJob = async () => {
    if (!libraryJob || !isLibraryJobActive(libraryJob)) return;
    try {
      const response = await fetch(`/api/library/jobs/${encodeURIComponent(libraryJob.job_id)}/cancel`, {
        method: 'POST',
      });
      const data = await readJsonResponse<LibraryJobResponse>(response);
      if (data.job) setLibraryJob(data.job);
      setMessage({ type: 'success', text: '已要求停止圖片資料庫更新。' });
    } catch (error) {
      setMessage({ type: 'error', text: `無法停止圖片資料庫更新：${getErrorMessage(error)}` });
    }
  };

  const updatePixivValue = (section: string, option: string, value: string) => {
    setPixivSections(current => ({
      ...current,
      [section]: {
        ...current[section],
        [option]: value,
      },
    }));
  };

  const filteredSectionGroups = useMemo(() => {
    if (!isSearching) {
      if (!activeSection || !pixivSections[activeSection]) return [];
      return [{ section: activeSection, entries: Object.entries(pixivSections[activeSection]) }];
    }

    const query = sectionFilter.trim().toLocaleLowerCase();
    return Object.entries(pixivSections)
      .map(([sectionName, options]) => {
        const sectionMetadata = getSectionMetadata(sectionName);
        const sectionMatches = [
          sectionName,
          sectionMetadata?.eng_category,
          sectionMetadata?.zh_category,
          sectionMetadata?.description,
        ].some(value => value?.toLocaleLowerCase().includes(query));

        const entries = Object.entries(options).filter(([option, value]) => {
          if (sectionMatches) return true;
          const fieldMetadata = getFieldMetadata(sectionName, option);
          return [option, value, fieldMetadata.label, fieldMetadata.description]
            .some(candidate => candidate.toLocaleLowerCase().includes(query));
        });

        return { section: sectionName, entries };
      })
      .filter(group => group.entries.length > 0);
  }, [activeSection, isSearching, pixivSections, sectionFilter]);

  const matchedFieldCount = filteredSectionGroups.reduce((total, group) => total + group.entries.length, 0);
  const libraryJobIsActive = isLibraryJobActive(libraryJob);
  const libraryJobIsBusy = scanning || libraryJobIsActive;
  const libraryProgress = libraryJob?.total && libraryJob.total > 0
    ? Math.min(100, Math.round((libraryJob.processed / libraryJob.total) * 100))
    : null;

  const renderFieldControl = (
    sectionName: string,
    optionName: string,
    value: string,
    metadata: PixivConfigFieldMetadata,
    fieldId: string,
  ) => {
    const descriptionId = `${fieldId}-description`;
    const update = (nextValue: string) => updatePixivValue(sectionName, optionName, nextValue);

    if (metadata.path) {
      return (
        <div className="space-y-1.5">
          <PathPickerField
            id={fieldId}
            label={metadata.label}
            value={value}
            metadata={metadata.path}
            descriptionId={descriptionId}
            onChange={update}
            inputClassName={inputClass}
          />
          {metadata.path.purpose === 'root-directory' && (
            <button type="button" onClick={() => setMainTab('library')} className="settings-modal__text-link text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
              前往媒體資料庫
            </button>
          )}
        </div>
      );
    }

    if (metadata.kind === 'boolean') {
      return (
        <label
          htmlFor={fieldId}
          className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm"
        >
          <input
            id={fieldId}
            type="checkbox"
            checked={value.toLowerCase() === 'true'}
            onChange={event => update(event.target.checked ? 'True' : 'False')}
            aria-labelledby={`${fieldId}-label`}
            aria-describedby={descriptionId}
            className="settings-modal__checkbox h-4 w-4 rounded focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <span>{value.toLowerCase() === 'true' ? '已啟用（True）' : '未啟用（False）'}</span>
        </label>
      );
    }

    if (metadata.kind === 'textarea') {
      return (
        <textarea
          id={fieldId}
          value={value}
          onChange={event => update(event.target.value)}
          rows={2}
          aria-describedby={descriptionId}
          spellCheck={false}
          className={`${inputClass} min-h-20 resize-y font-mono text-xs leading-5`}
        />
      );
    }

    return (
      <input
        id={fieldId}
        type={metadata.kind === 'number' ? 'number' : metadata.secret ? 'password' : 'text'}
        value={value}
        onChange={event => update(event.target.value)}
        aria-describedby={descriptionId}
        autoComplete="off"
        spellCheck={false}
        className={`${inputClass} ${metadata.kind === 'number' || metadata.secret ? 'font-mono text-xs' : ''}`}
      />
    );
  };

  const renderSectionGroup = (sectionName: string, entries: [string, string][]) => {
    const sectionMetadata = getSectionMetadata(sectionName);
    const headingId = `pixiv-section-${sectionName.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

    return (
      <section key={sectionName} aria-labelledby={headingId} className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 id={headingId} className="settings-modal__heading text-sm font-bold">
            [{sectionMetadata?.eng_category || sectionName}] {sectionMetadata?.zh_category || '自訂分類'}
          </h4>
          <span className="settings-modal__text-subtle font-mono text-[11px]">{entries.length} 個欄位</span>
        </div>
        <p className="settings-modal__description text-xs leading-5">
          {sectionMetadata?.description || '這是 PixivUtil2 的自訂設定分類。'}
        </p>
        <div className="space-y-2">
          {entries.map(([optionName, value]) => {
            const metadata = getFieldMetadata(sectionName, optionName);
            const fieldId = `pixiv-field-${sectionName}-${optionName}`.replace(/[^a-zA-Z0-9_-]/g, '-');
            const descriptionId = `${fieldId}-description`;

            return (
              <div
                key={`${sectionName}-${optionName}`}
                className="settings-modal__field-card rounded-xl p-3 shadow-sm"
              >
                <div className="grid gap-3 md:grid-cols-[minmax(180px,0.9fr)_minmax(0,1.5fr)] md:items-start">
                  <div className="min-w-0">
                    {metadata.kind === 'boolean' ? (
                      <div id={`${fieldId}-label`} className="settings-modal__label block text-sm font-semibold">
                        {metadata.label}
                      </div>
                    ) : (
                      <label htmlFor={fieldId} className="settings-modal__label block text-sm font-semibold">
                        {metadata.label}
                      </label>
                    )}
                    <code className="settings-modal__code mt-1 block break-all text-[11px]">{optionName}</code>
                    <p id={descriptionId} className="settings-modal__description mt-2 text-xs leading-5">
                      {metadata.description}
                    </p>
                  </div>
                  <div>{renderFieldControl(sectionName, optionName, value, metadata, fieldId)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const handleSectionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }

    event.preventDefault();
    if (sectionKeys.length === 0) return;

    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? sectionKeys.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + sectionKeys.length) % sectionKeys.length;
    const nextSection = sectionKeys[nextIndex];
    setSectionFilter('');
    setActiveSection(nextSection);
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(`[data-pixiv-section-tab="${CSS.escape(nextSection)}"]`)?.focus();
    }, 0);
  };

  const handleMainTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }

    event.preventDefault();
    const tabs: MainTab[] = ['web', 'library', 'pixiv', 'backup'];
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setMainTab(nextTab);
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(`[data-main-tab="${nextTab}"]`)?.focus();
    }, 0);
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const handleSaveConfirmBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setShowSaveConfirm(false);
  };

  const handleHardDeleteBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !hardDeleteLoading) setHardDeleteTarget(null);
  };

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={handleBackdropClick}
      className="settings-modal fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="settings-modal__panel flex min-h-0 max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-2xl"
      >
        <div className="settings-modal__header flex min-h-16 shrink-0 items-center justify-between py-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="settings-modal__title-icon">
              <Settings className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="settings-modal-title" className="settings-modal__title truncate text-lg font-bold">
              PixivUtil2 與 Web Viewer 設定
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉設定"
            className="settings-modal__close transition-[color,background-color] focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <X className="mx-auto h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {message && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`settings-modal__message flex shrink-0 items-start gap-2 border-b px-6 py-3 text-sm ${
              message.type === 'success'
                ? 'is-success'
                : 'is-error'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="break-words">{message.text}</span>
          </div>
        )}

        <div role="tablist" aria-label="設定分類" className="settings-modal__tabs flex shrink-0 overflow-x-auto px-4 pt-2">
          {([
            ['web', '顯示與瀏覽', Sliders],
            ['library', '媒體資料庫', Database],
            ['pixiv', 'PixivUtil2 config.ini', Settings],
            ['backup', '備份與維護', Shield],
          ] as const).map(([tab, label, Icon], index) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`settings-tab-${tab}`}
              aria-selected={mainTab === tab}
              aria-controls={`settings-panel-${tab}`}
              tabIndex={mainTab === tab ? 0 : -1}
              data-main-tab={tab}
              onClick={() => setMainTab(tab)}
              onKeyDown={event => handleMainTabKeyDown(event, index)}
              className={tabClass(mainTab === tab)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="settings-modal__content min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          {mainTab === 'web' && (
            <section id="settings-panel-web" role="tabpanel" aria-labelledby="settings-tab-web" className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="settings-modal__heading text-base font-bold">顯示與瀏覽</h3>
                  <p className="settings-modal__description mt-1 text-sm leading-5">調整檢視器的外觀、縮圖與瀏覽行為。</p>
                </div>
                {onOpenRecycleBin && (
                  <button
                    type="button"
                    onClick={onOpenRecycleBin}
                    className="settings-modal__secondary-button inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    開啟回收區
                  </button>
                )}
              </div>

              {hiddenArtists.length > 0 && (
                <section className="settings-modal__hidden-artists space-y-2" aria-labelledby="hidden-artists-title">
                  <div className="flex items-center justify-between gap-3">
                    <h4 id="hidden-artists-title" className="settings-modal__label text-sm font-semibold">已隱藏繪師</h4>
                    <span className="settings-modal__text-subtle text-xs">{hiddenArtists.length} 位</span>
                  </div>
                  <div className="space-y-2">
                    {hiddenArtists.map(artist => (
                      <div key={artist.member_id} className="settings-modal__hidden-artist-row flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2">
                        <span className="min-w-0 truncate text-xs" title={artist.folder_name || undefined}>{artist.folder_name || `繪師 ${artist.member_id}`}</span>
                        <button
                          type="button"
                          onClick={() => void handleUnhideArtist(artist)}
                          className="settings-modal__secondary-button min-h-10 rounded-lg px-3 py-2 text-xs font-semibold"
                        >
                          恢復顯示
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="web-theme" className="settings-modal__label mb-1.5 block text-sm font-semibold">主題</label>
                  <CustomSelect
                    id="web-theme"
                    value={webConfig.webTheme}
                    options={themeOptions}
                    onChange={webTheme => setWebConfig(current => ({ ...current, webTheme }))}
                    ariaLabel="主題"
                    className="w-full"
                    buttonClassName={selectClass}
                    style={{ '--select-icon-color': 'var(--settings-text-muted)', '--select-icon-focus-color': 'var(--settings-accent)' } as React.CSSProperties}
                  />
                </div>
                <div>
                  <label htmlFor="thumbnail-size" className="settings-modal__label mb-1.5 block text-sm font-semibold">縮圖尺寸 (thumbnailSize)</label>
                  <input id="thumbnail-size" type="number" min={16} max={4096} value={webConfig.thumbnailSize} onChange={event => setWebConfig(current => ({ ...current, thumbnailSize: Number(event.target.value) }))} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="items-per-page" className="settings-modal__label mb-1.5 block text-sm font-semibold">每頁顯示數量</label>
                  <input id="items-per-page" type="number" min={1} max={5000} value={webConfig.itemsPerPage} onChange={event => setWebConfig(current => ({ ...current, itemsPerPage: Number(event.target.value) }))} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="preload-image-count" className="settings-modal__label mb-1.5 block text-sm font-semibold">全螢幕預載張數</label>
                  <input id="preload-image-count" type="number" min={0} max={10} value={webConfig.preloadImageCount} onChange={event => setWebConfig(current => ({ ...current, preloadImageCount: Number(event.target.value) }))} className={inputClass} />
                </div>
              </div>

              <div className="space-y-3">
                <label htmlFor="group-manga-posts" className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm">
                  <input id="group-manga-posts" type="checkbox" checked={!!webConfig.groupMangaPosts} onChange={event => setWebConfig(current => ({ ...current, groupMangaPosts: event.target.checked }))} className="settings-modal__checkbox h-4 w-4 rounded focus-visible:outline-2 focus-visible:outline-offset-2" />
                  <span>將漫畫作品合併成作品群組</span>
                </label>
                <label htmlFor="auto-open-browser" className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm">
                  <input id="auto-open-browser" type="checkbox" checked={!!webConfig.autoOpenBrowser} onChange={event => setWebConfig(current => ({ ...current, autoOpenBrowser: event.target.checked }))} className="settings-modal__checkbox h-4 w-4 rounded focus-visible:outline-2 focus-visible:outline-offset-2" />
                  <span>啟動時自動開啟瀏覽器</span>
                </label>
                <label htmlFor="blur-enabled" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm">
                  <input id="blur-enabled" type="checkbox" checked={!!webConfig.blurEnabled} onChange={event => setWebConfig(current => ({ ...current, blurEnabled: event.target.checked }))} className="settings-modal__checkbox mt-0.5 h-4 w-4 shrink-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2" />
                  <span className="min-w-0">
                    <span className="block font-semibold">套用模糊遮罩</span>
                    <span className="settings-modal__description mt-1 block text-xs leading-5">在縮圖、條漫與全螢幕預覽套用模糊遮罩。</span>
                  </span>
                </label>
              </div>

              <button type="button" onClick={handleSaveWebConfig} disabled={loading} className="settings-modal__primary-button inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold">
                <Save className="h-4 w-4" aria-hidden="true" />
                {loading ? '儲存中…' : '儲存顯示與瀏覽設定'}
              </button>
            </section>
          )}

          {mainTab === 'library' && (
            <section id="settings-panel-library" role="tabpanel" aria-labelledby="settings-tab-library" className="settings-modal__library space-y-8">
              <div>
                <h3 className="settings-modal__heading text-base font-bold">媒體資料庫</h3>
                <p className="settings-modal__description mt-1 text-sm leading-5">管理圖片清單、背景工作與縮圖儲存空間。</p>
              </div>

              <section aria-labelledby="media-library-images-title" className="settings-modal__library-section space-y-4">
                <div>
                  <h4 id="media-library-images-title" className="settings-modal__heading text-sm font-bold">圖片資料庫</h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">尋找新增或變更的圖片，更新 Web Viewer 使用的圖片清單。不會修改或刪除原始圖片。</p>
                </div>

                <div className="settings-modal__library-source flex min-w-0 flex-col gap-1 rounded-xl p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <span className="settings-modal__text-subtle block text-xs font-semibold">圖片資料夾</span>
                    <code className="settings-modal__library-path mt-1 block break-all font-mono text-xs">{rootDirectory}</code>
                  </div>
                  <span className="settings-modal__library-source-label shrink-0 text-xs">唯讀來源</span>
                </div>
                <p className="settings-modal__description text-xs leading-5">路徑來自 PixivUtil2 的 rootDirectory 設定。</p>

                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={handleRescanDirectory} disabled={libraryJobIsBusy} className="settings-modal__primary-button inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold">
                    <RefreshCw className={`settings-modal__library-status-icon h-4 w-4 ${libraryJobIsBusy ? 'is-active' : ''}`} aria-hidden="true" />
                    {libraryJobIsBusy ? '更新中…' : '更新圖片資料庫'}
                  </button>
                  <span className="settings-modal__description text-xs">工作會在背景執行，完成或取消時會保留已處理的資料。</span>
                </div>

                <div className="settings-modal__library-options space-y-3 rounded-xl p-4" aria-label="圖片色彩分析功能">
                  <div className="space-y-3" role="group" aria-labelledby="selected-artists-title" aria-describedby="selected-artists-help">
                    <div>
                      <h5 id="selected-artists-title" className="settings-modal__heading text-sm font-semibold">更新選取的繪師</h5>
                      <p id="selected-artists-help" className="settings-modal__description mt-1 text-xs leading-5">
                        選取一位或多位繪師；更新會在背景執行，既有索引可繼續瀏覽。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="settings-modal__secondary-button min-h-10 rounded-lg px-3 py-2 text-xs font-semibold"
                        onClick={() => setSelectedArtistIds(artists.filter(artist => artist.member_id > 0).map(artist => artist.member_id))}
                        disabled={libraryJobIsBusy || artists.length === 0}
                      >
                        選取全部繪師
                      </button>
                      <button
                        type="button"
                        className="settings-modal__secondary-button min-h-10 rounded-lg px-3 py-2 text-xs font-semibold"
                        onClick={() => setSelectedArtistIds([])}
                        disabled={libraryJobIsBusy || selectedArtistIds.length === 0}
                      >
                        清除選取
                      </button>
                    </div>
                    {artists.length > 0 ? (
                      <div className="max-h-56 overflow-y-auto overscroll-contain space-y-1 pr-1">
                        {artists.filter(artist => artist.member_id > 0).map(artist => {
                          const checked = selectedArtistIds.includes(artist.member_id);
                          const inputId = `library-artist-${artist.member_id}`;
                          return (
                            <label key={artist.member_id} htmlFor={inputId} className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm">
                              <input
                                id={inputId}
                                type="checkbox"
                                checked={checked}
                                onChange={() => setSelectedArtistIds(current => checked
                                  ? current.filter(memberId => memberId !== artist.member_id)
                                  : [...current, artist.member_id])}
                                disabled={libraryJobIsBusy}
                                className="settings-modal__checkbox h-4 w-4 shrink-0 rounded"
                              />
                              <span className="min-w-0 flex-1 truncate">{artist.name || `繪師 ${artist.member_id}`}</span>
                              <span className="settings-modal__text-subtle shrink-0 text-xs">{artist.artwork_count.toLocaleString()}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="settings-modal__text-subtle text-xs">目前沒有可更新的繪師。</p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleUpdateSelectedArtists()}
                      disabled={libraryJobIsBusy || selectedArtistIds.length === 0}
                      aria-describedby="selected-artists-help"
                      className="settings-modal__secondary-button inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                    >
                      <RefreshCw className={`h-4 w-4 ${scanning && selectedArtistIds.length > 0 ? 'is-active' : ''}`} aria-hidden="true" />
                      更新選取的繪師（{selectedArtistIds.length}）
                    </button>
                  </div>

                  <label htmlFor="analyze-colors-after-update" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm">
                    <input
                      id="analyze-colors-after-update"
                      type="checkbox"
                      checked={webConfig.analyzeColorsAfterLibraryUpdate}
                      onChange={event => setWebConfig(current => ({ ...current, analyzeColorsAfterLibraryUpdate: event.target.checked }))}
                      disabled={libraryJobIsBusy}
                      className="settings-modal__checkbox mt-0.5 h-4 w-4 shrink-0 rounded"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">更新後分析圖片色彩</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">更新工作完成後，會在背景分析目前圖片的色彩。</span>
                    </span>
                  </label>
                  <button type="button" onClick={handleAnalyzeMissingColors} disabled={libraryJobIsBusy} className="settings-modal__secondary-button inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold">
                    只分析缺少的圖片色彩
                  </button>
                  <p className="settings-modal__text-subtle text-xs leading-5">在背景分析尚未處理的圖片，讓圖片載入前先顯示相近的背景色。</p>
                </div>
              </section>

              <section aria-labelledby="media-library-jobs-title" className="settings-modal__library-section space-y-4">
                <div>
                  <h4 id="media-library-jobs-title" className="settings-modal__heading text-sm font-bold">背景工作</h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">這裡會顯示目前工作、處理進度與錯誤統計。</p>
                </div>
                <div className="settings-modal__library-status flex items-start gap-3 rounded-xl p-4" role="status" aria-live="polite" aria-atomic="true">
                  <RefreshCw className={`settings-modal__library-status-icon mt-0.5 h-4 w-4 shrink-0 ${libraryJobIsBusy ? 'is-active' : ''}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="settings-modal__library-status-title text-sm font-semibold">{getLibraryJobStatusTitle(libraryJob)}</p>
                    <p className="settings-modal__description mt-1 text-xs leading-5">{getLibraryJobStatusDescription(libraryJob)}</p>
                    {libraryJob && (libraryJobIsActive || libraryJob.errors > 0 || libraryJob.conflicts > 0) && (
                      <p className="settings-modal__text-subtle mt-2 text-xs leading-5">
                        {libraryJobIsActive
                          ? `已處理 ${libraryJob.processed} / ${libraryJob.total ?? '…'} 張，錯誤 ${libraryJob.errors} 個，衝突 ${libraryJob.conflicts} 個。`
                          : `錯誤 ${libraryJob.errors} 個，衝突 ${libraryJob.conflicts} 個。`}
                      </p>
                    )}
                    {libraryProgress !== null && libraryJobIsActive && (
                      <div
                        className="settings-modal__library-progress mt-3"
                        role="progressbar"
                        aria-label="圖片資料庫更新進度"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={libraryProgress}
                      >
                        <span className="settings-modal__library-progress-bar" style={{ width: `${libraryProgress}%` }} />
                      </div>
                    )}
                    {libraryJobIsActive && libraryJob?.status === 'cancelling' && (
                      <button type="button" disabled className="settings-modal__secondary-button mt-3 min-h-10 rounded-lg px-3 py-2 text-xs font-semibold">
                        正在停止…
                      </button>
                    )}
                    {libraryJobIsActive && libraryJob?.status !== 'cancelling' && (
                      <button type="button" onClick={handleCancelLibraryJob} className="settings-modal__secondary-button mt-3 min-h-10 rounded-lg px-3 py-2 text-xs font-semibold">
                        取消工作
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <section aria-labelledby="media-library-cache-title" className="settings-modal__library-section space-y-4">
                <div>
                  <h4 id="media-library-cache-title" className="settings-modal__heading text-sm font-bold">縮圖儲存空間</h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">只管理 Web Viewer 使用中的縮圖；原始圖片不會被修改或刪除。</p>
                </div>
                <div className="settings-modal__cache-summary flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl p-4" aria-live="polite">
                  <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p className="min-w-0 flex-1 text-sm font-semibold">
                    {thumbnailCacheLoading ? '讀取縮圖容量中…' : `${formatBytes(thumbnailCacheStats.active_bytes)}・${thumbnailCacheStats.active_files.toLocaleString()} 個縮圖`}
                  </p>
                  <span className="settings-modal__text-subtle w-full text-xs">已追蹤來源版本：{thumbnailCacheStats.tracked_files.toLocaleString()} 個</span>
                </div>
                <div className="settings-modal__library-options space-y-3 rounded-xl p-4">
                  <label htmlFor="manage-thumbnail-cache" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm">
                    <input
                      id="manage-thumbnail-cache"
                      type="checkbox"
                      checked={webConfig.manageThumbnailCache}
                      onChange={event => setWebConfig(current => ({ ...current, manageThumbnailCache: event.target.checked }))}
                      disabled={libraryJobIsBusy}
                      className="settings-modal__checkbox mt-0.5 h-4 w-4 shrink-0 rounded"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">自動管理縮圖空間</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">圖片資料庫更新完成後，依空間上限整理無來源、舊版本、舊尺寸與最久未使用的縮圖。</span>
                    </span>
                  </label>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-44">
                      <label htmlFor="thumbnail-cache-limit" className="settings-modal__label mb-1.5 block text-sm font-semibold">空間上限（MiB）</label>
                      <input
                        id="thumbnail-cache-limit"
                        type="number"
                        min={128}
                        max={102400}
                        step={128}
                        value={webConfig.thumbnailCacheLimitMiB}
                        onChange={event => setWebConfig(current => ({ ...current, thumbnailCacheLimitMiB: Number(event.target.value) }))}
                        disabled={libraryJobIsBusy}
                        className={`${inputClass} max-w-52`}
                      />
                    </div>
                    <button type="button" onClick={handleSaveWebConfig} disabled={loading || libraryJobIsBusy} className="settings-modal__secondary-button inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold">
                      <Save className="h-4 w-4" aria-hidden="true" />
                      儲存快取設定
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={handleOrganizeThumbnailCache} disabled={libraryJobIsBusy} className="settings-modal__secondary-button inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold">
                    <RefreshCw className={`h-4 w-4 ${libraryJob?.phase === 'organizing_cache' ? 'is-active' : ''}`} aria-hidden="true" />
                    整理縮圖
                  </button>
                  <span className="settings-modal__description text-xs">整理只會移到可復原位置，不代表已釋放整體磁碟空間。</span>
                </div>
                {thumbnailCacheStats.recovery_jobs.some(job => job.restorable) && (
                  <div className="settings-modal__cache-recovery space-y-2" aria-label="可復原的縮圖整理">
                    <div>
                      <p className="settings-modal__text-subtle text-xs font-semibold">可復原位置</p>
                      <p className="settings-modal__description mt-1 text-xs leading-5">點選「查看內容」可預覽這批縮圖，並查看來源檔案、尺寸、容量與整理原因。</p>
                    </div>
                    {thumbnailCacheStats.recovery_jobs.filter(job => job.restorable).map(job => {
                      const isExpanded = expandedRecoveryJobId === job.job_id;
                      const detailsForJob = recoveryDetails?.job_id === job.job_id ? recoveryDetails : null;
                      const visibleStart = detailsForJob ? detailsForJob.offset + 1 : 0;
                      const visibleEnd = detailsForJob
                        ? detailsForJob.offset + detailsForJob.entries.length
                        : 0;
                      return (
                        <React.Fragment key={job.job_id}>
                          <div className="settings-modal__cache-recovery-row flex flex-wrap items-start justify-between gap-3 rounded-lg px-3 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold">{job.recoverable_files.toLocaleString()} 個縮圖・{formatBytes(job.recoverable_bytes)}</p>
                              <p className="settings-modal__description mt-1 text-xs leading-5">
                                整理於 {formatDateTime(job.created_at)}；目前仍占用磁碟空間。
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleRecoveryDetails(job.job_id)}
                                aria-expanded={isExpanded}
                                aria-controls={`thumbnail-cache-recovery-${job.job_id}`}
                                className="settings-modal__secondary-button inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-[background-color,transform] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                {isExpanded ? '收合內容' : '查看內容'}
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                              </button>
                              <button type="button" onClick={() => handleRestoreThumbnailCache(job.job_id)} disabled={thumbnailCacheLoading || libraryJobIsBusy} className="settings-modal__secondary-button min-h-10 rounded-lg px-3 py-2 text-xs font-semibold transition-[background-color,transform] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2">
                                {thumbnailCacheLoading ? '處理中…' : '還原'}
                              </button>
                              <button type="button" onClick={() => setHardDeleteTarget(job)} disabled={thumbnailCacheLoading || libraryJobIsBusy} className="settings-modal__danger-button inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-[background-color,transform] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2">
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                送到資源回收筒
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div id={`thumbnail-cache-recovery-${job.job_id}`} className="settings-modal__cache-recovery-detail space-y-3 rounded-2xl p-3">
                              {recoveryDetailsLoading && (
                                <p className="settings-modal__description px-1 py-2 text-xs">讀取縮圖內容中…</p>
                              )}
                              {!recoveryDetailsLoading && detailsForJob && (
                                <>
                                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                                    <span className="settings-modal__text-subtle">
                                      顯示 {visibleStart.toLocaleString()}–{visibleEnd.toLocaleString()} / {detailsForJob.total.toLocaleString()} 個縮圖
                                    </span>
                                    <span className="settings-modal__text-subtle">這批共 {formatBytes(detailsForJob.total_bytes)}</span>
                                  </div>
                                  {detailsForJob.entries.length > 0 ? (
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                      {detailsForJob.entries.map(entry => {
                                        const displayName = entry.source_path ? getPathFileName(entry.source_path) : entry.recovery_name;
                                        return (
                                          <article key={entry.recovery_name} className="settings-modal__cache-detail-card overflow-hidden rounded-xl">
                                            <div className="settings-modal__cache-detail-preview">
                                              <img
                                                src={`/api/library/cache/${encodeURIComponent(job.job_id)}/preview/${encodeURIComponent(entry.recovery_name)}`}
                                                alt={`縮圖預覽：${displayName}`}
                                                loading="lazy"
                                              />
                                            </div>
                                            <div className="space-y-1.5 p-3 text-xs">
                                              <p className="truncate text-sm font-semibold" title={entry.source_path || entry.recovery_name}>{displayName}</p>
                                              <p className="settings-modal__text-subtle">
                                                縮圖 {formatBytes(entry.cache_bytes)}・{entry.width && entry.height ? `${entry.width} × ${entry.height}` : '尺寸未知'}
                                              </p>
                                              <p className="settings-modal__text-subtle truncate" title={entry.recovery_name}>快取檔案：{entry.recovery_name}</p>
                                              <p className="settings-modal__text-subtle">來源檔案：{entry.source_file_size ? formatBytes(entry.source_file_size) : '大小未知'}</p>
                                              <p className="settings-modal__text-subtle">原因：{getRecoveryReasonLabel(entry.reason)}</p>
                                              <p className="settings-modal__text-subtle truncate" title={entry.source_path || undefined}>來源：{entry.source_path || '未追蹤'}</p>
                                            </div>
                                          </article>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="settings-modal__description px-1 py-2 text-xs">目前找不到可預覽的縮圖，可能已被其他程序移除。</p>
                                  )}
                                  <div className="flex items-center justify-between gap-3 px-1 pt-1">
                                    <button type="button" onClick={() => handleRecoveryPageChange(job.job_id, Math.max(0, detailsForJob.offset - detailsForJob.limit))} disabled={detailsForJob.offset === 0 || recoveryDetailsLoading} className="settings-modal__secondary-button inline-flex min-h-10 items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-[background-color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">
                                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                                      上一頁
                                    </button>
                                    <span className="settings-modal__text-subtle text-xs">第 {Math.floor(detailsForJob.offset / detailsForJob.limit) + 1} 頁</span>
                                    <button type="button" onClick={() => handleRecoveryPageChange(job.job_id, detailsForJob.offset + detailsForJob.limit)} disabled={!detailsForJob.has_more || recoveryDetailsLoading} className="settings-modal__secondary-button inline-flex min-h-10 items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-[background-color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">
                                      下一頁
                                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </section>
            </section>
          )}

          {mainTab === 'pixiv' && (
            <section id="settings-panel-pixiv" role="tabpanel" aria-labelledby="settings-tab-pixiv" className="space-y-6">
              <div className="settings-modal__info-card rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="settings-modal__info-title text-base font-bold">PixivUtil2 設定檔位置</h3>
                    <p className="settings-modal__info-description mt-1 text-sm leading-5">
                      留白會使用預設位置；填寫完整路徑後，下面的分類與欄位會改讀該份 config.ini。
                    </p>
                  </div>
                  <span className="settings-modal__badge rounded-full px-2.5 py-1 text-xs font-semibold">
                    {configPathInfo.usingDefaultPath ? '使用預設位置' : '使用自訂位置'}
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  <label htmlFor="pixiv-config-path" className="settings-modal__label block text-sm font-semibold">config.ini 路徑</label>
                  <PathPickerField
                    id="pixiv-config-path"
                    label="config.ini 路徑"
                    value={webConfig.pixivConfigPath || ''}
                    placeholder="留白：使用預設位置"
                    metadata={{ mode: 'existing-file', purpose: 'pixiv-config', extensions: ['.ini'], access: 'read' }}
                    onChange={value => setWebConfig(current => ({ ...current, pixivConfigPath: value }))}
                    onClear={() => setWebConfig(current => ({ ...current, pixivConfigPath: '' }))}
                    clearLabel="使用預設位置"
                    inputClassName={inputClass}
                  />
                  <p className="settings-modal__description break-all text-xs leading-5">
                    目前讀取：<code className="settings-modal__code">{configPathInfo.configPath || '載入中…'}</code>
                    <br />
                    預設位置：<code className="settings-modal__code">{configPathInfo.defaultConfigPath || '載入中…'}</code>
                  </p>
                  <button type="button" onClick={handleSaveConfigPath} disabled={loading} className="settings-modal__primary-button mt-2 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {loading ? '載入中…' : '儲存路徑並重新載入'}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative min-w-0 flex-1">
                    <label htmlFor="pixiv-config-search" className="sr-only">搜尋整份 config.ini</label>
                    <Search className="settings-modal__input-icon pointer-events-none absolute start-3 top-3 h-4 w-4" aria-hidden="true" />
                    <input
                      id="pixiv-config-search"
                      type="search"
                      value={sectionFilter}
                      onChange={event => {
                        const nextValue = event.target.value;
                        setSectionFilter(nextValue);
                        if (nextValue.trim()) {
                          setActiveSection('');
                        } else {
                          setActiveSection(sectionKeys.includes('Settings') ? 'Settings' : sectionKeys[0] || '');
                        }
                      }}
                      placeholder="搜尋整份 config.ini：分類、欄位、值或說明"
                      autoComplete="off"
                      className={`${inputClass} ps-9`}
                    />
                  </div>
                </div>

                <div className="settings-modal__section-tabs flex flex-wrap gap-1.5 pb-2" role="tablist" aria-label="PixivUtil2 config.ini 分類">
                  {sectionKeys.map((sectionName, index) => {
                    const selected = !isSearching && activeSection === sectionName;
                    const sectionMetadata = getSectionMetadata(sectionName);
                    return (
                      <button
                        key={sectionName}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls="pixiv-config-panel"
                        tabIndex={isSearching || selected ? 0 : -1}
                        data-pixiv-section-tab={sectionName}
                        onClick={() => {
                          setSectionFilter('');
                          setActiveSection(sectionName);
                        }}
                        onKeyDown={event => handleSectionKeyDown(event, index)}
                        className={`settings-modal__section-tab min-h-10 rounded-md px-3 py-2 text-xs font-semibold transition-[background-color,color] focus-visible:outline-2 focus-visible:outline-offset-2 ${selected ? 'is-selected' : ''}`}
                      >
                        [{sectionMetadata?.eng_category || sectionName}] {sectionMetadata?.zh_category || '自訂'}
                      </button>
                    );
                  })}
                </div>

                <div id="pixiv-config-panel" role="tabpanel" aria-live="polite" className="space-y-8">
                  <div role="status" className="settings-modal__description text-xs">
                    {isSearching
                      ? `已跨整份 config.ini 找到 ${matchedFieldCount} 個欄位，結果已依分類分組。`
                      : `目前分類：${getSectionMetadata(activeSection)?.zh_category || activeSection || '尚未選擇'}`}
                  </div>
                  {filteredSectionGroups.length > 0 ? (
                    filteredSectionGroups.map(group => renderSectionGroup(group.section, group.entries))
                  ) : (
                    <div className="settings-modal__empty rounded-xl px-6 py-10 text-center">
                      <Search className="settings-modal__muted-icon mx-auto h-8 w-8" aria-hidden="true" />
                      <p className="settings-modal__empty-title mt-3 text-sm font-semibold">找不到符合的設定欄位</p>
                      <p className="settings-modal__empty-text mt-1 text-xs">請換一個關鍵字，或清除搜尋以回到目前分類。</p>
                      {isSearching && (
                        <button type="button" onClick={() => { setSectionFilter(''); setActiveSection(sectionKeys.includes('Settings') ? 'Settings' : sectionKeys[0] || ''); }} className="settings-modal__secondary-button mt-4 min-h-10 rounded-lg px-4 py-2 text-xs font-semibold transition-[background-color,transform] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2">
                          清除搜尋
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {mainTab === 'backup' && (
            <section id="settings-panel-backup" role="tabpanel" aria-labelledby="settings-tab-backup" className="space-y-6">
              <div>
                <h3 className="settings-modal__heading text-base font-bold">設定檔備份</h3>
                <p className="settings-modal__description mt-1 text-sm leading-5">儲存設定時會自動備份，也可以隨時手動建立目前 config.ini 的 .bak 備份。</p>
              </div>

              <div className="settings-modal__backup-card space-y-4 rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="settings-modal__label text-sm font-semibold">目前設定檔</h4>
                    <p className="settings-modal__description mt-1 break-all font-mono text-xs leading-5">{configPathInfo.configPath || '載入中…'}</p>
                  </div>
                  <span className={`settings-modal__backup-badge rounded-full px-2.5 py-1 text-xs font-semibold ${hasBackup ? 'is-ready' : 'is-empty'}`}>
                    {hasBackup ? '已有 .bak 備份' : '尚無備份'}
                  </span>
                </div>
                <div>
                  <p className="settings-modal__description mb-3 break-all text-xs leading-5">
                    備份檔：<code className="settings-modal__code">{configPathInfo.backupPath || '載入中…'}</code>
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={handleCreateBackup} disabled={loading} className="settings-modal__success-button inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold">
                      <Save className="h-4 w-4" aria-hidden="true" />
                      {loading ? '處理中…' : '立即建立手動備份'}
                    </button>
                    <button type="button" onClick={handleRestoreBackup} disabled={loading || !hasBackup} className="settings-modal__secondary-button inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-[background-color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      從 .bak 還原
                    </button>
                  </div>
                </div>
              </div>

            </section>
          )}
        </div>

        <div className="settings-modal__footer flex shrink-0 flex-wrap items-center justify-end gap-3 px-6 py-4">
          <button type="button" onClick={onClose} className="settings-modal__secondary-button min-h-11 rounded-xl px-4 py-2 text-sm font-semibold transition-[background-color,transform] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2">
            關閉
          </button>
          {mainTab === 'pixiv' && (
            <button type="button" onClick={() => setShowSaveConfirm(true)} disabled={loading} className="settings-modal__primary-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold">
              <Save className="h-4 w-4" aria-hidden="true" />
              儲存 PixivUtil2 設定
            </button>
          )}
        </div>
      </div>

      {showSaveConfirm && (
        <div
          className="settings-modal__confirm-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="presentation"
          onClick={handleSaveConfirmBackdropClick}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="save-confirm-title" className="settings-modal__confirm-panel w-full max-w-md space-y-4 rounded-2xl p-5 shadow-2xl">
            <h3 id="save-confirm-title" className="settings-modal__confirm-title text-base font-bold">儲存 PixivUtil2 設定？</h3>
            <p className="settings-modal__confirm-text text-sm leading-6">儲存前會先把目前 config.ini 複製成 .bak；若寫入失敗，系統會嘗試從備份還原。</p>
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowSaveConfirm(false)} className="settings-modal__secondary-button min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition-[background-color,transform] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2">
                取消
              </button>
              <button type="button" onClick={handleSavePixivConfig} disabled={loading} className="settings-modal__primary-button min-h-11 rounded-lg px-4 py-2 text-sm font-semibold">
                儲存設定
              </button>
            </div>
          </div>
        </div>
      )}

      {hardDeleteTarget && (
        <div
          className="settings-modal__confirm-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="presentation"
          onClick={handleHardDeleteBackdropClick}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="thumbnail-hard-delete-title" className="settings-modal__confirm-panel w-full max-w-md space-y-4 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="settings-modal__danger-icon mt-0.5 rounded-lg p-2">
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 id="thumbnail-hard-delete-title" className="settings-modal__confirm-title text-base font-bold">將這批縮圖送到資源回收筒？</h3>
                <p className="settings-modal__confirm-text mt-1 text-sm leading-6">這會將可復原位置中的 {hardDeleteTarget.recoverable_files.toLocaleString()} 個縮圖送到 Windows 資源回收筒，釋放約 {formatBytes(hardDeleteTarget.recoverable_bytes)}。之後可由 Windows 還原。</p>
              </div>
            </div>
            <p className="settings-modal__danger-note rounded-lg px-3 py-2 text-xs leading-5">只會刪除縮圖快取，不會刪除原始圖片。</p>
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button type="button" onClick={() => setHardDeleteTarget(null)} disabled={hardDeleteLoading} className="settings-modal__secondary-button min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition-[background-color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">
                取消
              </button>
              <button type="button" onClick={handleHardDeleteThumbnailCache} disabled={hardDeleteLoading} className="settings-modal__danger-button inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-[background-color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {hardDeleteLoading ? '移動中…' : '送到資源回收筒'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
