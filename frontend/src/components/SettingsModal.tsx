import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DemoMediaBlock } from './DemoMediaBlock';
import { PathPickerField } from './PathPickerField';
import { Badge, Button, IconButton, Input, Textarea } from './ui';
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
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved: () => void;
  onArtistVisibilityChanged?: () => void;
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
  demoMode: boolean;
  preloadImageCount: number;
  fullscreenToolbarSimpleMode: boolean;
  fullscreenShowThumbnails: boolean;
  webtoonImageScale: number;
  webtoonImageGap: number;
  webtoonShowInfo: boolean;
  webtoonShowPageNumber: boolean;
  webtoonShowThumbnails: boolean;
  analyzeColorsAfterLibraryUpdate: boolean;
  manageThumbnailCache: boolean;
  thumbnailCacheLimitMiB: number;
  pixivConfigPath: string;
  librarySourceMode: WebConfig['librarySourceMode'];
  mediaRootPath: string;
  onboardingCompleted: boolean;
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

type SourceClosePrompt = 'unsaved' | 'update' | null;

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

const getLibrarySourceSignature = (config: WebViewerConfig) => [
  config.librarySourceMode,
  config.librarySourceMode === 'folder'
    ? config.mediaRootPath.trim()
    : config.pixivConfigPath.trim(),
].join('\u0000');

const themeOptions = [
  { value: 'dark', label: '深色', description: '深色背景，適合夜間瀏覽' },
  { value: 'light', label: '淺色', description: '明亮背景，適合日間瀏覽' },
] as const;

const preferredBrowsingModeOptions = [
  { value: 'fullscreen', label: '全螢幕', description: '以單張閱讀器開啟作品。' },
  { value: 'webtoon', label: '條漫（Webtoon）', description: '以連續直向閱讀器開啟作品。' },
] as const;

const tabClass = (selected: boolean) =>
  `settings-modal__tab flex items-center gap-2 font-semibold ${selected ? 'is-selected' : ''}`;

const SettingsSwitch: React.FC<Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>> = props => (
  <input {...props} type="checkbox" role="switch" aria-checked={props.checked} className="settings-modal__switch" />
);

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.toLocaleLowerCase().includes('failed to fetch')) {
    return '無法連線到 Web Viewer 後端，請確認 API 服務正在執行。';
  }

  return error instanceof Error ? error.message : '發生未知錯誤，請稍後再試。';
};

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

const getCompletedLibraryUpdateDescription = (job: LibraryJob) => {
  const details: string[] = [];
  if (job.added > 0) details.push(`新增 ${job.added} 張`);
  if (job.updated > 0) details.push(`更新 ${job.updated} 張`);
  if (job.colors_created > 0) details.push(`建立 ${job.colors_created} 筆圖片色彩資料`);
  if (job.errors > 0) details.push(`${job.errors} 個檔案處理失敗`);
  if (job.conflicts > 0) details.push(`${job.conflicts} 個檔名衝突已保留`);

  if (details.length > 0) return `${details.join('、')}。`;
  return job.analyze_colors
    ? '沒有新增或變更的圖片，圖片色彩資料也已是最新狀態。'
    : '沒有新增或變更的圖片。';
};

const getLibraryJobStatusDescription = (job: LibraryJob | null) => {
  if (!job) return '開始更新圖片資料庫後，這裡會保留穩定的狀態訊息。';
  const isCacheJob = job.job_type === 'organize-thumbnail-cache';
  if (job.status === 'queued') return '前一個工作完成後會開始處理。';
  if (job.status === 'cancelling') return isCacheJob ? '正在停止；已完成的縮圖移動會保留。' : '正在停止；已完成的圖片更新會保留。';
  if (job.status === 'completed') {
    if (isCacheJob) return `已移出 ${job.cache_moved} 個縮圖，原檔仍可從可復原位置還原。`;
    return getCompletedLibraryUpdateDescription(job);
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
  onArtistVisibilityChanged,
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
  const [recycleCacheTarget, setRecycleCacheTarget] = useState<ThumbnailCacheRecoveryJob | null>(null);
  const [recycleCacheLoading, setRecycleCacheLoading] = useState(false);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [sourceClosePrompt, setSourceClosePrompt] = useState<SourceClosePrompt>(null);
  const [savedLibrarySourceSignature, setSavedLibrarySourceSignature] = useState(
    getLibrarySourceSignature(defaultWebConfig),
  );
  const [librarySourceNeedsUpdate, setLibrarySourceNeedsUpdate] = useState(false);
  const [hiddenArtists, setHiddenArtists] = useState<HiddenArtist[]>([]);
  const [selectedArtistIds, setSelectedArtistIds] = useState<number[]>([]);
  const libraryPollTimerRef = useRef<number | null>(null);
  const hiddenArtistsRequestRef = useRef<Promise<void> | null>(null);
  const sectionTabsRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const saveConfirmDialogRef = useRef<HTMLDivElement>(null);
  const saveConfirmCancelRef = useRef<HTMLButtonElement>(null);
  const recycleCacheDialogRef = useRef<HTMLDivElement>(null);
  const recycleCacheCancelRef = useRef<HTMLButtonElement>(null);
  const sourceCloseDialogRef = useRef<HTMLDivElement>(null);
  const sourceCloseCancelRef = useRef<HTMLButtonElement>(null);
  const [canScrollSectionTabsLeft, setCanScrollSectionTabsLeft] = useState(false);
  const [canScrollSectionTabsRight, setCanScrollSectionTabsRight] = useState(false);

  useModalFocusTrap({
    isOpen,
    dialogRef,
    initialFocusRef: closeButtonRef,
    disabled: !!showSaveConfirm || !!recycleCacheTarget || !!sourceClosePrompt,
  });

  useModalFocusTrap({
    isOpen: isOpen && showSaveConfirm,
    dialogRef: saveConfirmDialogRef,
    initialFocusRef: saveConfirmCancelRef,
  });

  useModalFocusTrap({
    isOpen: isOpen && !!recycleCacheTarget,
    dialogRef: recycleCacheDialogRef,
    initialFocusRef: recycleCacheCancelRef,
  });

  useModalFocusTrap({
    isOpen: isOpen && !!sourceClosePrompt,
    dialogRef: sourceCloseDialogRef,
    initialFocusRef: sourceCloseCancelRef,
  });

  const sectionKeys = Object.keys(pixivSections);
  const sectionTabKey = sectionKeys.join('\u0000');
  const isSearching = sectionFilter.trim().length > 0;
  const rootDirectory = webConfig.librarySourceMode === 'folder'
    ? webConfig.mediaRootPath || '.'
    : pixivSections.Settings?.rootdirectory || pixivSections.Settings?.rootDirectory || '.';
  const librarySourceHasUnsavedChanges = getLibrarySourceSignature(webConfig) !== savedLibrarySourceSignature;

  useEffect(() => {
    const tabsContainer = sectionTabsRef.current;
    if (!tabsContainer) {
      setCanScrollSectionTabsLeft(false);
      setCanScrollSectionTabsRight(false);
      return undefined;
    }

    const updateSectionTabScrollState = () => {
      const containerRect = tabsContainer.getBoundingClientRect();
      const tabs = Array.from(tabsContainer.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      setCanScrollSectionTabsLeft(tabs.some(tab => tab.getBoundingClientRect().left < containerRect.left - 1));
      setCanScrollSectionTabsRight(tabs.some(tab => tab.getBoundingClientRect().right > containerRect.right + 1));
    };

    updateSectionTabScrollState();
    tabsContainer.addEventListener('scroll', updateSectionTabScrollState, { passive: true });
    window.addEventListener('resize', updateSectionTabScrollState);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateSectionTabScrollState);
    resizeObserver?.observe(tabsContainer);

    return () => {
      tabsContainer.removeEventListener('scroll', updateSectionTabScrollState);
      window.removeEventListener('resize', updateSectionTabScrollState);
      resizeObserver?.disconnect();
    };
  }, [mainTab, sectionTabKey]);

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

  const loadHiddenArtists = () => {
    if (hiddenArtistsRequestRef.current) return hiddenArtistsRequestRef.current;

    const request = (async () => {
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch('/api/hidden-artists', { cache: 'no-store' });
          const data = await readJsonResponse<HiddenArtist[]>(response);
          setHiddenArtists(Array.isArray(data) ? data : []);
          return;
        } catch (error) {
          lastError = error;
          if (attempt === 0 && error instanceof TypeError) {
            await new Promise(resolve => window.setTimeout(resolve, 300));
            continue;
          }

          setMessage({ type: 'error', text: `無法讀取已隱藏繪師：${getErrorMessage(lastError)}` });
          return;
        }
      }

      setMessage({ type: 'error', text: `無法讀取已隱藏繪師：${getErrorMessage(lastError)}` });
    })();

    hiddenArtistsRequestRef.current = request;
    void request.finally(() => {
      if (hiddenArtistsRequestRef.current === request) {
        hiddenArtistsRequestRef.current = null;
      }
    });

    return request;
  };

  const handleUnhideArtist = async (artist: HiddenArtist) => {
    try {
      const response = await fetch(`/api/artists/${encodeURIComponent(artist.member_id)}/unhide`, { method: 'POST' });
      await readJsonResponse(response);
      await loadHiddenArtists();
      onArtistVisibilityChanged?.();
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
      setMessage({
        type: 'success',
        text: `圖片資料庫更新完成：${getCompletedLibraryUpdateDescription(job)}`,
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
      const pixivData = pixivResponse.ok
        ? await readJsonResponse<PixivConfigResponse>(pixivResponse)
        : null;
      const libraryData = await readJsonResponse<LibraryJobResponse>(libraryJobResponse);
      const nextSections = pixivData?.sections || {};
      const nextSectionKeys = Object.keys(nextSections);

       const nextWebConfig: WebViewerConfig = {
         ...normalizeWebConfig(webData),
         pixivConfigPath: webData.pixivConfigPath || '',
       };
      setWebConfig(nextWebConfig);
      setSavedLibrarySourceSignature(getLibrarySourceSignature(nextWebConfig));
      setLibrarySourceNeedsUpdate(false);
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
      setHasBackup(!!pixivData?.hasBackup);
      setConfigPathInfo({
        configPath: pixivData?.configPath || '',
        backupPath: pixivData?.backupPath || '',
        defaultConfigPath: pixivData?.defaultConfigPath || '',
        usingDefaultPath: !!pixivData?.usingDefaultPath,
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
      setSourceClosePrompt(null);
      setRecycleCacheTarget(null);
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

  const requestClose = useCallback(() => {
    if (librarySourceHasUnsavedChanges) {
      setSourceClosePrompt('unsaved');
      return;
    }
    if (librarySourceNeedsUpdate) {
      setSourceClosePrompt('update');
      return;
    }
    onClose();
  }, [librarySourceHasUnsavedChanges, librarySourceNeedsUpdate, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (recycleCacheTarget) {
        if (!recycleCacheLoading) setRecycleCacheTarget(null);
      } else if (showSaveConfirm) {
        setShowSaveConfirm(false);
      } else if (sourceClosePrompt) {
        setSourceClosePrompt(null);
      } else {
        requestClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, recycleCacheLoading, recycleCacheTarget, requestClose, showSaveConfirm, sourceClosePrompt]);

  const saveWebConfig = async (): Promise<boolean> => {
    setLoading(true);
    setMessage(null);
    try {
      const normalizedWebConfig = normalizeWebConfig(webConfig);
      const payload: WebViewerConfig = {
        ...defaultWebConfig,
        ...normalizedWebConfig,
        pixivConfigPath: webConfig.pixivConfigPath.trim(),
        mediaRootPath: normalizedWebConfig.librarySourceMode === 'pixiv'
          ? ''
          : normalizedWebConfig.mediaRootPath.trim(),
      };
      const response = await fetch('/api/web-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await readJsonResponse(response);
      const nextSourceSignature = getLibrarySourceSignature(payload);
      const sourceChanged = nextSourceSignature !== savedLibrarySourceSignature;
      setWebConfig(payload);
      setSavedLibrarySourceSignature(nextSourceSignature);
      if (sourceChanged) setLibrarySourceNeedsUpdate(true);
      setMessage({ type: 'success', text: 'Web Viewer 設定已儲存。' });
      onSettingsSaved();
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: `無法儲存 Web Viewer 設定：${getErrorMessage(error)}` });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWebConfig = async () => {
    await saveWebConfig();
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

  const startLibraryUpdate = async (): Promise<boolean> => {
    if (isLibraryJobActive(libraryJob)) return false;
    setScanning(true);
    setMessage(null);
    try {
      const response = await fetch('/api/library/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'update-library',
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
      setLibrarySourceNeedsUpdate(false);
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: `更新圖片資料庫失敗：${getErrorMessage(error)}` });
      setScanning(false);
      return false;
    }
  };

  const handleRescanDirectory = async () => {
    if (librarySourceHasUnsavedChanges) {
      setMessage({ type: 'error', text: '媒體來源尚未儲存。請先儲存設定，再更新圖片資料庫。' });
      return;
    }
    await startLibraryUpdate();
  };

  const handleConfirmSourceClose = async () => {
    const prompt = sourceClosePrompt;
    if (prompt === 'unsaved') {
      if (!(await saveWebConfig())) return;
      setSourceClosePrompt('update');
    }
    if (!(await startLibraryUpdate())) return;
    setSourceClosePrompt(null);
    onClose();
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

  const handleRecycleThumbnailCache = async () => {
    if (!recycleCacheTarget || libraryJobIsBusy) return;
    setRecycleCacheLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/library/cache/${encodeURIComponent(recycleCacheTarget.job_id)}`, {
        method: 'DELETE',
      });
      const data = await readJsonResponse<{
        moved: number;
        bytes_freed: number;
        remaining: number;
        errors: string[];
      }>(response);
      setRecycleCacheTarget(null);
      setExpandedRecoveryJobId(null);
      setRecoveryDetails(null);
      await loadThumbnailCacheStats();
      if (data.errors.length > 0) {
        setMessage({
          type: 'error',
          text: `已將 ${data.moved} 個縮圖送到資源回收筒、釋放 ${formatBytes(data.bytes_freed)}；仍有 ${data.remaining} 個檔案未完成。`,
        });
      } else {
        setMessage({
          type: 'success',
          text: `已將 ${data.moved} 個縮圖送到資源回收筒，釋放 ${formatBytes(data.bytes_freed)}。原始圖片不受影響。`,
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `無法將縮圖送到資源回收筒：${getErrorMessage(error)}` });
    } finally {
      setRecycleCacheLoading(false);
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
          />
          {metadata.path.purpose === 'root-directory' && (
            <Button type="button" onClick={() => setMainTab('library')} variant="plain" size="sm" className="settings-modal__text-link text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
              前往媒體資料庫
            </Button>
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
          <SettingsSwitch
            id={fieldId}
            checked={value.toLowerCase() === 'true'}
            onChange={event => update(event.target.checked ? 'True' : 'False')}
            aria-labelledby={`${fieldId}-label`}
            aria-describedby={descriptionId}
          />
          <span>{value.toLowerCase() === 'true' ? '已啟用（True）' : '未啟用（False）'}</span>
        </label>
      );
    }

    if (metadata.kind === 'textarea') {
      return (
        <Textarea
          controlSize="md"
          id={fieldId}
          value={value}
          onChange={event => update(event.target.value)}
          rows={2}
          aria-describedby={descriptionId}
          spellCheck={false}
          className="min-h-20 font-mono leading-5"
        />
      );
    }

    return (
      <Input
        controlSize="md"
        id={fieldId}
        type={metadata.kind === 'number' ? 'number' : metadata.secret ? 'password' : 'text'}
        value={value}
        onChange={event => update(event.target.value)}
        aria-describedby={descriptionId}
        autoComplete="off"
        spellCheck={false}
        className={metadata.kind === 'number' || metadata.secret ? 'font-mono' : undefined}
      />
    );
  };

  const renderSectionGroup = (sectionName: string, entries: [string, string][]) => {
    const sectionMetadata = getSectionMetadata(sectionName);
    const headingId = `pixiv-section-${sectionName.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

    return (
      <section key={sectionName} aria-labelledby={headingId} className="settings-modal__config-section space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h4 id={headingId} className="settings-modal__heading text-sm font-bold">
            <span className="settings-modal__section-label">
              <span className="settings-modal__section-label-en">[{sectionMetadata?.eng_category || sectionName}]</span>
              <span className="settings-modal__section-label-zh">{sectionMetadata?.zh_category || '自訂分類'}</span>
            </span>
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
                  className="settings-modal__field-card p-3"
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
                  <div className="min-w-0">{renderFieldControl(sectionName, optionName, value, metadata, fieldId)}</div>
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

  const scrollSectionTabs = (direction: 'left' | 'right') => {
    const tabsContainer = sectionTabsRef.current;
    if (!tabsContainer) return;

    const containerRect = tabsContainer.getBoundingClientRect();
    const tabs = Array.from(tabsContainer.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const clippedTabs = direction === 'left'
      ? tabs.filter(tab => tab.getBoundingClientRect().left < containerRect.left - 1)
      : tabs.filter(tab => tab.getBoundingClientRect().right > containerRect.right + 1);
    const targetTab = direction === 'left'
      ? clippedTabs[clippedTabs.length - 1]
      : clippedTabs[0];

    targetTab?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  };

  const handleSectionTabsWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const tabsContainer = event.currentTarget;
    if (tabsContainer.scrollWidth <= tabsContainer.clientWidth) return;

    // Keep the wheel gesture inside this horizontal strip. A regular vertical
    // mouse wheel is mapped to horizontal scrolling; native horizontal
    // trackpad and shift-wheel deltas are preserved as horizontal movement.
    const deltaMagnitude = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? tabsContainer.clientWidth
        : 1;
    const wheelDelta = (Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * deltaMagnitude;
    if (wheelDelta === 0) return;

    const isRtl = getComputedStyle(tabsContainer).direction === 'rtl';
    const scrollDelta = isRtl ? -wheelDelta : wheelDelta;
    const canScrollInDirection = scrollDelta < 0
      ? canScrollSectionTabsLeft
      : canScrollSectionTabsRight;

    event.preventDefault();
    if (!canScrollInDirection) return;
    tabsContainer.scrollBy({ left: scrollDelta, behavior: 'auto' });
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
    if (event.target === event.currentTarget) requestClose();
  };

  const handleSaveConfirmBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setShowSaveConfirm(false);
  };

  const handleRecycleCacheBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !recycleCacheLoading) setRecycleCacheTarget(null);
  };

  const handleSourceCloseBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !loading) setSourceClosePrompt(null);
  };

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={handleBackdropClick}
      className="settings-modal fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="settings-modal__panel flex min-h-0 w-full flex-col overflow-hidden"
      >
        <div className="settings-modal__header flex min-h-16 shrink-0 items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="settings-modal__title-icon">
              <Settings className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="settings-modal-title" className="settings-modal__title truncate text-lg font-bold">
              PixivUtil2 與 Web Viewer 設定
            </h2>
          </div>
          <IconButton
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            variant="ghost"
            aria-label="關閉設定"
            className="settings-modal__close"
          >
            <X className="mx-auto h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>

        {message && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`settings-modal__message flex shrink-0 items-start gap-2 text-sm ${
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

        <div role="tablist" aria-label="設定分類" className="settings-modal__tabs shrink-0">
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

        <div className="settings-modal__content min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {mainTab === 'web' && (
            <section id="settings-panel-web" role="tabpanel" aria-labelledby="settings-tab-web" className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="settings-modal__heading text-base font-bold">顯示與瀏覽</h3>
                  <p className="settings-modal__description mt-1 text-sm leading-5">調整檢視器的外觀、縮圖與瀏覽行為。</p>
                </div>
                {onOpenRecycleBin && (
                  <Button
                    type="button"
                    onClick={onOpenRecycleBin}
                    variant="secondary"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    開啟回收區
                  </Button>
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
                        <Button
                          type="button"
                          onClick={() => void handleUnhideArtist(artist)}
                          variant="secondary"
                        >
                          恢復顯示
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="settings-modal__display-section space-y-4" aria-labelledby="settings-general-display-title">
                <div>
                  <h4 id="settings-general-display-title" className="settings-modal__heading text-sm font-bold">一般瀏覽</h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">調整主題、列表密度、作品群組與預覽行為。</p>
                </div>

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
                      style={{ '--ui-field-icon': 'var(--settings-text-muted)', '--ui-field-icon-focus': 'var(--settings-accent)' } as React.CSSProperties}
                    />
                  </div>
                  <div>
                    <label htmlFor="default-view-mode" className="settings-modal__label mb-1.5 block text-sm font-semibold">偏好的瀏覽模式</label>
                    <CustomSelect
                      id="default-view-mode"
                      value={webConfig.defaultViewMode}
                      options={preferredBrowsingModeOptions}
                      onChange={defaultViewMode => setWebConfig(current => ({ ...current, defaultViewMode }))}
                      ariaLabel="偏好的瀏覽模式"
                      className="w-full"
                      style={{ '--ui-field-icon': 'var(--settings-text-muted)', '--ui-field-icon-focus': 'var(--settings-accent)' } as React.CSSProperties}
                    />
                    <p className="settings-modal__description mt-1 text-xs leading-5">點選一般圖片或圖包中的頁面時，使用這個閱讀模式。</p>
                  </div>
                  <div>
                    <label htmlFor="thumbnail-size" className="settings-modal__label mb-1.5 block text-sm font-semibold">縮圖尺寸 (thumbnailSize)</label>
                    <Input controlSize="md" id="thumbnail-size" type="number" min={16} max={4096} value={webConfig.thumbnailSize} onChange={event => setWebConfig(current => ({ ...current, thumbnailSize: Number(event.target.value) }))} />
                  </div>
                  <div>
                    <label htmlFor="items-per-page" className="settings-modal__label mb-1.5 block text-sm font-semibold">每頁顯示數量</label>
                    <Input controlSize="md" id="items-per-page" type="number" min={1} max={5000} value={webConfig.itemsPerPage} onChange={event => setWebConfig(current => ({ ...current, itemsPerPage: Number(event.target.value) }))} />
                  </div>
                </div>

                <div className="space-y-3">
                  <label htmlFor="group-manga-posts" className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm">
                    <SettingsSwitch id="group-manga-posts" checked={!!webConfig.groupMangaPosts} onChange={event => setWebConfig(current => ({ ...current, groupMangaPosts: event.target.checked }))} />
                    <span>將漫畫作品合併成作品群組</span>
                  </label>
                  <label htmlFor="auto-open-browser" className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm">
                    <SettingsSwitch id="auto-open-browser" checked={!!webConfig.autoOpenBrowser} onChange={event => setWebConfig(current => ({ ...current, autoOpenBrowser: event.target.checked }))} />
                    <span>啟動時自動開啟瀏覽器</span>
                  </label>
                  <label htmlFor="blur-enabled" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm">
                    <SettingsSwitch id="blur-enabled" checked={!!webConfig.blurEnabled} onChange={event => setWebConfig(current => ({ ...current, blurEnabled: event.target.checked }))} />
                    <span className="min-w-0">
                      <span className="block font-semibold">套用模糊遮罩</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">在縮圖、條漫與全螢幕預覽套用模糊遮罩。</span>
                    </span>
                  </label>
                  <label htmlFor="demo-mode" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm">
                    <SettingsSwitch id="demo-mode" checked={!!webConfig.demoMode} onChange={event => setWebConfig(current => ({ ...current, demoMode: event.target.checked }))} />
                    <span className="min-w-0">
                      <span className="block font-semibold">Demo 模式</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">以圖片主要色彩顯示色塊，不載入圖片內容，適合展示或錄製畫面。</span>
                    </span>
                  </label>
                </div>
              </section>

              <section className="settings-modal__display-section space-y-4" aria-labelledby="settings-fullscreen-title">
                <div>
                  <h4 id="settings-fullscreen-title" className="settings-modal__heading text-sm font-bold">全螢幕模式</h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">調整全螢幕閱讀時的工具列、預載與橫式縮圖導覽。</p>
                </div>

                <div className="max-w-xs">
                  <label htmlFor="preload-image-count" className="settings-modal__label mb-1.5 block text-sm font-semibold">預載圖片張數</label>
                  <Input controlSize="md" id="preload-image-count" type="number" min={0} max={10} value={webConfig.preloadImageCount} onChange={event => setWebConfig(current => ({ ...current, preloadImageCount: Number(event.target.value) }))} />
                  <p className="settings-modal__description mt-1 text-xs leading-5">切換圖片時，預先載入鄰近圖片的數量。</p>
                </div>

                <div className="space-y-3">
                  <label htmlFor="fullscreen-toolbar-simple-mode" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm">
                    <SettingsSwitch id="fullscreen-toolbar-simple-mode" checked={!!webConfig.fullscreenToolbarSimpleMode} onChange={event => setWebConfig(current => ({ ...current, fullscreenToolbarSimpleMode: event.target.checked }))} />
                    <span className="min-w-0">
                      <span className="block font-semibold">使用簡易工具列</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">只顯示常用閱讀控制；可在全螢幕工具列中隨時展開完整功能。</span>
                    </span>
                  </label>
                  <label htmlFor="fullscreen-show-thumbnails" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm">
                    <SettingsSwitch id="fullscreen-show-thumbnails" checked={!!webConfig.fullscreenShowThumbnails} onChange={event => setWebConfig(current => ({ ...current, fullscreenShowThumbnails: event.target.checked }))} />
                    <span className="min-w-0">
                      <span className="block font-semibold">顯示橫式縮圖導覽</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">關閉後進入全螢幕時預設隱藏底部縮圖列，仍可從工具列暫時顯示。</span>
                    </span>
                  </label>
                </div>
              </section>

              <section className="settings-modal__display-section space-y-4" aria-labelledby="settings-webtoon-title">
                <div>
                  <h4 id="settings-webtoon-title" className="settings-modal__heading text-sm font-bold">條漫模式</h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">調整條漫閱讀的圖片尺寸、資訊與直式縮圖導覽。</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="webtoon-image-scale" className="settings-modal__label mb-1.5 block text-sm font-semibold">圖片寬度比例（%）</label>
                    <Input controlSize="md" id="webtoon-image-scale" type="number" min={30} max={100} step={5} value={webConfig.webtoonImageScale} onChange={event => setWebConfig(current => ({ ...current, webtoonImageScale: Number(event.target.value) }))} />
                  </div>
                  <div>
                    <label htmlFor="webtoon-image-gap" className="settings-modal__label mb-1.5 block text-sm font-semibold">圖片間距（px）</label>
                    <Input controlSize="md" id="webtoon-image-gap" type="number" min={0} max={300} step={4} value={webConfig.webtoonImageGap} onChange={event => setWebConfig(current => ({ ...current, webtoonImageGap: Number(event.target.value) }))} />
                  </div>
                </div>

                <div className="space-y-3">
                  <label htmlFor="webtoon-show-info" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm">
                    <SettingsSwitch id="webtoon-show-info" checked={!!webConfig.webtoonShowInfo} onChange={event => setWebConfig(current => ({ ...current, webtoonShowInfo: event.target.checked }))} />
                    <span className="min-w-0">
                      <span className="block font-semibold">顯示圖片資訊欄</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">關閉後只保留圖片內容。</span>
                    </span>
                  </label>
                  <label htmlFor="webtoon-show-page-number" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm">
                    <SettingsSwitch id="webtoon-show-page-number" checked={!!webConfig.webtoonShowPageNumber} onChange={event => setWebConfig(current => ({ ...current, webtoonShowPageNumber: event.target.checked }))} />
                    <span className="min-w-0">
                      <span className="block font-semibold">顯示頁碼</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">在圖片上保留目前圖片的全域頁碼。</span>
                    </span>
                  </label>
                  <label htmlFor="webtoon-show-thumbnails" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm">
                    <SettingsSwitch id="webtoon-show-thumbnails" checked={!!webConfig.webtoonShowThumbnails} onChange={event => setWebConfig(current => ({ ...current, webtoonShowThumbnails: event.target.checked }))} />
                    <span className="min-w-0">
                      <span className="block font-semibold">顯示直式縮圖導覽</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">桌面版以固定欄位快速跳到其他圖片。</span>
                    </span>
                  </label>
                </div>
              </section>

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

                <fieldset className="settings-modal__source-settings space-y-4">
                  <legend className="settings-modal__label text-sm font-semibold">媒體來源</legend>
                  <div className="settings-modal__source-mode grid gap-2 sm:grid-cols-2">
                    <label className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm">
                      <input
                        type="radio"
                        name="library-source-mode"
                        value="pixiv"
                        checked={webConfig.librarySourceMode === 'pixiv'}
                        onChange={() => setWebConfig(current => ({ ...current, librarySourceMode: 'pixiv' }))}
                        disabled={libraryJobIsBusy}
                        className="settings-modal__checkbox h-4 w-4 shrink-0"
                      />
                      <span><span className="block font-semibold">PixivUtil2</span><span className="settings-modal__description block text-xs">從 config.ini 讀取圖片根目錄與 Pixiv metadata。</span></span>
                    </label>
                    <label className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm">
                      <input
                        type="radio"
                        name="library-source-mode"
                        value="folder"
                        checked={webConfig.librarySourceMode === 'folder'}
                        onChange={() => setWebConfig(current => ({ ...current, librarySourceMode: 'folder' }))}
                        disabled={libraryJobIsBusy}
                        className="settings-modal__checkbox h-4 w-4 shrink-0"
                      />
                      <span><span className="block font-semibold">僅使用資料夾</span><span className="settings-modal__description block text-xs">直接建立 Viewer 索引，不需要 PixivUtil2 或 db.sqlite。</span></span>
                    </label>
                  </div>
                  {webConfig.librarySourceMode === 'folder' ? (
                    <div>
                      <label htmlFor="library-folder-path" className="settings-modal__label mb-1.5 block text-sm font-semibold">圖片資料夾</label>
                      <PathPickerField
                        id="library-folder-path"
                        value={webConfig.mediaRootPath}
                        label="圖片資料夾"
                        placeholder="選擇圖片資料夾"
                        metadata={{ mode: 'folder', purpose: 'root-directory', access: 'read' }}
                        onChange={mediaRootPath => setWebConfig(current => ({ ...current, mediaRootPath }))}
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="library-pixiv-config-path" className="settings-modal__label mb-1.5 block text-sm font-semibold">PixivUtil2 config.ini</label>
                      <PathPickerField
                        id="library-pixiv-config-path"
                        value={webConfig.pixivConfigPath}
                        label="PixivUtil2 config.ini"
                        placeholder="選擇 config.ini"
                        metadata={{ mode: 'existing-file', purpose: 'pixiv-config', extensions: ['.ini'], access: 'read' }}
                        onChange={pixivConfigPath => setWebConfig(current => ({ ...current, pixivConfigPath }))}
                      />
                    </div>
                  )}
                </fieldset>

                <div className="settings-modal__library-source flex min-w-0 flex-col gap-1 rounded-xl p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <span className="settings-modal__text-subtle block text-xs font-semibold">圖片資料夾</span>
                    <code className="settings-modal__library-path mt-1 block break-all font-mono text-xs">{rootDirectory}</code>
                  </div>
                  <span className="settings-modal__library-source-label shrink-0 text-xs">唯讀來源</span>
                </div>
                <p className="settings-modal__description text-xs leading-5">{webConfig.librarySourceMode === 'folder' ? 'Web Viewer 會直接掃描這個資料夾。' : '路徑來自 PixivUtil2 的 rootDirectory 設定。'}</p>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={handleRescanDirectory} disabled={libraryJobIsBusy || librarySourceHasUnsavedChanges} variant="primary">
                    <RefreshCw className={`settings-modal__library-status-icon h-4 w-4 ${libraryJobIsBusy ? 'is-active' : ''}`} aria-hidden="true" />
                    {libraryJobIsBusy ? '更新中…' : '更新圖片資料庫'}
                  </Button>
                  <span className="settings-modal__description text-xs">
                    {librarySourceHasUnsavedChanges
                      ? '請先儲存新的媒體來源，再更新圖片資料庫。'
                      : '工作會在背景執行，完成或取消時會保留已處理的資料。'}
                  </span>
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
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setSelectedArtistIds(artists.filter(artist => artist.member_id > 0).map(artist => artist.member_id))}
                        disabled={libraryJobIsBusy || artists.length === 0}
                      >
                        選取全部繪師
                      </Button>
                      <Button
                        type="button"
                        variant="plain"
                        onClick={() => setSelectedArtistIds([])}
                        disabled={libraryJobIsBusy || selectedArtistIds.length === 0}
                      >
                        清除選取
                      </Button>
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
                    <Button
                      type="button"
                      onClick={() => void handleUpdateSelectedArtists()}
                      disabled={libraryJobIsBusy || selectedArtistIds.length === 0}
                      variant="secondary"
                      aria-describedby="selected-artists-help"
                    >
                      <RefreshCw className={`h-4 w-4 ${scanning && selectedArtistIds.length > 0 ? 'is-active' : ''}`} aria-hidden="true" />
                      更新選取的繪師（{selectedArtistIds.length}）
                    </Button>
                  </div>

                  <label htmlFor="analyze-colors-after-update" className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm">
                    <SettingsSwitch
                      id="analyze-colors-after-update"
                      checked={webConfig.analyzeColorsAfterLibraryUpdate}
                      onChange={event => setWebConfig(current => ({ ...current, analyzeColorsAfterLibraryUpdate: event.target.checked }))}
                      disabled={libraryJobIsBusy}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">更新後分析圖片色彩</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">更新工作完成後，會在背景分析目前圖片的色彩。</span>
                    </span>
                  </label>
                  <Button type="button" onClick={handleAnalyzeMissingColors} disabled={libraryJobIsBusy} variant="secondary">
                    只分析缺少的圖片色彩
                  </Button>
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
                      <Button type="button" disabled variant="secondary" className="mt-3">
                        正在停止…
                      </Button>
                    )}
                    {libraryJobIsActive && libraryJob?.status !== 'cancelling' && (
                      <Button type="button" onClick={handleCancelLibraryJob} variant="plain" className="mt-3">
                        取消工作
                      </Button>
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
                    <SettingsSwitch
                      id="manage-thumbnail-cache"
                      checked={webConfig.manageThumbnailCache}
                      onChange={event => setWebConfig(current => ({ ...current, manageThumbnailCache: event.target.checked }))}
                      disabled={libraryJobIsBusy}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">自動管理縮圖空間</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">圖片資料庫更新完成後，依空間上限整理無來源、舊版本、舊尺寸與最久未使用的縮圖。</span>
                    </span>
                  </label>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-44">
                      <label htmlFor="thumbnail-cache-limit" className="settings-modal__label mb-1.5 block text-sm font-semibold">空間上限（MiB）</label>
                      <Input
                        controlSize="md"
                        id="thumbnail-cache-limit"
                        type="number"
                        min={128}
                        max={102400}
                        step={128}
                        value={webConfig.thumbnailCacheLimitMiB}
                        onChange={event => setWebConfig(current => ({ ...current, thumbnailCacheLimitMiB: Number(event.target.value) }))}
                        disabled={libraryJobIsBusy}
                        className="max-w-52"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={handleOrganizeThumbnailCache} disabled={libraryJobIsBusy} variant="secondary">
                    <RefreshCw className={`h-4 w-4 ${libraryJob?.phase === 'organizing_cache' ? 'is-active' : ''}`} aria-hidden="true" />
                    整理縮圖
                  </Button>
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
                              <Button
                                type="button"
                                onClick={() => handleToggleRecoveryDetails(job.job_id)}
                                aria-expanded={isExpanded}
                                aria-controls={`thumbnail-cache-recovery-${job.job_id}`}
                                variant="secondary"
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                {isExpanded ? '收合內容' : '查看內容'}
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                              </Button>
                              <Button type="button" onClick={() => handleRestoreThumbnailCache(job.job_id)} disabled={thumbnailCacheLoading || libraryJobIsBusy} variant="secondary">
                                {thumbnailCacheLoading ? '處理中…' : '還原'}
                              </Button>
                              <Button type="button" onClick={() => setRecycleCacheTarget(job)} disabled={thumbnailCacheLoading || libraryJobIsBusy} variant="danger">
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                送到資源回收筒
                              </Button>
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
                                              {webConfig.demoMode ? (
                                                <DemoMediaBlock />
                                              ) : (
                                                <img
                                                  src={`/api/library/cache/${encodeURIComponent(job.job_id)}/preview/${encodeURIComponent(entry.recovery_name)}`}
                                                  alt={`縮圖預覽：${displayName}`}
                                                  loading="lazy"
                                                />
                                              )}
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
                                    <Button type="button" onClick={() => handleRecoveryPageChange(job.job_id, Math.max(0, detailsForJob.offset - detailsForJob.limit))} disabled={detailsForJob.offset === 0 || recoveryDetailsLoading} variant="secondary">
                                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                                      上一頁
                                    </Button>
                                    <span className="settings-modal__text-subtle text-xs">第 {Math.floor(detailsForJob.offset / detailsForJob.limit) + 1} 頁</span>
                                    <Button type="button" onClick={() => handleRecoveryPageChange(job.job_id, detailsForJob.offset + detailsForJob.limit)} disabled={!detailsForJob.has_more || recoveryDetailsLoading} variant="secondary">
                                      下一頁 <span aria-hidden="true">&gt;</span>
                                    </Button>
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
              <div className="settings-modal__info-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="settings-modal__info-title text-base font-bold">PixivUtil2 設定檔位置</h3>
                    <p className="settings-modal__info-description mt-1 text-sm leading-5">
                      留白會使用預設位置；填寫完整路徑後，下面的分類與欄位會改讀該份 config.ini。
                    </p>
                  </div>
                  <Badge variant="neutral" size="sm" className="settings-modal__badge">
                    {configPathInfo.usingDefaultPath ? '使用預設位置' : '使用自訂位置'}
                  </Badge>
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
                  />
                  <p className="settings-modal__description break-all text-xs leading-5">
                    目前讀取：<code className="settings-modal__code">{configPathInfo.configPath || '載入中…'}</code>
                    <br />
                    預設位置：<code className="settings-modal__code">{configPathInfo.defaultConfigPath || '載入中…'}</code>
                  </p>
                  <Button type="button" onClick={handleSaveConfigPath} disabled={loading} variant="primary" className="mt-2">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {loading ? '載入中…' : '儲存路徑並重新載入'}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="settings-modal__search-field min-w-0 flex-1">
                    <label htmlFor="pixiv-config-search" className="sr-only">搜尋整份 config.ini</label>
                    <Input
                      controlSize="md"
                      leadingIcon={<Search aria-hidden="true" />}
                      wrapperClassName="w-full"
                      clearable
                      onClear={() => {
                        setSectionFilter('');
                        setActiveSection(sectionKeys.includes('Settings') ? 'Settings' : sectionKeys[0] || '');
                      }}
                      clearButtonLabel="清除搜尋"
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
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="settings-modal__section-tabs-shell">
                  <IconButton
                    type="button"
                    variant="ghost"
                    className="settings-modal__section-tabs-control"
                    onClick={() => scrollSectionTabs('left')}
                    disabled={!canScrollSectionTabsLeft}
                    aria-label="向左瀏覽 config.ini 分類"
                    title="向左瀏覽 config.ini 分類"
                    aria-controls="pixiv-config-section-tabs"
                  >
                    <ChevronLeft aria-hidden="true" />
                  </IconButton>

                  <div
                    id="pixiv-config-section-tabs"
                    ref={sectionTabsRef}
                    className="settings-modal__section-tabs"
                    role="tablist"
                    aria-label="PixivUtil2 config.ini 分類"
                    onWheel={handleSectionTabsWheel}
                  >
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
                          className={`settings-modal__section-tab text-xs font-semibold ${selected ? 'is-selected' : ''}`}
                        >
                          <span className="settings-modal__section-label">
                            <span className="settings-modal__section-label-en">[{sectionMetadata?.eng_category || sectionName}]</span>
                            <span className="settings-modal__section-label-zh">{sectionMetadata?.zh_category || '自訂'}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <IconButton
                    type="button"
                    variant="ghost"
                    className="settings-modal__section-tabs-control"
                    onClick={() => scrollSectionTabs('right')}
                    disabled={!canScrollSectionTabsRight}
                    aria-label="向右瀏覽 config.ini 分類"
                    title="向右瀏覽 config.ini 分類"
                    aria-controls="pixiv-config-section-tabs"
                  >
                    <ChevronRight aria-hidden="true" />
                  </IconButton>
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
                        <Button type="button" onClick={() => { setSectionFilter(''); setActiveSection(sectionKeys.includes('Settings') ? 'Settings' : sectionKeys[0] || ''); }} variant="plain" className="mt-4">
                          清除搜尋
                        </Button>
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
                  <Badge variant={hasBackup ? 'success' : 'neutral'} size="sm">
                    {hasBackup ? '已有 .bak 備份' : '尚無備份'}
                  </Badge>
                </div>
                <div>
                  <p className="settings-modal__description mb-3 break-all text-xs leading-5">
                    備份檔：<code className="settings-modal__code">{configPathInfo.backupPath || '載入中…'}</code>
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" onClick={handleCreateBackup} disabled={loading} variant="success">
                      <Save className="h-4 w-4" aria-hidden="true" />
                      {loading ? '處理中…' : '立即建立手動備份'}
                    </Button>
                    <Button type="button" onClick={handleRestoreBackup} disabled={loading || !hasBackup} variant="secondary">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      從 .bak 還原
                    </Button>
                  </div>
                </div>
              </div>

            </section>
          )}
        </div>

        <footer className="settings-modal__footer flex shrink-0 flex-wrap items-center justify-end gap-3">
          <Button type="button" onClick={requestClose} variant="plain">
            關閉
          </Button>
          {(mainTab === 'web' || mainTab === 'library') && (
            <Button
              type="button"
              onClick={handleSaveWebConfig}
              disabled={loading || (mainTab === 'library' && libraryJobIsBusy)}
              variant="primary"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {loading ? '儲存中…' : mainTab === 'library' ? '儲存媒體資料庫設定' : '儲存顯示與瀏覽設定'}
            </Button>
          )}
          {mainTab === 'pixiv' && (
            <Button type="button" onClick={() => setShowSaveConfirm(true)} disabled={loading} variant="primary">
              <Save className="h-4 w-4" aria-hidden="true" />
              儲存 PixivUtil2 設定
            </Button>
          )}
        </footer>
      </div>

      {sourceClosePrompt && (
        <div
          className="settings-modal__confirm-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="presentation"
          onClick={handleSourceCloseBackdropClick}
        >
          <div
            ref={sourceCloseDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-close-title"
            aria-describedby="source-close-description"
            className="settings-modal__confirm-panel w-full max-w-md space-y-4 rounded-2xl p-5"
          >
            <h3 id="source-close-title" className="settings-modal__confirm-title text-base font-bold">
              {sourceClosePrompt === 'unsaved' ? '媒體來源尚未儲存' : '圖片資料庫尚未更新'}
            </h3>
            <p id="source-close-description" className="settings-modal__confirm-text text-sm leading-6">
              {sourceClosePrompt === 'unsaved'
                ? '你已切換媒體來源或修改圖片資料夾。請儲存設定並更新圖片資料庫，否則圖庫仍會顯示舊來源的索引。'
                : '新的媒體來源已儲存，但圖片資料庫尚未更新。現在開始更新，才能顯示新來源的圖片。'}
            </p>
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button
                ref={sourceCloseCancelRef}
                type="button"
                onClick={() => setSourceClosePrompt(null)}
                disabled={loading}
                variant="plain"
              >
                返回設定
              </Button>
              <Button type="button" onClick={handleConfirmSourceClose} disabled={loading} variant="primary">
                {loading
                  ? '處理中…'
                  : sourceClosePrompt === 'unsaved'
                    ? '儲存並開始更新'
                    : '開始更新圖片資料庫'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showSaveConfirm && (
        <div
          className="settings-modal__confirm-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="presentation"
          onClick={handleSaveConfirmBackdropClick}
        >
          <div ref={saveConfirmDialogRef} role="dialog" aria-modal="true" aria-labelledby="save-confirm-title" className="settings-modal__confirm-panel w-full max-w-md space-y-4 rounded-2xl p-5">
            <h3 id="save-confirm-title" className="settings-modal__confirm-title text-base font-bold">儲存 PixivUtil2 設定？</h3>
            <p className="settings-modal__confirm-text text-sm leading-6">儲存前會先把目前 config.ini 複製成 .bak；若寫入失敗，系統會嘗試從備份還原。</p>
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button ref={saveConfirmCancelRef} type="button" onClick={() => setShowSaveConfirm(false)} variant="plain">
                取消
              </Button>
              <Button type="button" onClick={handleSavePixivConfig} disabled={loading} variant="primary">
                儲存設定
              </Button>
            </div>
          </div>
        </div>
      )}

      {recycleCacheTarget && (
        <div
          className="settings-modal__confirm-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="presentation"
          onClick={handleRecycleCacheBackdropClick}
        >
          <div ref={recycleCacheDialogRef} role="dialog" aria-modal="true" aria-labelledby="thumbnail-recycle-title" className="settings-modal__confirm-panel w-full max-w-md space-y-4 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <span className="settings-modal__danger-icon mt-0.5 rounded-lg p-2">
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 id="thumbnail-recycle-title" className="settings-modal__confirm-title text-base font-bold">將這批縮圖送到資源回收筒？</h3>
                <p className="settings-modal__confirm-text mt-1 text-sm leading-6">這會將可復原位置中的 {recycleCacheTarget.recoverable_files.toLocaleString()} 個縮圖送到 Windows 資源回收筒，釋放約 {formatBytes(recycleCacheTarget.recoverable_bytes)}。之後可由 Windows 還原。</p>
              </div>
            </div>
            <p className="settings-modal__danger-note rounded-lg px-3 py-2 text-xs leading-5">只會刪除縮圖快取，不會刪除原始圖片。</p>
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button ref={recycleCacheCancelRef} type="button" onClick={() => setRecycleCacheTarget(null)} disabled={recycleCacheLoading} variant="plain">
                取消
              </Button>
              <Button type="button" onClick={handleRecycleThumbnailCache} disabled={recycleCacheLoading} variant="danger">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {recycleCacheLoading ? '移動中…' : '送到資源回收筒'}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
