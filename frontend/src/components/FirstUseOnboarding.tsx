import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Database, FolderOpen, LoaderCircle, ScanSearch } from 'lucide-react';
import { LibraryJob, WebConfig } from '../types';
import { apiClient } from '../api/client';
import { isLibraryJobActive, useLibraryJobStore } from '../hooks/useLibraryJobStore';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';
import { PathPickerField } from './PathPickerField';
import { Button } from './ui';

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

const phaseCopy = (job: LibraryJob | null) => {
  if (!job) return '準備掃描…';
  if (job.status === 'queued') return '掃描工作已排入佇列…';
  if (job.phase === 'discovering') return '正在尋找支援的圖片與影片…';
  if (job.phase === 'indexing') return '正在建立 Viewer 索引…';
  if (job.phase === 'analyzing_colors') return '正在建立瀏覽用色彩資料…';
  if (job.phase === 'organizing_cache') return '正在整理縮圖快取…';
  if (job.status === 'completed') return '媒體資料庫已準備完成。';
  return '掃描未完成。';
};

export const FirstUseOnboarding: React.FC<FirstUseOnboardingProps> = ({ initialConfig, onComplete }) => {
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
      setError(finishedJob.error_message || '媒體資料庫工作未完成，請確認來源後重新嘗試。');
    }
  }, []);

  const handlePollingError = useCallback((pollError: unknown) => {
    setError(pollError instanceof Error ? pollError.message : '無法讀取媒體資料庫工作狀態。');
  }, []);

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
    if (!job) return '正在準備工作…';
    if (job.phase === 'discovering') return `已找到 ${job.discovered.toLocaleString()} 個檔案`;
    if (job.total) return `已處理 ${job.processed.toLocaleString()} / ${job.total.toLocaleString()} 個項目`;
    return `已處理 ${job.processed.toLocaleString()} 個項目`;
  }, [job]);

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
      setError(inspectError instanceof Error ? inspectError.message : '無法讀取選取的來源。');
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
      if (!data.job) throw new Error('無法開始掃描。');
      startLibraryJob(data.job);
      setStep('scanning');
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : '無法開始掃描。');
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
      setError(finishError instanceof Error ? finishError.message : '無法完成首次設定。');
      setSaving(false);
    }
  };

  useEffect(() => {
    if (step !== 'complete' || !completed || saving) return undefined;
    const timer = window.setTimeout(() => void finish(), 1200);
    return () => window.clearTimeout(timer);
  }, [completed, saving, step]);

  const sourceTitle = mode === 'pixiv' ? '選擇 PixivUtil2 config.ini' : '選擇媒體資料夾';

  return (
    <main className="onboarding" aria-busy={busy}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="onboarding__panel" tabIndex={-1}>
        {step === 'welcome' && (
          <section className="onboarding__welcome" aria-labelledby="onboarding-title">
            <div className="onboarding__intro">
              <p className="onboarding__eyebrow">歡迎使用</p>
              <h1 id="onboarding-title">設定 PixivUtil2 Web Viewer</h1>
              <p>選擇圖片來源。接下來會引導你選取檔案或資料夾，再建立瀏覽所需的 Viewer 索引。</p>
            </div>
            <div className="onboarding__choices" role="group" aria-label="選擇圖片來源">
              <Button ref={firstChoiceRef} shape="card" variant="secondary" className="onboarding__option-card" onClick={() => chooseMode('pixiv')}>
                <span className="onboarding__option-icon"><Database aria-hidden="true" /></span>
                <span className="onboarding__option-copy">
                  <strong>使用 PixivUtil2 資料庫</strong>
                  <span>選擇 config.ini，讀取 rootDirectory；若同位置有 db.sqlite，也會匯入 Pixiv 作品資訊。</span>
                  <span className="onboarding__option-note">推薦給已使用 PixivUtil2 下載作品的人</span>
                </span>
                <ChevronRight className="onboarding__option-arrow" aria-hidden="true" />
              </Button>
              <Button shape="card" variant="secondary" className="onboarding__option-card" onClick={() => chooseMode('folder')}>
                <span className="onboarding__option-icon"><FolderOpen aria-hidden="true" /></span>
                <span className="onboarding__option-copy">
                  <strong>瀏覽本機資料夾</strong>
                  <span>選擇一個資料夾，直接掃描支援的圖片與影片並建立 Viewer 索引。</span>
                  <span className="onboarding__option-note">不需要安裝 PixivUtil2，也不需要 db.sqlite</span>
                </span>
                <ChevronRight className="onboarding__option-arrow" aria-hidden="true" />
              </Button>
            </div>
          </section>
        )}

        {step === 'source' && (
          <section className="onboarding__source" aria-labelledby="onboarding-title">
            <p className="onboarding__step">步驟 2 / 3</p>
            <h1 ref={stepHeadingRef} id="onboarding-title" tabIndex={-1}>{sourceTitle}</h1>
            <p>{mode === 'pixiv'
              ? '請選擇 PixivUtil2 使用的 config.ini。Viewer 只會讀取設定與可用的 Pixiv metadata。'
              : '請選擇要瀏覽的資料夾。Viewer 會包含其中子資料夾內的支援媒體。'}</p>
            <PathPickerField
              id="onboarding-source-path"
              value={path}
              label={mode === 'pixiv' ? 'PixivUtil2 config.ini' : '媒體資料夾'}
              placeholder={mode === 'pixiv' ? '選擇 config.ini' : '選擇媒體資料夾'}
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
                    ? (inspection.databaseDetected ? '已偵測到 Pixiv 資料庫' : '已讀取 config.ini')
                    : '已選擇媒體資料夾'}</strong>
                  <span>{inspection.rootDirectory}</span>
                  {mode === 'pixiv' && !inspection.databaseDetected && <span>未找到 db.sqlite；仍可掃描資料夾中的媒體。</span>}
                </div>
              </div>
            )}

            <div className="onboarding__actions">
              <Button variant="plain" onClick={() => { setStep('welcome'); setError(null); }} disabled={busy}>返回</Button>
              <Button variant="primary" onClick={() => setStep('confirm')} disabled={!inspection || busy}>繼續</Button>
            </div>
          </section>
        )}

        {step === 'confirm' && inspection && (
          <section className="onboarding__confirm" aria-labelledby="onboarding-title">
            <p className="onboarding__step">步驟 3 / 3</p>
            <h1 ref={stepHeadingRef} id="onboarding-title" tabIndex={-1}>準備建立媒體資料庫</h1>
            <p>開始後會暫時鎖定這個畫面，直到首次掃描完成。</p>
            <div className="onboarding__scan-plan">
              <ScanSearch aria-hidden="true" />
              <div>
                <strong>Viewer 將進行以下作業</strong>
                <ul>
                  <li>掃描資料夾中的支援圖片與影片</li>
                  <li>建立 Viewer 索引與瀏覽所需的快取資料</li>
                  {mode === 'pixiv' && <li>讀取可用的 PixivUtil2 metadata</li>}
                </ul>
              </div>
            </div>
            <dl className="onboarding__source-details">
              <div><dt>媒體根目錄</dt><dd>{inspection.rootDirectory}</dd></div>
              {mode === 'pixiv' && <div><dt>Pixiv 資料庫</dt><dd>{inspection.databaseDetected ? inspection.databasePath : '未偵測到'}</dd></div>}
            </dl>
            <p className="onboarding__safety-note">原始圖片不會被修改或刪除。資料量較大時，首次掃描可能需要一些時間。</p>
            <div className="onboarding__actions">
              <Button variant="plain" onClick={() => { setStep('source'); setError(null); }} disabled={busy}>返回</Button>
              <Button variant="primary" onClick={() => void startScan()} disabled={busy}>
                {saving && <LoaderCircle className="onboarding__spinner" aria-hidden="true" />}
                {saving ? '正在開始…' : '開始掃描'}
              </Button>
            </div>
          </section>
        )}

        {(step === 'scanning' || step === 'complete') && (
          <section className="onboarding__progress" aria-labelledby="onboarding-title">
            {completed ? <CheckCircle2 className="onboarding__complete-icon" aria-hidden="true" /> : <LoaderCircle className="onboarding__spinner onboarding__progress-icon" aria-hidden="true" />}
            <h1 ref={stepHeadingRef} id="onboarding-title" tabIndex={-1}>{completed ? '媒體資料庫已準備完成' : '正在建立媒體資料庫'}</h1>
            <p aria-live="polite" aria-atomic="true">{phaseCopy(job)}</p>
            {!completed && !isFailed(job) && (
              <>
                <div
                  className={`onboarding__progress-track${progress === null ? ' is-indeterminate' : ''}`}
                  role="progressbar"
                  aria-label="媒體資料庫建立進度"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress ?? undefined}
                  aria-valuetext={progress === null ? phaseCopy(job) : undefined}
                >
                  <span className="onboarding__progress-bar" style={progress === null ? undefined : { width: `${progress}%` }} />
                </div>
                <p className="onboarding__progress-detail">{progressDetail}</p>
              </>
            )}
            {completed && job && (
              <div className="onboarding__completion-summary" aria-label="掃描結果">
                <div><strong>{job.discovered.toLocaleString()}</strong><span>已掃描</span></div>
                <div><strong>{job.added.toLocaleString()}</strong><span>新增</span></div>
                <div><strong>{job.updated.toLocaleString()}</strong><span>更新</span></div>
              </div>
            )}
            {completed && <Button variant="primary" onClick={() => void finish()} disabled={saving}>{saving ? '正在開啟…' : '立即開始瀏覽'}</Button>}
            {isFailed(job) && <Button variant="secondary" onClick={() => { updateLibraryJob(null); setStep('confirm'); setError(null); }}>返回掃描確認</Button>}
          </section>
        )}

        <div className="onboarding__live-status" role="status" aria-live="polite" aria-atomic="true">
          {inspecting ? '正在檢查選取的來源…' : ''}
        </div>
        {inspecting && <p className="onboarding__status"><LoaderCircle className="onboarding__spinner" aria-hidden="true" />正在檢查選取的來源…</p>}
        {error && <p className="onboarding__error" role="alert">{error}</p>}
      </div>
    </main>
  );
};
