import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  Sliders,
  X,
} from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import {
  getFieldMetadata,
  getSectionMetadata,
  PixivConfigFieldMetadata,
} from '../pixivConfigMetadata';
import { DEFAULT_WEB_CONFIG, WebConfig } from '../types';
import { normalizeWebConfig } from '../utils/webConfig';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved: () => void;
}

type MainTab = 'web' | 'pixiv' | 'backup';

interface WebViewerConfig {
  webTheme: WebConfig['webTheme'];
  defaultViewMode: WebConfig['defaultViewMode'];
  thumbnailSize: number;
  itemsPerPage: number;
  autoOpenBrowser: boolean;
  groupMangaPosts: boolean;
  blurEnabled: boolean;
  preloadImageCount: number;
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

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
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
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const sectionKeys = Object.keys(pixivSections);
  const isSearching = sectionFilter.trim().length > 0;

  const readJsonResponse = async <T,>(response: Response): Promise<T> => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.message || `請求失敗（${response.status}）`);
    }
    return data as T;
  };

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const [webResponse, pixivResponse] = await Promise.all([
        fetch('/api/web-config'),
        fetch('/api/pixiv-config'),
      ]);
       const webData = await readJsonResponse<Partial<WebViewerConfig> & {
         thumbnailWidth?: number;
         thumbnailHeight?: number;
       }>(webResponse);
      const pixivData = await readJsonResponse<PixivConfigResponse>(pixivResponse);
      const nextSections = pixivData.sections || {};
      const nextSectionKeys = Object.keys(nextSections);

       setWebConfig({
         ...normalizeWebConfig(webData),
         pixivConfigPath: webData.pixivConfigPath || '',
       });
      setPixivSections(nextSections);
      setHasBackup(!!pixivData.hasBackup);
      setConfigPathInfo({
        configPath: pixivData.configPath || '',
        backupPath: pixivData.backupPath || '',
        defaultConfigPath: pixivData.defaultConfigPath || '',
        usingDefaultPath: !!pixivData.usingDefaultPath,
      });

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
      setShowSaveConfirm(false);
      return;
    }

    setMessage(null);
    setSectionFilter('');
    void loadConfigs();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showSaveConfirm) {
        setShowSaveConfirm(false);
      } else {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, showSaveConfirm]);

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
    setScanning(true);
    setMessage(null);
    try {
      const rootDirectory = pixivSections.Settings?.rootdirectory || '.';
      const response = await fetch('/api/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: rootDirectory }),
      });
      const data = await readJsonResponse<{ scanned?: number; indexed?: number }>(response);
      setMessage({
        type: 'success',
        text: `重新掃描完成：掃描 ${data.scanned || 0} 個檔案，新增或更新 ${data.indexed || 0} 筆資料。`,
      });
      onSettingsSaved();
    } catch (error) {
      setMessage({ type: 'error', text: `重新掃描失敗：${getErrorMessage(error)}` });
    } finally {
      setScanning(false);
    }
  };

  const handleCleanOrphans = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/db/clean-orphans', { method: 'POST' });
      const data = await readJsonResponse<{ archived_members?: number }>(response);
      setMessage({
        type: 'success',
        text: `資料庫清理完成：封存 ${data.archived_members || 0} 筆沒有對應檔案的繪師資料。`,
      });
      onSettingsSaved();
    } catch (error) {
      setMessage({ type: 'error', text: `資料庫清理失敗：${getErrorMessage(error)}` });
    } finally {
      setLoading(false);
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

  const renderFieldControl = (
    sectionName: string,
    optionName: string,
    value: string,
    metadata: PixivConfigFieldMetadata,
    fieldId: string,
  ) => {
    const descriptionId = `${fieldId}-description`;
    const update = (nextValue: string) => updatePixivValue(sectionName, optionName, nextValue);

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
    const tabs: MainTab[] = ['web', 'pixiv', 'backup'];
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
            ['web', 'Web Viewer 設定', Sliders],
            ['pixiv', 'PixivUtil2 config.ini', Settings],
            ['backup', '備份與維護', Shield],
          ] as const).map(([tab, label, Icon], index) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mainTab === tab}
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
            <section role="tabpanel" aria-label="Web Viewer 設定" className="space-y-6">
              <div>
                <h3 className="settings-modal__heading text-base font-bold">Web Viewer 顯示設定</h3>
                <p className="settings-modal__description mt-1 text-sm leading-5">調整檢視器的外觀、縮圖與瀏覽行為。</p>
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

              <button type="button" onClick={handleSaveWebConfig} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-950/30 transition-[background-color,transform] hover:bg-indigo-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">
                <Save className="h-4 w-4" aria-hidden="true" />
                {loading ? '儲存中…' : '儲存 Web Viewer 設定'}
              </button>
            </section>
          )}

          {mainTab === 'pixiv' && (
            <section role="tabpanel" aria-label="PixivUtil2 config.ini 設定" className="space-y-6">
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
                  <input
                    id="pixiv-config-path"
                    type="text"
                    value={webConfig.pixivConfigPath}
                    onChange={event => setWebConfig(current => ({ ...current, pixivConfigPath: event.target.value }))}
                    placeholder="留白：使用預設位置"
                    autoComplete="off"
                    spellCheck={false}
                    className={`${inputClass} font-mono text-xs`}
                  />
                  <p className="settings-modal__description break-all text-xs leading-5">
                    目前讀取：<code className="settings-modal__code">{configPathInfo.configPath || '載入中…'}</code>
                    <br />
                    預設位置：<code className="settings-modal__code">{configPathInfo.defaultConfigPath || '載入中…'}</code>
                  </p>
                  <button type="button" onClick={handleSaveConfigPath} disabled={loading} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-indigo-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {loading ? '載入中…' : '儲存路徑並重新載入'}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative min-w-0 flex-1">
                    <label htmlFor="pixiv-config-search" className="sr-only">搜尋整份 config.ini</label>
                    <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-zinc-400" aria-hidden="true" />
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
                  <button type="button" onClick={handleRescanDirectory} disabled={scanning} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-indigo-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">
                    <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {scanning ? '掃描中…' : '重新掃描圖片'}
                  </button>
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
                  <div role="status" className="text-xs text-zinc-400">
                    {isSearching
                      ? `已跨整份 config.ini 找到 ${matchedFieldCount} 個欄位，結果已依分類分組。`
                      : `目前分類：${getSectionMetadata(activeSection)?.zh_category || activeSection || '尚未選擇'}`}
                  </div>
                  {filteredSectionGroups.length > 0 ? (
                    filteredSectionGroups.map(group => renderSectionGroup(group.section, group.entries))
                  ) : (
                    <div className="settings-modal__empty rounded-xl px-6 py-10 text-center">
                      <Search className="mx-auto h-8 w-8 text-zinc-500" aria-hidden="true" />
                      <p className="mt-3 text-sm font-semibold text-zinc-200">找不到符合的設定欄位</p>
                      <p className="mt-1 text-xs text-zinc-400">請換一個關鍵字，或清除搜尋以回到目前分類。</p>
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
            <section role="tabpanel" aria-label="備份與維護" className="space-y-6">
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
                  <span className={`settings-modal__backup-badge rounded-full px-2.5 py-1 text-xs font-semibold ${hasBackup ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300' : 'bg-zinc-700 text-zinc-400'}`}>
                    {hasBackup ? '已有 .bak 備份' : '尚無備份'}
                  </span>
                </div>
                <div>
                  <p className="settings-modal__description mb-3 break-all text-xs leading-5">
                    備份檔：<code className="settings-modal__code">{configPathInfo.backupPath || '載入中…'}</code>
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={handleCreateBackup} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-emerald-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
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

              <div className="settings-modal__danger-card space-y-3 rounded-xl p-4">
                <div>
                  <h4 className="settings-modal__danger-title text-sm font-semibold">資料庫維護</h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">封存資料庫中已找不到實體檔案的繪師資料，避免畫廊出現過期項目。</p>
                </div>
                <button type="button" onClick={handleCleanOrphans} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-rose-950/30 transition-[background-color,transform] hover:bg-rose-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  清理孤立資料
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="settings-modal__footer flex shrink-0 flex-wrap items-center justify-end gap-3 px-6 py-4">
          <button type="button" onClick={onClose} className="settings-modal__secondary-button min-h-11 rounded-xl px-4 py-2 text-sm font-semibold transition-[background-color,transform] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2">
            關閉
          </button>
          {mainTab === 'pixiv' && (
            <button type="button" onClick={() => setShowSaveConfirm(true)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-950/30 transition-[background-color,transform] hover:bg-indigo-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">
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
            <h3 id="save-confirm-title" className="text-base font-bold text-white">儲存 PixivUtil2 設定？</h3>
            <p className="text-sm leading-6 text-zinc-300">儲存前會先把目前 config.ini 複製成 .bak；若寫入失敗，系統會嘗試從備份還原。</p>
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowSaveConfirm(false)} className="settings-modal__secondary-button min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition-[background-color,transform] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2">
                取消
              </button>
              <button type="button" onClick={handleSavePixivConfig} disabled={loading} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-indigo-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">
                儲存設定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
