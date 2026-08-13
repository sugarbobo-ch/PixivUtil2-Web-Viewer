import React from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Database,
  Eye,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import { getArtistScopeKey } from '../../utils/artistIdentity';
import {
  getLibraryJobStatusDescription,
  getLibraryJobStatusTitle,
} from '../../utils/libraryJobPresentation';
import { DemoMediaBlock } from '../DemoMediaBlock';
import { PathPickerField } from '../PathPickerField';
import { Button, Input } from '../ui';
import type {
  Artist,
  LibraryJob,
  ThumbnailCacheRecoveryDetails,
  ThumbnailCacheRecoveryJob,
  ThumbnailCacheStats,
  WebConfigDraft,
} from '../../types';

interface SettingsLibraryContentProps {
  webConfig: WebConfigDraft;
  setWebConfig: React.Dispatch<React.SetStateAction<WebConfigDraft>>;
  rootDirectory: string;
  librarySourceHasUnsavedChanges: boolean;
  libraryJobIsBusy: boolean;
  onRescanDirectory: () => void | Promise<void>;
  artists: Artist[];
  selectedArtistIds: string[];
  setSelectedArtistIds: React.Dispatch<React.SetStateAction<string[]>>;
  onUpdateSelectedArtists: () => void | Promise<void>;
  scanning: boolean;
  onAnalyzeMissingColors: () => void | Promise<void>;
  onOrganizeThumbnailCache: () => void | Promise<void>;
  libraryJob: LibraryJob | null;
  libraryJobIsActive: boolean;
  libraryProgress: number | null;
  onCancelLibraryJob: () => void | Promise<void>;
  thumbnailCacheStats: ThumbnailCacheStats;
  thumbnailCacheLoading: boolean;
  expandedRecoveryJobId: string | null;
  recoveryDetails: ThumbnailCacheRecoveryDetails | null;
  recoveryDetailsLoading: boolean;
  onToggleRecoveryDetails: (jobId: string) => void;
  onRestoreThumbnailCache: (jobId: string) => void | Promise<void>;
  onRecycleThumbnailCache: (job: ThumbnailCacheRecoveryJob) => void;
  onRecoveryPageChange: (jobId: string, offset: number) => void;
}

const SettingsSwitch: React.FC<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
> = (props) => (
  <input
    {...props}
    type="checkbox"
    role="switch"
    aria-checked={props.checked}
    className="settings-modal__switch"
  />
);

export const SettingsLibraryContent: React.FC<SettingsLibraryContentProps> = ({
  webConfig,
  setWebConfig,
  rootDirectory,
  librarySourceHasUnsavedChanges,
  libraryJobIsBusy,
  onRescanDirectory,
  artists,
  selectedArtistIds,
  setSelectedArtistIds,
  onUpdateSelectedArtists,
  scanning,
  onAnalyzeMissingColors,
  onOrganizeThumbnailCache,
  libraryJob,
  libraryJobIsActive,
  libraryProgress,
  onCancelLibraryJob,
  thumbnailCacheStats,
  thumbnailCacheLoading,
  expandedRecoveryJobId,
  recoveryDetails,
  recoveryDetailsLoading,
  onToggleRecoveryDetails,
  onRestoreThumbnailCache,
  onRecycleThumbnailCache,
  onRecoveryPageChange,
}) => {
  const { t, formatNumber, formatDate } = useI18n();

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024 * 1024) {
      return `${formatNumber(Math.round(bytes / 1024))} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${formatNumber(bytes / (1024 * 1024), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} MB`;
    }
    return `${formatNumber(bytes / (1024 * 1024 * 1024), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} GB`;
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return t('settings.unknownTime');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return formatDate(date);
  };

  const getRecoveryReasonLabel = (reason: string) =>
    ({
      'missing-source': t('settings.recoveryMissingSource'),
      'stale-source': t('settings.recoveryStaleSource'),
      'old-size': t('settings.recoveryOldSize'),
      lru: t('settings.recoveryLru'),
    })[reason] || t('settings.recoveryOrganized');

  const getPathFileName = (path: string | null) => {
    if (!path) return t('settings.noSourceData');
    return path.split(/[\\/]/).pop() || path;
  };

  return (
    <>
<section
                aria-labelledby="media-library-images-title"
                className="settings-modal__library-section space-y-4"
              >
                <div>
                  <h4
                    id="media-library-images-title"
                    className="settings-modal__heading text-sm font-bold"
                  >
                    {t('settings.imageDatabase')}
                  </h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">
                    {t('settings.imageDatabaseDescription')}
                  </p>
                </div>

                <fieldset className="settings-modal__source-settings space-y-4">
                  <legend className="settings-modal__label text-sm font-semibold">
                    {t('settings.mediaSource')}
                  </legend>
                  <div className="settings-modal__source-mode grid gap-2 sm:grid-cols-2">
                    <label className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm">
                      <input
                        type="radio"
                        name="library-source-mode"
                        value="pixiv"
                        checked={webConfig.librarySourceMode === 'pixiv'}
                        onChange={() =>
                          setWebConfig((current) => ({
                            ...current,
                            librarySourceMode: 'pixiv',
                          }))
                        }
                        disabled={libraryJobIsBusy}
                        className="settings-modal__checkbox h-4 w-4 shrink-0"
                      />
                      <span>
                        <span className="block font-semibold">{t('settings.pixivSource')}</span>
                        <span className="settings-modal__description block text-xs">
                          {t('settings.pixivSourceDescription')}
                        </span>
                      </span>
                    </label>
                    <label className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm">
                      <input
                        type="radio"
                        name="library-source-mode"
                        value="folder"
                        checked={webConfig.librarySourceMode === 'folder'}
                        onChange={() =>
                          setWebConfig((current) => ({
                            ...current,
                            librarySourceMode: 'folder',
                          }))
                        }
                        disabled={libraryJobIsBusy}
                        className="settings-modal__checkbox h-4 w-4 shrink-0"
                      />
                      <span>
                        <span className="block font-semibold">
                          {t('settings.folderOnly')}
                        </span>
                        <span className="settings-modal__description block text-xs">
                          {t('settings.folderOnlyDescription')}
                        </span>
                      </span>
                    </label>
                  </div>
                  {webConfig.librarySourceMode === 'folder' ? (
                    <div>
                      <label
                        htmlFor="library-folder-path"
                        className="settings-modal__label mb-1.5 block text-sm font-semibold"
                      >
                        {t('settings.imageFolder')}
                      </label>
                      <PathPickerField
                        id="library-folder-path"
                        value={webConfig.mediaRootPath}
                        label={t('settings.imageFolder')}
                        placeholder={t('settings.chooseImageFolder')}
                        metadata={{
                          mode: 'folder',
                          purpose: 'root-directory',
                          access: 'read',
                        }}
                        onChange={(mediaRootPath) =>
                          setWebConfig((current) => ({
                            ...current,
                            mediaRootPath,
                          }))
                        }
                      />
                    </div>
                  ) : (
                    <div>
                      <label
                        htmlFor="library-pixiv-config-path"
                        className="settings-modal__label mb-1.5 block text-sm font-semibold"
                      >
                        {t('settings.configFile')}
                      </label>
                      <PathPickerField
                        id="library-pixiv-config-path"
                        value={webConfig.pixivConfigPath}
                        label={t('settings.configFile')}
                        placeholder={t('settings.chooseConfigFile')}
                        metadata={{
                          mode: 'existing-file',
                          purpose: 'pixiv-config',
                          extensions: ['.ini'],
                          access: 'read',
                        }}
                        onChange={(pixivConfigPath) =>
                          setWebConfig((current) => ({
                            ...current,
                            pixivConfigPath,
                          }))
                        }
                      />
                    </div>
                  )}
                </fieldset>

                <div className="settings-modal__library-source flex min-w-0 flex-col gap-1 rounded-xl p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <span className="settings-modal__text-subtle block text-xs font-semibold">
                      {t('settings.imageFolder')}
                    </span>
                    <code className="settings-modal__library-path mt-1 block break-all font-mono text-xs">
                      {rootDirectory}
                    </code>
                  </div>
                  <span className="settings-modal__library-source-label shrink-0 text-xs">
                    {t('settings.readOnlySource')}
                  </span>
                </div>
                <p className="settings-modal__description text-xs leading-5">
                  {webConfig.librarySourceMode === 'folder'
                    ? t('settings.folderScanDescription')
                    : t('settings.pixivRootDescription')}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={() => void onRescanDirectory()}
                    disabled={
                      libraryJobIsBusy || librarySourceHasUnsavedChanges
                    }
                    variant="primary"
                  >
                    <RefreshCw
                      className={`settings-modal__library-status-icon h-4 w-4 ${libraryJobIsBusy ? 'is-active' : ''}`}
                      aria-hidden="true"
                    />
                    {libraryJobIsBusy ? t('settings.loading') : t('settings.updateLibrary')}
                  </Button>
                  <span className="settings-modal__description text-xs">
                    {librarySourceHasUnsavedChanges
                      ? t('settings.saveSourceBeforeUpdate')
                      : t('settings.backgroundJobDescription')}
                  </span>
                </div>

                <div
                  className="settings-modal__library-options space-y-3 rounded-xl p-4"
                  aria-label={t('settings.colorAnalysis')}
                >
                  <div
                    className="space-y-3"
                    role="group"
                    aria-labelledby="selected-artists-title"
                    aria-describedby="selected-artists-help"
                  >
                    <div>
                      <h5
                        id="selected-artists-title"
                        className="settings-modal__heading text-sm font-semibold"
                      >
                        {t('settings.selectArtists')}
                      </h5>
                      <p
                        id="selected-artists-help"
                        className="settings-modal__description mt-1 text-xs leading-5"
                      >
                        {t('settings.selectArtistsDescription')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setSelectedArtistIds(
                            artists
                              .filter((artist) => artist.member_id > 0)
                              .map((artist) => getArtistScopeKey(artist)),
                          )
                        }
                        disabled={libraryJobIsBusy || artists.length === 0}
                      >
                        {t('settings.selectAllArtists')}
                      </Button>
                      <Button
                        type="button"
                        variant="plain"
                        onClick={() => setSelectedArtistIds([])}
                        disabled={
                          libraryJobIsBusy || selectedArtistIds.length === 0
                        }
                      >
                        {t('settings.clearSelected')}
                      </Button>
                    </div>
                    {artists.length > 0 ? (
                      <div className="max-h-56 overflow-y-auto overscroll-contain space-y-1 pr-1">
                        {artists
                          .filter((artist) => artist.member_id > 0)
                          .map((artist) => {
                            const artistKey = getArtistScopeKey(artist);
                            const checked = selectedArtistIds.includes(artistKey);
                            const inputId = `library-artist-${artistKey}`;
                            return (
                              <label
                                key={artistKey}
                                htmlFor={inputId}
                                className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm"
                              >
                                <input
                                  id={inputId}
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedArtistIds((current) =>
                                      checked
                                        ? current.filter(
                                            (artistId) =>
                                              artistId !== artistKey,
                                          )
                                        : [...current, artistKey],
                                    )
                                  }
                                  disabled={libraryJobIsBusy}
                                  className="settings-modal__checkbox h-4 w-4 shrink-0 rounded"
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {artist.name || t('common.artistId', { id: artist.member_id })}
                                </span>
                                <span className="settings-modal__text-subtle shrink-0 text-xs">
                                  {formatNumber(artist.artwork_count)}
                                </span>
                              </label>
                            );
                          })}
                      </div>
                    ) : (
                      <p className="settings-modal__text-subtle text-xs">
                        {t('settings.noArtistsToUpdate')}
                      </p>
                    )}
                    <Button
                      type="button"
                      onClick={() => void onUpdateSelectedArtists()}
                      disabled={
                        libraryJobIsBusy || selectedArtistIds.length === 0
                      }
                      variant="secondary"
                      aria-describedby="selected-artists-help"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${scanning && selectedArtistIds.length > 0 ? 'is-active' : ''}`}
                        aria-hidden="true"
                      />
                      {t('settings.updateSelectedArtists', { count: formatNumber(selectedArtistIds.length) })}
                    </Button>
                  </div>

                  <label
                    htmlFor="analyze-colors-after-update"
                    className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm"
                  >
                    <SettingsSwitch
                      id="analyze-colors-after-update"
                      checked={webConfig.analyzeColorsAfterLibraryUpdate}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          analyzeColorsAfterLibraryUpdate: event.target.checked,
                        }))
                      }
                      disabled={libraryJobIsBusy}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {t('settings.analyzeAfterUpdate')}
                      </span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">
                        {t('settings.analyzeAfterUpdateDescription')}
                      </span>
                    </span>
                  </label>
                  <Button
                    type="button"
                    onClick={() => void onAnalyzeMissingColors()}
                    disabled={libraryJobIsBusy}
                    variant="secondary"
                  >
                    {t('settings.analyzeMissingColors')}
                  </Button>
                  <p className="settings-modal__text-subtle text-xs leading-5">
                    {t('settings.analyzeMissingColorsDescription')}
                  </p>
                </div>
              </section>

              <section
                aria-labelledby="media-library-jobs-title"
                className="settings-modal__library-section space-y-4"
              >
                <div>
                  <h4
                    id="media-library-jobs-title"
                    className="settings-modal__heading text-sm font-bold"
                  >
                    {t('settings.backgroundJobs')}
                  </h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">
                    {t('settings.backgroundJobsDescription')}
                  </p>
                </div>
                <div
                  className="settings-modal__library-status flex items-start gap-3 rounded-xl p-4"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <RefreshCw
                    className={`settings-modal__library-status-icon mt-0.5 h-4 w-4 shrink-0 ${libraryJobIsBusy ? 'is-active' : ''}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="settings-modal__library-status-title text-sm font-semibold">
                      {getLibraryJobStatusTitle(libraryJob, t)}
                    </p>
                    <p className="settings-modal__description mt-1 text-xs leading-5">
                      {getLibraryJobStatusDescription(libraryJob, t, formatNumber)}
                    </p>
                    {libraryJob &&
                      (libraryJobIsActive ||
                        libraryJob.errors > 0 ||
                        libraryJob.conflicts > 0) && (
                        <p className="settings-modal__text-subtle mt-2 text-xs leading-5">
                      {libraryJobIsActive
                        ? t('library.jobProgressDetail', {
                          processed: formatNumber(libraryJob.processed),
                          total: formatNumber(libraryJob.total ?? libraryJob.discovered),
                          errors: formatNumber(libraryJob.errors),
                          conflicts: formatNumber(libraryJob.conflicts),
                        })
                        : t('library.jobIssueDetail', {
                          errors: formatNumber(libraryJob.errors),
                          conflicts: formatNumber(libraryJob.conflicts),
                        })}
                        </p>
                      )}
                    {libraryProgress !== null && libraryJobIsActive && (
                      <div
                        className="settings-modal__library-progress mt-3"
                        role="progressbar"
                        aria-label={t('settings.libraryProgress')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={libraryProgress}
                      >
                        <span
                          className="settings-modal__library-progress-bar"
                          style={{ width: `${libraryProgress}%` }}
                        />
                      </div>
                    )}
                    {libraryJobIsActive &&
                      libraryJob?.status === 'cancelling' && (
                        <Button
                          type="button"
                          disabled
                          variant="secondary"
                          className="mt-3"
                        >
                          {t('settings.loading')}
                        </Button>
                      )}
                    {libraryJobIsActive &&
                      libraryJob?.status !== 'cancelling' && (
                        <Button
                          type="button"
                          onClick={() => void onCancelLibraryJob()}
                          variant="plain"
                          className="mt-3"
                        >
                          {t('common.cancel')}
                        </Button>
                      )}
                  </div>
                </div>
              </section>

              <section
                aria-labelledby="media-library-cache-title"
                className="settings-modal__library-section space-y-4"
              >
                <div>
                  <h4
                    id="media-library-cache-title"
                    className="settings-modal__heading text-sm font-bold"
                  >
                    {t('settings.thumbnailStorage')}
                  </h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">
                    {t('settings.thumbnailStorageDescription')}
                  </p>
                </div>
                <div
                  className="settings-modal__cache-summary flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl p-4"
                  aria-live="polite"
                >
                  <Database
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <p className="min-w-0 flex-1 text-sm font-semibold">
                    {thumbnailCacheLoading
                      ? t('settings.cacheReading')
                      : t('settings.cacheSummary', {
                        bytes: formatBytes(thumbnailCacheStats.active_bytes),
                        files: formatNumber(thumbnailCacheStats.active_files),
                      })}
                  </p>
                  <span className="settings-modal__text-subtle w-full text-xs">
                    {t('settings.cacheTracked', { count: formatNumber(thumbnailCacheStats.tracked_files) })}
                  </span>
                </div>
                <div className="settings-modal__library-options space-y-3 rounded-xl p-4">
                  <label
                    htmlFor="manage-thumbnail-cache"
                    className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm"
                  >
                    <SettingsSwitch
                      id="manage-thumbnail-cache"
                      checked={webConfig.manageThumbnailCache}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          manageThumbnailCache: event.target.checked,
                        }))
                      }
                      disabled={libraryJobIsBusy}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {t('settings.autoManageThumbnails')}
                      </span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">
                        {t('settings.autoManageThumbnailsDescription')}
                      </span>
                    </span>
                  </label>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-44">
                      <label
                        htmlFor="thumbnail-cache-limit"
                        className="settings-modal__label mb-1.5 block text-sm font-semibold"
                      >
                        {t('settings.cacheLimit')}
                      </label>
                      <Input
                        controlSize="md"
                        id="thumbnail-cache-limit"
                        type="number"
                        min={128}
                        max={102400}
                        step={128}
                        value={webConfig.thumbnailCacheLimitMiB}
                        onChange={(event) =>
                          setWebConfig((current) => ({
                            ...current,
                            thumbnailCacheLimitMiB: Number(event.target.value),
                          }))
                        }
                        disabled={libraryJobIsBusy}
                        className="max-w-52"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={() => void onOrganizeThumbnailCache()}
                    disabled={libraryJobIsBusy}
                    variant="secondary"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${libraryJob?.phase === 'organizing_cache' ? 'is-active' : ''}`}
                      aria-hidden="true"
                    />
                    {t('settings.organizeThumbnails')}
                  </Button>
                  <span className="settings-modal__description text-xs">
                    {t('settings.organizeThumbnailsDescription')}
                  </span>
                </div>
                {thumbnailCacheStats.recovery_jobs.some(
                  (job) => job.restorable,
                ) && (
                  <div
                    className="settings-modal__cache-recovery space-y-2"
                    aria-label={t('settings.cacheRecovery')}
                  >
                    <div>
                      <p className="settings-modal__text-subtle text-xs font-semibold">
                        {t('settings.cacheRecoveryLocation')}
                      </p>
                      <p className="settings-modal__description mt-1 text-xs leading-5">
                        {t('settings.cacheRecoveryDescription')}
                      </p>
                    </div>
                    {thumbnailCacheStats.recovery_jobs
                      .filter((job) => job.restorable)
                      .map((job) => {
                        const isExpanded = expandedRecoveryJobId === job.job_id;
                        const detailsForJob =
                          recoveryDetails?.job_id === job.job_id
                            ? recoveryDetails
                            : null;
                        const visibleStart = detailsForJob
                          ? detailsForJob.offset + 1
                          : 0;
                        const visibleEnd = detailsForJob
                          ? detailsForJob.offset + detailsForJob.entries.length
                          : 0;
                        return (
                          <React.Fragment key={job.job_id}>
                            <div className="settings-modal__cache-recovery-row flex flex-wrap items-start justify-between gap-3 rounded-lg px-3 py-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">
                                  {t('settings.cacheSummary', {
                                    files: formatNumber(job.recoverable_files),
                                    bytes: formatBytes(job.recoverable_bytes),
                                  })}
                                </p>
                                <p className="settings-modal__description mt-1 text-xs leading-5">
                                  {t('settings.cacheRecoveryJob', { date: formatDateTime(job.created_at) })}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  onClick={() =>
                                    onToggleRecoveryDetails(job.job_id)
                                  }
                                  aria-expanded={isExpanded}
                                  aria-controls={`thumbnail-cache-recovery-${job.job_id}`}
                                  variant="secondary"
                                >
                                  <Eye
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  {isExpanded ? t('settings.collapseDetails') : t('settings.viewDetails')}
                                  {isExpanded ? (
                                    <ChevronUp
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <ChevronDown
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() =>
                                    onRestoreThumbnailCache(job.job_id)
                                  }
                                  disabled={
                                    thumbnailCacheLoading || libraryJobIsBusy
                                  }
                                  variant="secondary"
                                >
                                  {thumbnailCacheLoading ? t('common.processing') : t('common.restore')}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() => onRecycleThumbnailCache(job)}
                                  disabled={
                                    thumbnailCacheLoading || libraryJobIsBusy
                                  }
                                  variant="danger"
                                >
                                  <Trash2
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  {t('settings.sendToRecycle')}
                                </Button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div
                                id={`thumbnail-cache-recovery-${job.job_id}`}
                                className="settings-modal__cache-recovery-detail space-y-3 rounded-2xl p-3"
                              >
                                {recoveryDetailsLoading && (
                                  <p className="settings-modal__description px-1 py-2 text-xs">
                                    {t('settings.cacheDetailsLoading')}
                                  </p>
                                )}
                                {!recoveryDetailsLoading && detailsForJob && (
                                  <>
                                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                                      <span className="settings-modal__text-subtle">
                                        {t('settings.cacheDetailsRange', {
                                          start: formatNumber(visibleStart),
                                          end: formatNumber(visibleEnd),
                                          total: formatNumber(detailsForJob.total),
                                        })}
                                      </span>
                                      <span className="settings-modal__text-subtle">
                                        {t('settings.cacheDetailsTotal', { bytes: formatBytes(detailsForJob.total_bytes) })}
                                      </span>
                                    </div>
                                    {detailsForJob.entries.length > 0 ? (
                                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                        {detailsForJob.entries.map((entry) => {
                                          const displayName = entry.source_path
                                            ? getPathFileName(entry.source_path)
                                            : entry.recovery_name;
                                          return (
                                            <article
                                              key={entry.recovery_name}
                                              className="settings-modal__cache-detail-card overflow-hidden rounded-xl"
                                            >
                                              <div className="settings-modal__cache-detail-preview">
                                                {webConfig.demoMode ? (
                                                  <DemoMediaBlock />
                                                ) : (
                                                  <img
                                                    src={`/api/library/cache/${encodeURIComponent(job.job_id)}/preview/${encodeURIComponent(entry.recovery_name)}`}
                                                    alt={t('settings.thumbnailPreview', { name: displayName })}
                                                    loading="lazy"
                                                  />
                                                )}
                                              </div>
                                              <div className="space-y-1.5 p-3 text-xs">
                                                <p
                                                  className="truncate text-sm font-semibold"
                                                  title={
                                                    entry.source_path ||
                                                    entry.recovery_name
                                                  }
                                                >
                                                  {displayName}
                                                </p>
                                                <p className="settings-modal__text-subtle">
                                                  {t('settings.cacheSize', { bytes: formatBytes(entry.cache_bytes) })}
                                                  ・
                                                  {entry.width && entry.height
                                                    ? `${entry.width} × ${entry.height}`
                                                    : t('settings.cacheDimensions')}
                                                </p>
                                                <p
                                                  className="settings-modal__text-subtle truncate"
                                                  title={entry.recovery_name}
                                                >
                                                  {t('settings.cacheFile')}
                                                  {entry.recovery_name}
                                                </p>
                                                <p className="settings-modal__text-subtle">
                                                  {t('settings.sourceFile')}
                                                  {entry.source_file_size
                                                    ? formatBytes(
                                                        entry.source_file_size,
                                                      )
                                                    : t('settings.unknownSize')}
                                                </p>
                                                <p className="settings-modal__text-subtle">
                                                  {t('settings.reason')}
                                                  {getRecoveryReasonLabel(
                                                    entry.reason,
                                                  )}
                                                </p>
                                                <p
                                                  className="settings-modal__text-subtle truncate"
                                                  title={
                                                    entry.source_path ||
                                                    undefined
                                                  }
                                                >
                                                  {t('settings.source')}
                                                  {entry.source_path ||
                                                    t('settings.notTracked')}
                                                </p>
                                              </div>
                                            </article>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p className="settings-modal__description px-1 py-2 text-xs">
                                        {t('settings.noPreview')}
                                      </p>
                                    )}
                                    <div className="flex items-center justify-between gap-3 px-1 pt-1">
                                      <Button
                                        type="button"
                                        onClick={() =>
                                          onRecoveryPageChange(
                                            job.job_id,
                                            Math.max(
                                              0,
                                              detailsForJob.offset -
                                                detailsForJob.limit,
                                            ),
                                          )
                                        }
                                        disabled={
                                          detailsForJob.offset === 0 ||
                                          recoveryDetailsLoading
                                        }
                                        variant="secondary"
                                      >
                                        <ChevronLeft
                                          className="h-3.5 w-3.5"
                                          aria-hidden="true"
                                        />
                                        {t('settings.previousPage')}
                                      </Button>
                                      <span className="settings-modal__text-subtle text-xs">
                                        {t('settings.pageOf', { page: formatNumber(Math.floor(
                                          detailsForJob.offset /
                                            detailsForJob.limit,
                                        ) + 1)})}
                                      </span>
                                      <Button
                                        type="button"
                                        onClick={() =>
                                          onRecoveryPageChange(
                                            job.job_id,
                                            detailsForJob.offset +
                                              detailsForJob.limit,
                                          )
                                        }
                                        disabled={
                                          !detailsForJob.has_more ||
                                          recoveryDetailsLoading
                                        }
                                        variant="secondary"
                                      >
                                        {t('settings.nextPage')}{' '}
                                        <span aria-hidden="true">&gt;</span>
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
    </>
  );
};
