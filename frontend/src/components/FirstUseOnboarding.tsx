import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Database, FolderOpen, LoaderCircle, ScanSearch } from 'lucide-react';
import { LibraryJob, WebConfig } from '../types';
import { apiClient } from '../api/client';
import { isLibraryJobActive, useLibraryJobStore } from '../hooks/useLibraryJobStore';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';
import { getOperationErrorMessage } from '../utils/operationError';
import { PathPickerField } from './PathPickerField';
import { Button } from './ui';
import { useI18n, type I18nContextValue } from '../i18n';

type SourceMode = 'pixiv' | 'folder';
type OnboardingStep = 'welcome' | 'source' | 'confirm' | 'scanning' | 'complete';

interface SourceInspection {
  mode: SourceMode;
  configPath?: string;
  rootDirectory: string;
  databaseDetected: boolean;
  databasePath: string | null;
}

interface FirstUseOnboardingProps {
  initialConfig: WebConfig;
  onComplete: (config: WebConfig) => void;
}

const isFailed = (job: LibraryJob | null) => !!job && ['cancelled', 'failed', 'interrupted'].includes(job.status);

const phaseCopy = (job: LibraryJob | null, t: I18nContextValue['t']) => {
  if (!job) return t('onboarding.prepareScan');
  if (job.status === 'queued') return t('onboarding.scanQueued');
  if (job.phase === 'discovering') return t('onboarding.discovering');
  if (job.phase === 'indexing') return t('onboarding.indexing');
  if (job.phase === 'analyzing_colors') return t('onboarding.analyzingColors');
  if (job.phase === 'organizing_cache') return t('onboarding.organizingCache');
  if (job.status === 'completed') return t('onboarding.databaseReady');
  return t('onboarding.scanIncomplete');
};

export const FirstUseOnboarding: React.FC<FirstUseOnboardingProps> = ({ initialConfig, onComplete }) => {
  const { t, formatNumber } = useI18n();
  const initialMode = initialConfig.librarySourceMode === 'folder' ? 'folder' : 'pixiv';
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [mode, setMode] = useState<SourceMode>(initialMode);
  const [path, setPath] = useState(initialMode === 'folder'
    ? initialConfig.mediaRootPath
    : initialConfig.pixivConfigPath ?? '');
  const [inspection, setInspection] = useState<SourceInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const handleJobFinished = useCallback((finishedJob: LibraryJob) => {
    if (finishedJob.status === 'completed') setStep('complete');
    if (isFailed(finishedJob)) {
      setError(finishedJob.error_message || t('library.jobFailed'));
    }
  }, [t]);

  const handlePollingError = useCallback((pollError: unknown) => {
    setError(getOperationErrorMessage(pollError, t));
  }, [t]);

  const { job, startLibraryJob, updateLibraryJob } = useLibraryJobStore({
    onJobFinished: handleJobFinished,
    onPollingError: handlePollingError,
  });

  useModalFocusTrap({ isOpen: true, dialogRef, initialFocusRef: firstChoiceRef });

  const busy = inspecting || saving || isLibraryJobActive(job);
  const completed = job?.status === 'completed';
  const progress = useMemo(() => {
    if (!job || !isLibraryJobActive(job)) return null;
    const total = Number(job.total);
    if (!Number.isFinite(total) || total <= 0) return null;
    return Math.min(100, Math.round((job.processed / total) * 100));
  }, [job]);

  const progressDetail = useMemo(() => {
    if (!job) return t('onboarding.progressPreparing');
    if (job.phase === 'discovering') return t('onboarding.filesFound', { count: formatNumber(job.discovered) });
    if (job.total) return t('onboarding.itemsProcessed', { processed: formatNumber(job.processed), total: formatNumber(job.total) });
    return t('onboarding.itemsProcessedShort', { processed: formatNumber(job.processed) });
  }, [formatNumber, job, t]);

  useEffect(() => {
    if (step === 'welcome') return undefined;
    const frame = window.requestAnimationFrame(() => stepHeadingRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  const inspectPath = async (nextPath: string, nextMode = mode) => {
    setPath(nextPath);
    setInspection(null);
    setError(null);
    if (!nextPath) return;
    setInspecting(true);
    try {
      const sourceInspection = await apiClient.library.inspectSource(nextMode, nextPath);
      setInspection(sourceInspection as SourceInspection);
    } catch (inspectError) {
      setError(getOperationErrorMessage(inspectError, t));
    } finally {
      setInspecting(false);
    }
  };

  const chooseMode = (nextMode: SourceMode) => {
    setMode(nextMode);
    const nextPath = nextMode === 'folder' ? initialConfig.mediaRootPath : initialConfig.pixivConfigPath ?? '';
    setPath(nextPath);
    setInspection(null);
    setError(null);
    setStep('source');
    if (nextPath) void inspectPath(nextPath, nextMode);
  };

  const startScan = async () => {
    if (!inspection || busy) return;
    setSaving(true);
    setError(null);
    try {
      const configPatch = mode === 'pixiv'
        ? { librarySourceMode: mode, pixivConfigPath: inspection.configPath || path, mediaRootPath: '', onboardingCompleted: false }
        : { librarySourceMode: mode, mediaRootPath: inspection.rootDirectory, onboardingCompleted: false };
      await apiClient.webConfig.update(configPatch);
      const data = await apiClient.libraryJobs.start({
        type: 'update-library',
        directory: inspection.rootDirectory,
        analyze_colors: true,
      });
      if (!data.job) throw new Error(t('errors.unknown'));
      startLibraryJob(data.job);
      setStep('scanning');
    } catch (startError) {
      setError(getOperationErrorMessage(startError, t));
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!completed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const data = await apiClient.webConfig.update({ onboardingCompleted: true });
      window.dispatchEvent(new Event('web-viewer-library-data-changed'));
      onComplete(data.webConfig);
    } catch (finishError) {
      setError(getOperationErrorMessage(finishError, t));
      setSaving(false);
    }
  };

  useEffect(() => {
    if (step !== 'complete' || !completed || saving) return undefined;
    const timer = window.setTimeout(() => void finish(), 1200);
    return () => window.clearTimeout(timer);
  }, [completed, saving, step]);

  const sourceTitle = mode === 'pixiv' ? t('onboarding.choosePixivConfig') : t('onboarding.chooseMediaFolder');

  return (
    <main className="onboarding" aria-busy={busy}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="onboarding__panel" tabIndex={-1}>
        {step === 'welcome' && (
          <section className="onboarding__welcome" aria-labelledby="onboarding-title">
            <div className="onboarding__intro">
              <p className="onboarding__eyebrow">{t('onboarding.welcome')}</p>
              <h1 id="onboarding-title">{t('onboarding.setupTitle')}</h1>
              <p>{t('onboarding.intro')}</p>
            </div>
            <div className="onboarding__choices" role="group" aria-label={t('onboarding.chooseSource')}>
              <Button ref={firstChoiceRef} shape="card" variant="secondary" className="onboarding__option-card" onClick={() => chooseMode('pixiv')}>
                <span className="onboarding__option-icon"><Database aria-hidden="true" /></span>
                <span className="onboarding__option-copy">
                  <strong>{t('onboarding.pixivTitle')}</strong>
                  <span>{t('onboarding.pixivDescription')}</span>
                  <span className="onboarding__option-note">{t('onboarding.pixivNote')}</span>
                </span>
                <ChevronRight className="onboarding__option-arrow" aria-hidden="true" />
              </Button>
              <Button shape="card" variant="secondary" className="onboarding__option-card" onClick={() => chooseMode('folder')}>
                <span className="onboarding__option-icon"><FolderOpen aria-hidden="true" /></span>
                <span className="onboarding__option-copy">
                  <strong>{t('onboarding.folderTitle')}</strong>
                  <span>{t('onboarding.folderDescription')}</span>
                  <span className="onboarding__option-note">{t('onboarding.folderNote')}</span>
                </span>
                <ChevronRight className="onboarding__option-arrow" aria-hidden="true" />
              </Button>
            </div>
          </section>
        )}

        {step === 'source' && (
          <section className="onboarding__source" aria-labelledby="onboarding-title">
            <p className="onboarding__step">{t('onboarding.stepSource')}</p>
            <h1 ref={stepHeadingRef} id="onboarding-title" tabIndex={-1}>{sourceTitle}</h1>
            <p>{mode === 'pixiv' ? t('onboarding.pixivInstruction') : t('onboarding.folderInstruction')}</p>
            <PathPickerField
              id="onboarding-source-path"
              value={path}
              label={mode === 'pixiv' ? t('onboarding.pixivConfigLabel') : t('onboarding.mediaFolderLabel')}
              placeholder={mode === 'pixiv' ? t('onboarding.chooseConfigPlaceholder') : t('onboarding.chooseFolderPlaceholder')}
              metadata={mode === 'pixiv'
                ? { mode: 'existing-file', purpose: 'pixiv-config', extensions: ['.ini'], access: 'read' }
                : { mode: 'folder', purpose: 'root-directory', access: 'read' }}
              onChange={value => void inspectPath(value)}
            />

            {inspection && (
              <div className="onboarding__source-summary" role="status">
                <CheckCircle2 aria-hidden="true" />
                <div>
                  <strong>{mode === 'pixiv'
                    ? (inspection.databaseDetected ? t('onboarding.detectedPixivDatabase') : t('onboarding.readConfig'))
                    : t('onboarding.selectedMediaFolder')}</strong>
                  <span>{inspection.rootDirectory}</span>
                  {mode === 'pixiv' && !inspection.databaseDetected && <span>{t('onboarding.noPixivDatabase')}</span>}
                </div>
              </div>
            )}

            <div className="onboarding__actions">
              <Button variant="plain" onClick={() => { setStep('welcome'); setError(null); }} disabled={busy}>{t('onboarding.back')}</Button>
              <Button variant="primary" onClick={() => setStep('confirm')} disabled={!inspection || busy}>{t('onboarding.continue')}</Button>
            </div>
          </section>
        )}

        {step === 'confirm' && inspection && (
          <section className="onboarding__confirm" aria-labelledby="onboarding-title">
            <p className="onboarding__step">{t('onboarding.stepConfirm')}</p>
            <h1 ref={stepHeadingRef} id="onboarding-title" tabIndex={-1}>{t('onboarding.confirmTitle')}</h1>
            <p>{t('onboarding.confirmDescription')}</p>
            <div className="onboarding__scan-plan">
              <ScanSearch aria-hidden="true" />
              <div>
                <strong>{t('onboarding.planTitle')}</strong>
                <ul>
                  <li>{t('onboarding.scanMedia')}</li>
                  <li>{t('onboarding.buildIndex')}</li>
                  {mode === 'pixiv' && <li>{t('onboarding.readPixivMetadata')}</li>}
                </ul>
              </div>
            </div>
            <dl className="onboarding__source-details">
              <div><dt>{t('onboarding.mediaRoot')}</dt><dd>{inspection.rootDirectory}</dd></div>
              {mode === 'pixiv' && <div><dt>{t('onboarding.pixivDatabase')}</dt><dd>{inspection.databaseDetected ? inspection.databasePath : t('onboarding.notDetected')}</dd></div>}
            </dl>
            <p className="onboarding__safety-note">{t('onboarding.safety')}</p>
            <div className="onboarding__actions">
              <Button variant="plain" onClick={() => { setStep('source'); setError(null); }} disabled={busy}>{t('onboarding.back')}</Button>
              <Button variant="primary" onClick={() => void startScan()} disabled={busy}>
                {saving && <LoaderCircle className="onboarding__spinner" aria-hidden="true" />}
                {saving ? t('onboarding.starting') : t('onboarding.startScan')}
              </Button>
            </div>
          </section>
        )}

        {(step === 'scanning' || step === 'complete') && (
          <section className="onboarding__progress" aria-labelledby="onboarding-title">
            {completed ? <CheckCircle2 className="onboarding__complete-icon" aria-hidden="true" /> : <LoaderCircle className="onboarding__spinner onboarding__progress-icon" aria-hidden="true" />}
            <h1 ref={stepHeadingRef} id="onboarding-title" tabIndex={-1}>{completed ? t('onboarding.completeTitle') : t('onboarding.scanningTitle')}</h1>
            <p aria-live="polite" aria-atomic="true">{phaseCopy(job, t)}</p>
            {!completed && !isFailed(job) && (
              <>
                <div
                  className={`onboarding__progress-track${progress === null ? ' is-indeterminate' : ''}`}
                  role="progressbar"
                  aria-label={t('onboarding.progressLabel')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress ?? undefined}
                  aria-valuetext={progress === null ? phaseCopy(job, t) : undefined}
                >
                  <span className="onboarding__progress-bar" style={progress === null ? undefined : { width: `${progress}%` }} />
                </div>
                <p className="onboarding__progress-detail">{progressDetail}</p>
              </>
            )}
            {completed && job && (
              <div className="onboarding__completion-summary" aria-label={t('onboarding.scanResult')}>
                <div><strong>{formatNumber(job.discovered)}</strong><span>{t('onboarding.scanned')}</span></div>
                <div><strong>{formatNumber(job.added)}</strong><span>{t('onboarding.added')}</span></div>
                <div><strong>{formatNumber(job.updated)}</strong><span>{t('onboarding.updated')}</span></div>
              </div>
            )}
            {completed && <Button variant="primary" onClick={() => void finish()} disabled={saving}>{saving ? t('onboarding.opening') : t('onboarding.startBrowsing')}</Button>}
            {isFailed(job) && <Button variant="secondary" onClick={() => { updateLibraryJob(null); setStep('confirm'); setError(null); }}>{t('onboarding.returnToConfirm')}</Button>}
          </section>
        )}

        <div className="onboarding__live-status" role="status" aria-live="polite" aria-atomic="true">
          {inspecting ? t('onboarding.inspecting') : ''}
        </div>
        {inspecting && <p className="onboarding__status"><LoaderCircle className="onboarding__spinner" aria-hidden="true" />{t('onboarding.inspecting')}</p>}
        {error && <p className="onboarding__error" role="alert">{error}</p>}
      </div>
    </main>
  );
};
