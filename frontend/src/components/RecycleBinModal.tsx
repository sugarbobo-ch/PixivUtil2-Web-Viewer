import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Folder, Search, Trash2, X } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { CustomSelect } from './CustomSelect';
import { Badge, Button, IconButton, Input } from './ui';
import { RecycleEntry } from '../types';
import { apiClient } from '../api/client';

interface RecycleBinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const formatBytes = (bytes: number | null) => {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return '大小未知';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export const RecycleBinModal: React.FC<RecycleBinModalProps> = ({ isOpen, onClose }) => {
  const [entries, setEntries] = useState<RecycleEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [artistFilter, setArtistFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<RecycleEntry | 'all' | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  const loadEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.recycleBin.list();
      setEntries(data.entries);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '讀取回收區失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setArtistFilter('all');
    void loadEntries();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirmTarget && !actionLoading) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [actionLoading, confirmTarget, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      if (!wasOpen.current) return undefined;
      wasOpen.current = false;
      const element = previouslyFocusedElement.current;
      window.setTimeout(() => {
        if (document.querySelector('.recycle-bin-modal')) return;
        const fallbackElement = Array.from(document.querySelectorAll<HTMLElement>(
          '[aria-label="開啟設定"], [aria-label="切換功能選單"], [aria-label="開啟篩選條件"]',
        )).find(candidate => candidate.getClientRects().length > 0);
        if (element && document.contains(element)) {
          element.focus({ preventScroll: true });
        } else {
          fallbackElement?.focus({ preventScroll: true });
        }
        previouslyFocusedElement.current = null;
      }, 0);
      return undefined;
    }

    wasOpen.current = true;
    previouslyFocusedElement.current = document.activeElement instanceof HTMLElement
      && document.activeElement !== document.body
      && document.activeElement !== document.documentElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus({ preventScroll: true });
    return undefined;
  }, [isOpen]);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || confirmTarget) return;

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    ).filter(element => !element.hasAttribute('aria-hidden'));
    const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
    if (currentIndex < 0 || focusableElements.length < 2) return;

    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusableElements.length) % focusableElements.length
      : (currentIndex + 1) % focusableElements.length;
    event.preventDefault();
    focusableElements[nextIndex]?.focus();
  };

  const artistOptions = useMemo(() => (
    Array.from(new Map(
      entries
        .filter(entry => entry.artist_name)
        .map(entry => [entry.folder_id || String(entry.member_id ?? entry.artist_name), entry.artist_name]),
    ).entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
  ), [entries]);

  const artistFilterOptions = useMemo(() => [
    { value: 'all', label: '所有繪師' },
    ...artistOptions,
  ], [artistOptions]);

  const visibleEntries = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return entries.filter(entry => {
      if (artistFilter !== 'all' && (entry.folder_id || String(entry.member_id ?? entry.artist_name)) !== artistFilter) return false;
      if (!query) return true;
      return [entry.file_name, entry.artist_name, entry.original_path]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    });
  }, [artistFilter, entries, searchQuery]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { label: string; entries: RecycleEntry[] }>();
    visibleEntries.forEach(entry => {
      const key = entry.folder_id || `legacy:${entry.member_id ?? entry.artist_name}`;
      const group = groups.get(key) || {
        label: entry.artist_name || '未分類作品',
        entries: [],
      };
      group.entries.push(entry);
      groups.set(key, group);
    });
    return Array.from(groups.entries());
  }, [visibleEntries]);

  const sendToSystemRecycleBin = async () => {
    if (!confirmTarget || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      const data = confirmTarget === 'all'
        ? await apiClient.recycleBin.sendAll()
        : await apiClient.recycleBin.send(confirmTarget.trash_id);
      setConfirmTarget(null);
      await loadEntries();
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setError(`已處理 ${typeof data.moved === 'number' ? data.moved : 0} 項，但仍有部分項目未完成：${data.errors.join('；')}`);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '移至系統資源回收筒失敗');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="recycle-bin-modal fixed inset-0 z-50 flex items-center justify-center"
        role="presentation"
        onClick={event => {
          if (event.target === event.currentTarget && !actionLoading) onClose();
        }}
      >
        <section
          ref={dialogRef}
          className="recycle-bin-modal__panel flex min-h-0 w-full flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recycle-bin-title"
          aria-describedby="recycle-bin-description"
          onKeyDown={handleDialogKeyDown}
        >
          <header className="recycle-bin-modal__header flex shrink-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="recycle-bin-modal__eyebrow font-semibold">可復原檔案管理</p>
              <h2 id="recycle-bin-title" className="mt-1 truncate text-lg font-bold">回收區</h2>
              <p id="recycle-bin-description" className="recycle-bin-modal__description mt-1 leading-5">這裡的檔案尚未永久刪除；執行後會交給 Windows 資源回收筒，仍可從系統還原。</p>
            </div>
            <IconButton ref={closeButtonRef} type="button" onClick={onClose} variant="ghost" aria-label="關閉回收區" title="關閉回收區">
              <X className="h-5 w-5" aria-hidden="true" />
            </IconButton>
          </header>

          <div className="recycle-bin-modal__toolbar flex shrink-0 flex-wrap items-center">
            <label className="recycle-bin-modal__search min-w-[12rem] flex-1">
              <span className="sr-only">搜尋回收區</span>
              <Input
                controlSize="md"
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="搜尋檔名、繪師或原始路徑"
                leadingIcon={<Search aria-hidden="true" />}
                clearable
                onClear={() => setSearchQuery('')}
                wrapperClassName="recycle-bin-modal__search-input"
              />
            </label>
            <div className="recycle-bin-modal__select-label">
              <CustomSelect
                value={artistFilter}
                options={artistFilterOptions}
                onChange={setArtistFilter}
                ariaLabel="依繪師篩選"
                className="recycle-bin-modal__select"
                menuPlacement="end"
              />
            </div>
            <Badge variant="neutral" size="sm" className="recycle-bin-modal__count">
              {visibleEntries.length} / {entries.length} 項
            </Badge>
            <Button
              type="button"
              onClick={() => setConfirmTarget('all')}
              disabled={loading || actionLoading || entries.every(entry => !entry.available)}
              variant="danger"
              className="recycle-bin-modal__bulk-action"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              移至資源回收筒
            </Button>
          </div>

          {error && <div className="recycle-bin-modal__error" role="alert">{error}</div>}

          <div className="recycle-bin-modal__content min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="recycle-bin-modal__empty" role="status" aria-live="polite" aria-busy="true">
                <div className="recycle-bin-modal__empty-icon" aria-hidden="true"><Trash2 className="h-6 w-6" /></div>
                <p className="text-sm font-semibold">正在讀取回收區…</p>
              </div>
            ) : groupedEntries.length === 0 ? (
              <div className="recycle-bin-modal__empty" role="status">
                <div className="recycle-bin-modal__empty-icon" aria-hidden="true"><Trash2 className="h-6 w-6" /></div>
                <p className="text-sm font-semibold">回收區目前是空的</p>
                <p className="recycle-bin-modal__description mt-1">移入回收區的作品會保留在這裡，等待你確認是否交給系統資源回收筒。</p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedEntries.map(([folderKey, group]) => (
                  <section key={folderKey} aria-labelledby={`recycle-group-${folderKey}`}>
                    <div className="recycle-bin-modal__group-heading mb-2 flex items-center gap-2">
                      <Folder className="h-4 w-4" aria-hidden="true" />
                      <h3 id={`recycle-group-${folderKey}`} className="text-sm font-semibold">{group.label}</h3>
                      <Badge variant="neutral" size="xs" className="recycle-bin-modal__count">
                        {group.entries.length} 項
                      </Badge>
                    </div>
                    <div className="recycle-bin-modal__group overflow-hidden">
                      {group.entries.map(entry => (
                        <article key={entry.trash_id} className="recycle-bin-modal__row flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold" title={entry.file_name}>{entry.file_name}</p>
                            <p className="recycle-bin-modal__meta mt-1 truncate" title={entry.original_path}>
                              {formatDate(entry.trashed_at)} · {formatBytes(entry.file_size)} · {entry.original_path}
                            </p>
                          </div>
                          <Button
                            type="button"
                            onClick={() => setConfirmTarget(entry)}
                            disabled={!entry.available || actionLoading}
                            variant="danger"
                            className="recycle-bin-modal__row-action"
                            title={entry.available ? '移至 Windows 資源回收筒' : '找不到回收區檔案'}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {entry.available ? '移至資源回收筒' : '檔案不存在'}
                          </Button>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={confirmTarget !== null}
        title={confirmTarget === 'all' ? '將回收區檔案移至系統回收筒？' : '將此檔案移至系統回收筒？'}
        message={confirmTarget === 'all'
          ? `即將處理 ${entries.filter(entry => entry.available).length} 個檔案。Windows 會保留它們以便日後還原，Web Viewer 回收區記錄會標記為已處理。`
          : `「${confirmTarget?.file_name ?? ''}」會交給 Windows 資源回收筒，不會直接抹除。`}
        confirmLabel="移至資源回收筒"
        cancelLabel="先保留"
        onConfirm={() => void sendToSystemRecycleBin()}
        onCancel={() => {
          if (!actionLoading) setConfirmTarget(null);
        }}
      />
    </>
  );
};
