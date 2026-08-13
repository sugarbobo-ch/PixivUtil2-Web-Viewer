import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import '../styles/settings.css';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Database,
  Expand,
  Gauge,
  Image as ImageIcon,
  Lock,
  Maximize2,
  Minimize2,
  Moon,
  MoveHorizontal,
  MoveVertical,
  Rewind,
  Save,
  ScanSearch,
  Settings,
  Shield,
  Sliders,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { Button, IconButton } from './ui';
import {
  LibraryJob,
  ThumbnailCacheRecoveryDetails,
  ThumbnailCacheRecoveryJob,
  ThumbnailCacheStats,
  HiddenArtist,
  Artist,
  WebConfig,
} from '../types';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';
import { getArtistScopeKey } from '../utils/artistIdentity';
import { getCompletedLibraryUpdateDescription } from '../utils/libraryJobPresentation';
import { getOperationErrorMessage } from '../utils/operationError';
import {
  isLibraryJobActive,
  useLibraryJobStore,
} from '../hooks/useLibraryJobStore';
import { useWebConfigController } from '../hooks/useWebConfigController';
import { ApiError, apiClient, isAbortError } from '../api/client';
import { UI_LANGUAGE_OPTIONS, useI18n } from '../i18n';
import {
  SettingsBackupTab,
  SettingsLibraryTab,
  SettingsPixivTab,
  SettingsWebTab,
} from './settings/SettingsTabPanels';
import { SettingsFullscreenPanel } from './settings/SettingsFullscreenPanel';
import { SettingsWebPreferencesPanel } from './settings/SettingsWebPreferencesPanel';
import { SettingsLibraryContent } from './settings/SettingsLibraryContent';
import { SettingsPixivContent } from './settings/SettingsPixivContent';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved: (savedConfig?: Partial<WebConfig>) => void;
  onArtistVisibilityChanged?: () => void;
  onOpenRecycleBin?: () => void;
  artists?: Artist[];
}

type MainTab = 'web' | 'library' | 'pixiv' | 'backup';

interface ConfigPathInfo {
  configPath: string;
  backupPath: string;
  defaultConfigPath: string;
  usingDefaultPath: boolean;
}

interface FeedbackMessage {
  type: 'success' | 'error';
  text: string;
  translationKey?: string;
  translationValues?: Record<string, number | string>;
}

type SourceClosePrompt = 'unsaved' | 'update' | null;

const emptyThumbnailCacheStats: ThumbnailCacheStats = {
  active_files: 0,
  active_bytes: 0,
  tracked_files: 0,
  recoverable_files: 0,
  recoverable_bytes: 0,
  recovery_jobs: [],
};

const RECOVERY_PAGE_SIZE = 24;

const themeOptions = [
  {
    value: 'dark',
    icon: <Moon className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'light',
    icon: <Sun className="h-4 w-4" aria-hidden="true" />,
  },
] as const;

const preferredBrowsingModeOptions = [
  {
    value: 'fullscreen',
    icon: <Maximize2 className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'webtoon',
    icon: <BookOpen className="h-4 w-4" aria-hidden="true" />,
  },
] as const;

const fullscreenZoomModeOptions = [
  {
    value: 'auto',
    icon: <ScanSearch className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'lock',
    icon: <Lock className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'width',
    icon: <MoveHorizontal className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'height',
    icon: <MoveVertical className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'fit',
    icon: <Minimize2 className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'fill',
    icon: <Expand className="h-4 w-4" aria-hidden="true" />,
  },
] as const;

const videoSeekOptions = [3, 5, 10, 15, 30].map((seconds) => ({
  value: seconds,
  icon: <Rewind className="h-4 w-4" aria-hidden="true" />,
}));

const videoHoldSpeedOptions = [1.25, 1.5, 2, 2.5, 3].map((rate) => ({
  value: rate,
  icon: <Gauge className="h-4 w-4" aria-hidden="true" />,
}));

const tabClass = (selected: boolean) =>
  `settings-modal__tab flex items-center gap-2 font-semibold ${selected ? 'is-selected' : ''}`;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
  onArtistVisibilityChanged,
  onOpenRecycleBin,
  artists = [],
}) => {
  const { t, formatNumber } = useI18n();
  const getErrorMessage = (error: unknown) => getOperationErrorMessage(error, t);
  const [mainTab, setMainTab] = useState<MainTab>('web');
  const {
    webConfig,
    setWebConfig,
    loadWebConfig,
    saveWebConfig: saveWebConfigDraft,
    librarySourceHasUnsavedChanges,
    librarySourceNeedsUpdate,
    clearLibrarySourceNeedsUpdate,
  } = useWebConfigController();
  const [pixivSections, setPixivSections] = useState<
    Record<string, Record<string, string>>
  >({});
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
  const [thumbnailCacheStats, setThumbnailCacheStats] =
    useState<ThumbnailCacheStats>(emptyThumbnailCacheStats);
  const [thumbnailCacheLoading, setThumbnailCacheLoading] = useState(false);
  const [expandedRecoveryJobId, setExpandedRecoveryJobId] = useState<
    string | null
  >(null);
  const [recoveryDetails, setRecoveryDetails] =
    useState<ThumbnailCacheRecoveryDetails | null>(null);
  const [recoveryDetailsLoading, setRecoveryDetailsLoading] = useState(false);
  const [recycleCacheTarget, setRecycleCacheTarget] =
    useState<ThumbnailCacheRecoveryJob | null>(null);
  const [recycleCacheLoading, setRecycleCacheLoading] = useState(false);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [sourceClosePrompt, setSourceClosePrompt] =
    useState<SourceClosePrompt>(null);
  const [hiddenArtists, setHiddenArtists] = useState<HiddenArtist[]>([]);
  const [selectedArtistIds, setSelectedArtistIds] = useState<string[]>([]);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const hiddenArtistsRequestRef = useRef<Promise<void> | null>(null);
  const thumbnailCacheStatsRequestIdRef = useRef(0);
  const thumbnailCacheStatsAbortRef = useRef<AbortController | null>(null);
  const recoveryDetailsRequestIdRef = useRef(0);
  const recoveryDetailsAbortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const saveConfirmDialogRef = useRef<HTMLDivElement>(null);
  const saveConfirmCancelRef = useRef<HTMLButtonElement>(null);
  const recycleCacheDialogRef = useRef<HTMLDivElement>(null);
  const recycleCacheCancelRef = useRef<HTMLButtonElement>(null);
  const sourceCloseDialogRef = useRef<HTMLDivElement>(null);
  const sourceCloseCancelRef = useRef<HTMLButtonElement>(null);
  const uiLanguageOptions = useMemo(
    () => UI_LANGUAGE_OPTIONS.map(option => ({
      value: option.value,
      label: option.nativeLabel,
      description: option.label,
    })),
    [],
  );
  const fullscreenPageLayoutOptions = useMemo(() => [
    {
      value: 'single' as const,
      label: t('viewer.singlePage'),
      description: t('settings.pageLayoutDescription'),
      icon: <ImageIcon className="h-4 w-4" aria-hidden="true" />,
    },
    {
      value: 'spread' as const,
      label: t('viewer.spreadPage'),
      description: t('settings.pageLayoutDescription'),
      icon: <BookOpen className="h-4 w-4" aria-hidden="true" />,
    },
  ], [t]);
  const fullscreenReadingDirectionOptions = useMemo(() => [
    {
      value: 'ltr' as const,
      label: t('viewer.ltr'),
      description: t('settings.readingDirectionDescription'),
      icon: <ChevronRight className="h-4 w-4" aria-hidden="true" />,
    },
    {
      value: 'rtl' as const,
      label: t('viewer.rtl'),
      description: t('settings.readingDirectionDescription'),
      icon: <ChevronLeft className="h-4 w-4" aria-hidden="true" />,
    },
  ], [t]);
  const fullscreenSpreadPairingOptions = useMemo(() => [
    {
      value: 'cover-single' as const,
      label: t('viewer.coverSinglePairing'),
      description: t('settings.coverSinglePairingDescription'),
      icon: <ImageIcon className="h-4 w-4" aria-hidden="true" />,
    },
    {
      value: 'first-page' as const,
      label: t('viewer.firstPagePairing'),
      description: t('settings.firstPagePairingDescription'),
      icon: <Columns2 className="h-4 w-4" aria-hidden="true" />,
    },
  ], [t]);
  const localizedThemeOptions = useMemo(() => themeOptions.map(option => ({
    ...option,
    label: t(option.value === 'dark' ? 'settings.dark' : 'settings.light'),
    description: t(option.value === 'dark' ? 'settings.darkDescription' : 'settings.lightDescription'),
  })), [t]);
  const localizedPreferredBrowsingModeOptions = useMemo(() => preferredBrowsingModeOptions.map(option => ({
    ...option,
    label: t(option.value === 'fullscreen' ? 'settings.fullscreen' : 'settings.webtoon'),
    description: t(option.value === 'fullscreen' ? 'settings.fullscreenModeDescription' : 'settings.webtoonDescription'),
  })), [t]);
  const localizedFullscreenZoomModeOptions = useMemo(() => fullscreenZoomModeOptions.map(option => {
    const key = {
      auto: 'settings.zoomAuto',
      lock: 'settings.zoomLock',
      width: 'settings.zoomWidth',
      height: 'settings.zoomHeight',
      fit: 'settings.zoomFit',
      fill: 'settings.zoomFill',
    }[option.value];
    const descriptionKey = `${key}Description` as const;
    return {
      ...option,
      label: t(key),
      description: t(descriptionKey),
    };
  }), [t]);
  const localizedVideoSeekOptions = useMemo(() => videoSeekOptions.map(option => ({
    ...option,
    label: t('settings.seekSeconds', { seconds: option.value }),
    description: t('settings.seekDescription', { seconds: option.value }),
  })), [t]);
  const localizedVideoHoldSpeedOptions = useMemo(() => videoHoldSpeedOptions.map(option => ({
    ...option,
    label: t('settings.holdSpeed', { rate: option.value }),
    description: t('settings.holdSpeedDescription', { rate: option.value }),
  })), [t]);

  const cancelThumbnailCacheStatsRequest = useCallback(() => {
    thumbnailCacheStatsRequestIdRef.current += 1;
    thumbnailCacheStatsAbortRef.current?.abort();
    thumbnailCacheStatsAbortRef.current = null;
    setThumbnailCacheLoading(false);
  }, []);

  const cancelRecoveryDetailsRequest = useCallback(() => {
    recoveryDetailsRequestIdRef.current += 1;
    recoveryDetailsAbortRef.current?.abort();
    recoveryDetailsAbortRef.current = null;
    setRecoveryDetailsLoading(false);
  }, []);

  const loadThumbnailCacheStats = useCallback(async () => {
    if (!isOpenRef.current) return;
    cancelThumbnailCacheStatsRequest();
    const requestId = thumbnailCacheStatsRequestIdRef.current;
    const controller = new AbortController();
    thumbnailCacheStatsAbortRef.current = controller;
    setThumbnailCacheLoading(true);
    try {
      const data = await apiClient.library.thumbnailCache.stats({
        signal: controller.signal,
      });
      if (
        thumbnailCacheStatsRequestIdRef.current !== requestId ||
        controller.signal.aborted ||
        !isOpenRef.current
      )
        return;
      setThumbnailCacheStats(data);
    } catch (error) {
      if (
        thumbnailCacheStatsRequestIdRef.current !== requestId ||
        controller.signal.aborted ||
        !isOpenRef.current ||
        isAbortError(error)
      )
        return;
      setMessage({
        type: 'error',
        text: t('settings.errorThumbnailStats', { error: getErrorMessage(error) }),
      });
    } finally {
      if (thumbnailCacheStatsRequestIdRef.current === requestId) {
        thumbnailCacheStatsAbortRef.current = null;
        setThumbnailCacheLoading(false);
      }
    }
  }, [cancelThumbnailCacheStatsRequest, isOpen]);

  const handleLibraryJobFinished = useCallback(
    (job: LibraryJob) => {
      if (!isOpen) return;
      void loadThumbnailCacheStats();
      if (job.status === 'completed') {
        if (job.job_type === 'organize-thumbnail-cache') {
          setMessage({
            type: 'success',
            text: t('settings.thumbnailOrganized', { count: job.cache_moved }),
          });
          return;
        }
        setMessage({
          type: 'success',
          text: t('settings.libraryUpdated', { details: getCompletedLibraryUpdateDescription(job, t, formatNumber) }),
        });
        onSettingsSaved();
        return;
      }
      if (job.status === 'cancelled') {
        setMessage({
          type: 'success',
          text:
            job.job_type === 'organize-thumbnail-cache'
              ? t('settings.thumbnailCancelled', { count: job.cache_moved })
              : t('settings.libraryCancelled'),
        });
        onSettingsSaved();
        return;
      }
      if (job.status === 'failed' || job.status === 'interrupted') {
        setMessage({
          type: 'error',
          text:
            job.error_message ||
            t('settings.libraryIncomplete'),
        });
      }
    },
    [isOpen, loadThumbnailCacheStats, onSettingsSaved],
  );

  const handleLibraryPollingError = useCallback(
    (error: unknown) => {
      if (!isOpen) return;
      setMessage({
        type: 'error',
        text: t('settings.errorLibraryJob', { error: getErrorMessage(error) }),
      });
    },
    [isOpen],
  );

  const {
    libraryJob,
    scanning,
    startLibraryJob,
    syncCurrentJob,
    setJobBusy,
    cancelLibraryJob,
  } = useLibraryJobStore({
    onJobFinished: handleLibraryJobFinished,
    onPollingError: handleLibraryPollingError,
  });

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

  const rootDirectory =
    webConfig.librarySourceMode === 'folder'
      ? webConfig.mediaRootPath || '.'
      : pixivSections.Settings?.rootdirectory ||
        pixivSections.Settings?.rootDirectory ||
        '.';
  useEffect(() => {
    const availableIds = new Set(artists.map((artist) => getArtistScopeKey(artist)));
    setSelectedArtistIds((current) =>
      current.filter((memberId) => availableIds.has(memberId)),
    );
  }, [artists]);

  const loadThumbnailCacheDetails = useCallback(
    async (jobId: string, offset = 0) => {
      if (!isOpenRef.current) return;
      cancelRecoveryDetailsRequest();
      const requestId = recoveryDetailsRequestIdRef.current;
      const controller = new AbortController();
      recoveryDetailsAbortRef.current = controller;
      setRecoveryDetailsLoading(true);
      try {
        const data = await apiClient.library.thumbnailCache.entries(
          jobId,
          { offset, limit: RECOVERY_PAGE_SIZE },
          { signal: controller.signal },
        );
        if (
          recoveryDetailsRequestIdRef.current !== requestId ||
          controller.signal.aborted ||
          !isOpenRef.current
        )
          return;
        setRecoveryDetails(data);
      } catch (error) {
        if (
          recoveryDetailsRequestIdRef.current !== requestId ||
          controller.signal.aborted ||
          !isOpenRef.current ||
          isAbortError(error)
        )
          return;
        setRecoveryDetails(null);
        setMessage({
          type: 'error',
          text: t('settings.errorThumbnailEntries', { error: getErrorMessage(error) }),
        });
      } finally {
        if (recoveryDetailsRequestIdRef.current === requestId) {
          recoveryDetailsAbortRef.current = null;
          setRecoveryDetailsLoading(false);
        }
      }
    },
    [cancelRecoveryDetailsRequest, isOpen],
  );

  const handleToggleRecoveryDetails = (jobId: string) => {
    if (expandedRecoveryJobId === jobId) {
      cancelRecoveryDetailsRequest();
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
    if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${formatNumber(bytes / (1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
    return `${formatNumber(bytes / (1024 * 1024 * 1024), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GB`;
  };

  const loadHiddenArtists = () => {
    if (hiddenArtistsRequestRef.current) return hiddenArtistsRequestRef.current;

    const request = (async () => {
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const data = await apiClient.artists.hidden();
          setHiddenArtists(data);
          return;
        } catch (error) {
          lastError = error;
          if (attempt === 0 && error instanceof TypeError) {
            await new Promise((resolve) => window.setTimeout(resolve, 300));
            continue;
          }

          setMessage({
            type: 'error',
            text: t('settings.errorHiddenArtists', { error: getErrorMessage(lastError) }),
          });
          return;
        }
      }

      setMessage({
        type: 'error',
        text: t('settings.errorHiddenArtists', { error: getErrorMessage(lastError) }),
      });
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
      await apiClient.artists.unhide(artist.folder_id || artist.scope_key || String(artist.member_id));
      await loadHiddenArtists();
      onArtistVisibilityChanged?.();
      setMessage({
        type: 'success',
        text: t('settings.artistUnhidden', { name: artist.display_name || artist.name || artist.folder_name || artist.member_id }),
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorUnhideArtist', { error: getErrorMessage(error) }),
      });
    }
  };

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const [, pixivData, libraryData] = await Promise.all([
        loadWebConfig(),
        apiClient.pixivConfig.get().catch((error) => {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }),
        apiClient.libraryJobs.current(),
      ]);
      const nextSections = pixivData?.sections || {};
      const nextSectionKeys = Object.keys(nextSections);

      setPixivSections(nextSections);
      syncCurrentJob(libraryData.job);
      setHasBackup(!!pixivData?.hasBackup);
      setConfigPathInfo({
        configPath: pixivData?.configPath || '',
        backupPath: pixivData?.backupPath || '',
        defaultConfigPath: pixivData?.defaultConfigPath || '',
        usingDefaultPath: !!pixivData?.usingDefaultPath,
      });
      void loadThumbnailCacheStats();

      setActiveSection((current) => {
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
      cancelThumbnailCacheStatsRequest();
      cancelRecoveryDetailsRequest();
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
  }, [cancelRecoveryDetailsRequest, cancelThumbnailCacheStatsRequest, isOpen]);

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
  }, [
    isOpen,
    recycleCacheLoading,
    recycleCacheTarget,
    requestClose,
    showSaveConfirm,
    sourceClosePrompt,
  ]);

  const saveWebConfig = async (): Promise<boolean> => {
    setLoading(true);
    setMessage(null);
    try {
      const savedConfig = await saveWebConfigDraft();
      setMessage({
        type: 'success',
        text: '',
        translationKey: 'settings.webConfigSaved',
      });
      onSettingsSaved(savedConfig);
      return true;
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorWebConfigSave', { error: getErrorMessage(error) }),
      });
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
      await apiClient.webConfig.update({
        pixivConfigPath: webConfig.pixivConfigPath.trim(),
      });
      await loadConfigs();
      setMainTab('pixiv');
      setMessage({
        type: 'success',
        text: t('settings.pixivPathSaved'),
      });
      onSettingsSaved();
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorPixivPathSave', { error: getErrorMessage(error) }),
      });
      setLoading(false);
    }
  };

  const handleSavePixivConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const updates = Object.entries(pixivSections).flatMap(
        ([section, options]) =>
          Object.entries(options).map(([option, value]) => ({
            section,
            option,
            value: String(value),
          })),
      );

      const data = await apiClient.pixivConfig.update(updates);

      setHasBackup(true);
      setConfigPathInfo((current) => ({
        ...current,
        configPath: data.configPath || current.configPath,
        backupPath: data.backupPath || current.backupPath,
      }));
      setShowSaveConfirm(false);
      setMessage({
        type: 'success',
        text: t('settings.pixivConfigSaved'),
      });
      onSettingsSaved();
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorPixivConfigSave', { error: getErrorMessage(error) }),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await apiClient.settings.backup();
      setHasBackup(true);
      setConfigPathInfo((current) => ({
        ...current,
        configPath: data.configPath || current.configPath,
        backupPath: data.backupPath || current.backupPath,
      }));
      setMessage({ type: 'success', text: data.message || t('settings.backupCreated') });
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorBackupCreate', { error: getErrorMessage(error) }),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    setLoading(true);
    setMessage(null);
    try {
      await apiClient.settings.restore();
      await loadConfigs();
      setMessage({
        type: 'success',
        text: t('settings.backupRestored'),
      });
      onSettingsSaved();
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorBackupRestore', { error: getErrorMessage(error) }),
      });
    } finally {
      setLoading(false);
    }
  };

  const startLibraryUpdate = async (): Promise<boolean> => {
    if (isLibraryJobActive(libraryJob)) return false;
    setJobBusy(true);
    setMessage(null);
    try {
      const data = await apiClient.libraryJobs.start({
        type: 'update-library',
        analyze_colors: webConfig.analyzeColorsAfterLibraryUpdate,
      });
      if (!data.job) throw new Error(t('settings.jobNotCreated'));
      startLibraryJob(data.job);
      setMessage({ type: 'success', text: t('settings.libraryUpdateStarted') });
      clearLibrarySourceNeedsUpdate();
      return true;
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorLibraryUpdate', { error: getErrorMessage(error) }),
      });
      setJobBusy(false);
      return false;
    }
  };

  const handleRescanDirectory = async () => {
    if (librarySourceHasUnsavedChanges) {
      setMessage({
        type: 'error',
        text: t('settings.unsavedSource'),
      });
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
    setJobBusy(true);
    setMessage(null);
    try {
      const data = await apiClient.libraryJobs.start({
        type: 'update-library',
        folder_ids: selectedArtistIds,
        analyze_colors: webConfig.analyzeColorsAfterLibraryUpdate,
        priority: 20,
      });
      if (!data.job) throw new Error(t('settings.artistJobNotCreated'));
      startLibraryJob(data.job);
      setMessage({
        type: 'success',
        text: t('settings.artistsUpdateScheduled', { count: selectedArtistIds.length }),
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorArtistsUpdate', { error: getErrorMessage(error) }),
      });
    } finally {
      setJobBusy(false);
    }
  };

  const handleAnalyzeMissingColors = async () => {
    if (libraryJobIsBusy) return;
    setJobBusy(true);
    setMessage(null);
    try {
      const data = await apiClient.libraryJobs.start({
        type: 'analyze-missing-colors',
        directory: rootDirectory,
      });
      if (!data.job) throw new Error(t('settings.jobNotCreated'));
      startLibraryJob(data.job);
      setMessage({ type: 'success', text: t('settings.colorsAnalysisStarted') });
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorColorsAnalysis', { error: getErrorMessage(error) }),
      });
      setJobBusy(false);
    }
  };

  const handleOrganizeThumbnailCache = async () => {
    if (libraryJobIsBusy) return;
    setJobBusy(true);
    setMessage(null);
    try {
      const data = await apiClient.libraryJobs.start({
        type: 'organize-thumbnail-cache',
        directory: rootDirectory,
      });
      if (!data.job) throw new Error(t('settings.jobNotCreated'));
      startLibraryJob(data.job);
      setMessage({ type: 'success', text: t('settings.thumbnailOrganizationStarted') });
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorThumbnailOrganization', { error: getErrorMessage(error) }),
      });
      setJobBusy(false);
    }
  };

  const handleRestoreThumbnailCache = async (jobId: string) => {
    if (libraryJobIsBusy) return;
    setThumbnailCacheLoading(true);
    setMessage(null);
    try {
      const data = await apiClient.library.thumbnailCache.restore(jobId);
      const conflictText =
        data.conflicts > 0
          ? t('settings.thumbnailConflictSuffix', { count: data.conflicts })
          : '';
      setMessage({
        type: 'success',
        text: t('settings.thumbnailRestored', { count: data.restored, conflicts: conflictText }),
      });
      await loadThumbnailCacheStats();
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorThumbnailRestore', { error: getErrorMessage(error) }),
      });
    } finally {
      setThumbnailCacheLoading(false);
    }
  };

  const handleRecycleThumbnailCache = async () => {
    if (!recycleCacheTarget || libraryJobIsBusy) return;
    cancelRecoveryDetailsRequest();
    setRecycleCacheLoading(true);
    setMessage(null);
    try {
      const data = await apiClient.library.thumbnailCache.recycle(
        recycleCacheTarget.job_id,
      );
      setRecycleCacheTarget(null);
      setExpandedRecoveryJobId(null);
      setRecoveryDetails(null);
      await loadThumbnailCacheStats();
      if (data.errors.length > 0) {
        setMessage({
          type: 'error',
          text: t('settings.thumbnailRecycledPartial', {
            moved: data.moved,
            bytes: formatBytes(data.bytes_freed),
            remaining: data.remaining,
          }),
        });
      } else {
        setMessage({
          type: 'success',
          text: t('settings.thumbnailRecycled', {
            moved: data.moved,
            bytes: formatBytes(data.bytes_freed),
          }),
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorThumbnailRecycle', { error: getErrorMessage(error) }),
      });
    } finally {
      setRecycleCacheLoading(false);
    }
  };

  const handleCancelLibraryJob = async () => {
    if (!libraryJob || !isLibraryJobActive(libraryJob)) return;
    try {
      await cancelLibraryJob(libraryJob.job_id);
      setMessage({ type: 'success', text: t('settings.libraryStopRequested') });
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('settings.errorLibraryStop', { error: getErrorMessage(error) }),
      });
    }
  };

  const updatePixivValue = (section: string, option: string, value: string) => {
    setPixivSections((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [option]: value,
      },
    }));
  };

  const libraryJobIsActive = isLibraryJobActive(libraryJob);
  const libraryJobIsBusy = scanning || libraryJobIsActive;
  const libraryProgress =
    libraryJob?.total && libraryJob.total > 0
      ? Math.min(
          100,
          Math.round((libraryJob.processed / libraryJob.total) * 100),
        )
      : null;

  const handleMainTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    event.preventDefault();
    const tabs: MainTab[] = ['web', 'library', 'pixiv', 'backup'];
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
            tabs.length;
    const nextTab = tabs[nextIndex];
    setMainTab(nextTab);
    window.setTimeout(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-main-tab="${nextTab}"]`)
        ?.focus();
    }, 0);
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) requestClose();
  };

  const handleSaveConfirmBackdropClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.target === event.currentTarget) setShowSaveConfirm(false);
  };

  const handleRecycleCacheBackdropClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.target === event.currentTarget && !recycleCacheLoading)
      setRecycleCacheTarget(null);
  };

  const handleSourceCloseBackdropClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.target === event.currentTarget && !loading)
      setSourceClosePrompt(null);
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
            <h2
              id="settings-modal-title"
              className="settings-modal__title truncate text-lg font-bold"
            >
              {t('settings.webViewerTitle')}
            </h2>
          </div>
          <IconButton
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            variant="ghost"
            aria-label={t('settings.closeButton')}
            className="settings-modal__close"
          >
            <X className="mx-auto h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>

        {message && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`settings-modal__message flex shrink-0 items-start gap-2 text-sm ${
              message.type === 'success' ? 'is-success' : 'is-error'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
            )}
            <span className="break-words">
              {message.translationKey
                ? t(message.translationKey, message.translationValues)
                : message.text}
            </span>
          </div>
        )}

        <div
          role="tablist"
          aria-label={t('settings.tabs')}
          className="settings-modal__tabs shrink-0"
        >
          {(
            [
              ['web', t('settings.displayAndBrowsing'), Sliders],
              ['library', t('settings.library'), Database],
              ['pixiv', t('settings.configFile'), Settings],
              ['backup', t('settings.backup'), Shield],
            ] as const
          ).map(([tab, label, Icon], index) => (
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
              onKeyDown={(event) => handleMainTabKeyDown(event, index)}
              className={tabClass(mainTab === tab)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="settings-modal__content min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {mainTab === 'web' && (
            <SettingsWebTab
              hiddenArtists={hiddenArtists}
              onUnhideArtist={handleUnhideArtist}
              onOpenRecycleBin={onOpenRecycleBin}
            >
              <SettingsWebPreferencesPanel
                webConfig={webConfig}
                setWebConfig={setWebConfig}
                uiLanguageOptions={uiLanguageOptions}
                localizedThemeOptions={localizedThemeOptions}
                localizedPreferredBrowsingModeOptions={localizedPreferredBrowsingModeOptions}
                localizedVideoSeekOptions={localizedVideoSeekOptions}
                localizedVideoHoldSpeedOptions={localizedVideoHoldSpeedOptions}
              >
                <SettingsFullscreenPanel
                  webConfig={webConfig}
                  setWebConfig={setWebConfig}
                  fullscreenPageLayoutOptions={fullscreenPageLayoutOptions}
                  fullscreenReadingDirectionOptions={fullscreenReadingDirectionOptions}
                  fullscreenSpreadPairingOptions={fullscreenSpreadPairingOptions}
                  localizedFullscreenZoomModeOptions={localizedFullscreenZoomModeOptions}
                />
              </SettingsWebPreferencesPanel>
            </SettingsWebTab>
          )}

          {mainTab === 'library' && (
            <SettingsLibraryTab>
              <SettingsLibraryContent
                webConfig={webConfig}
                setWebConfig={setWebConfig}
                rootDirectory={rootDirectory}
                librarySourceHasUnsavedChanges={librarySourceHasUnsavedChanges}
                libraryJobIsBusy={libraryJobIsBusy}
                onRescanDirectory={() => void handleRescanDirectory()}
                artists={artists}
                selectedArtistIds={selectedArtistIds}
                setSelectedArtistIds={setSelectedArtistIds}
                onUpdateSelectedArtists={() => void handleUpdateSelectedArtists()}
                scanning={scanning}
                onAnalyzeMissingColors={() => void handleAnalyzeMissingColors()}
                onOrganizeThumbnailCache={() => void handleOrganizeThumbnailCache()}
                libraryJob={libraryJob}
                libraryJobIsActive={libraryJobIsActive}
                libraryProgress={libraryProgress}
                onCancelLibraryJob={() => void handleCancelLibraryJob()}
                thumbnailCacheStats={thumbnailCacheStats}
                thumbnailCacheLoading={thumbnailCacheLoading}
                expandedRecoveryJobId={expandedRecoveryJobId}
                recoveryDetails={recoveryDetails}
                recoveryDetailsLoading={recoveryDetailsLoading}
                onToggleRecoveryDetails={handleToggleRecoveryDetails}
                onRestoreThumbnailCache={(jobId) => void handleRestoreThumbnailCache(jobId)}
                onRecycleThumbnailCache={setRecycleCacheTarget}
                onRecoveryPageChange={handleRecoveryPageChange}
              />
            </SettingsLibraryTab>
          )}

          {mainTab === 'pixiv' && (
            <SettingsPixivTab>
              <SettingsPixivContent
                webConfig={webConfig}
                setWebConfig={setWebConfig}
                pixivSections={pixivSections}
                activeSection={activeSection}
                setActiveSection={setActiveSection}
                sectionFilter={sectionFilter}
                setSectionFilter={setSectionFilter}
                configPathInfo={configPathInfo}
                loading={loading}
                onSaveConfigPath={() => void handleSaveConfigPath()}
                onUpdateValue={updatePixivValue}
                onNavigateToLibrary={() => setMainTab('library')}
              />
            </SettingsPixivTab>
          )}

          {mainTab === 'backup' && (
            <SettingsBackupTab
              configPath={configPathInfo.configPath}
              backupPath={configPathInfo.backupPath}
              hasBackup={hasBackup}
              loading={loading}
              onCreateBackup={() => void handleCreateBackup()}
              onRestoreBackup={() => void handleRestoreBackup()}
            />
          )}
        </div>

        <footer className="settings-modal__footer flex shrink-0 flex-wrap items-center justify-end gap-3">
          <Button type="button" onClick={requestClose} variant="plain">
            {t('settings.closeSettings')}
          </Button>
          {(mainTab === 'web' || mainTab === 'library') && (
            <Button
              type="button"
              onClick={handleSaveWebConfig}
              disabled={loading || (mainTab === 'library' && libraryJobIsBusy)}
              variant="primary"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {loading
                ? t('settings.loading')
                : mainTab === 'library'
                  ? t('settings.saveLibrarySettings')
                  : t('settings.saveDisplaySettings')}
            </Button>
          )}
          {mainTab === 'pixiv' && (
            <Button
              type="button"
              onClick={() => setShowSaveConfirm(true)}
              disabled={loading}
              variant="primary"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {t('settings.savePixivSettings')}
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
            <h3
              id="source-close-title"
              className="settings-modal__confirm-title text-base font-bold"
            >
              {sourceClosePrompt === 'unsaved'
                ? t('settings.unsavedSourceTitle')
                : t('settings.outdatedLibraryTitle')}
            </h3>
            <p
              id="source-close-description"
              className="settings-modal__confirm-text text-sm leading-6"
            >
              {sourceClosePrompt === 'unsaved'
                ? t('settings.unsavedSourceMessage')
                : t('settings.outdatedLibraryMessage')}
            </p>
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button
                ref={sourceCloseCancelRef}
                type="button"
                onClick={() => setSourceClosePrompt(null)}
                disabled={loading}
                variant="plain"
              >
                {t('settings.backToSettings')}
              </Button>
              <Button
                type="button"
                onClick={handleConfirmSourceClose}
                disabled={loading}
                variant="primary"
              >
                {loading
                  ? t('common.processing')
                  : sourceClosePrompt === 'unsaved'
                    ? t('settings.saveAndUpdate')
                    : t('settings.updateLibrary')}
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
          <div
            ref={saveConfirmDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-confirm-title"
            className="settings-modal__confirm-panel w-full max-w-md space-y-4 rounded-2xl p-5"
          >
            <h3
              id="save-confirm-title"
              className="settings-modal__confirm-title text-base font-bold"
            >
              {t('settings.savePixivConfirmTitle')}
            </h3>
            <p className="settings-modal__confirm-text text-sm leading-6">
              {t('settings.savePixivConfirmMessage')}
            </p>
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button
                ref={saveConfirmCancelRef}
                type="button"
                onClick={() => setShowSaveConfirm(false)}
                variant="plain"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleSavePixivConfig}
                disabled={loading}
                variant="primary"
              >
                {t('common.save')}
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
          <div
            ref={recycleCacheDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="thumbnail-recycle-title"
            className="settings-modal__confirm-panel w-full max-w-md space-y-4 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <span className="settings-modal__danger-icon mt-0.5 rounded-lg p-2">
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3
                  id="thumbnail-recycle-title"
                  className="settings-modal__confirm-title text-base font-bold"
                >
                  {t('settings.thumbnailRecycleTitle')}
                </h3>
                <p className="settings-modal__confirm-text mt-1 text-sm leading-6">
                  {t('settings.thumbnailRecycleMessage', {
                    count: formatNumber(recycleCacheTarget.recoverable_files),
                    bytes: formatBytes(recycleCacheTarget.recoverable_bytes),
                  })}
                </p>
              </div>
            </div>
            <p className="settings-modal__danger-note rounded-lg px-3 py-2 text-xs leading-5">
              {t('settings.thumbnailRecycleNote')}
            </p>
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button
                ref={recycleCacheCancelRef}
                type="button"
                onClick={() => setRecycleCacheTarget(null)}
                disabled={recycleCacheLoading}
                variant="plain"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleRecycleThumbnailCache}
                disabled={recycleCacheLoading}
                variant="danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {recycleCacheLoading ? t('settings.moving') : t('settings.sendToRecycle')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
