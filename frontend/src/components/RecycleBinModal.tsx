import React, { useEffect, useMemo, useState } from 'react';
import { Folder, Search, Trash2, X } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { RecycleEntry } from '../types';

interface RecycleBinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RecycleBinResponse {
  entries?: RecycleEntry[];
  total?: number;
}

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

  const loadEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/recycle-bin', { cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as RecycleBinResponse & { detail?: string };
      if (!response.ok) throw new Error(data.detail || `讀取回收區失敗（${response.status}）`);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
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

  const artistOptions = useMemo(() => (
    Array.from(new Map(
      entries
        .filter(entry => entry.artist_name)
        .map(entry => [String(entry.member_id ?? entry.artist_name), entry.artist_name]),
    ).entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
  ), [entries]);

  const visibleEntries = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return entries.filter(entry => {
      if (artistFilter !== 'all' && String(entry.member_id ?? entry.artist_name) !== artistFilter) return false;
      if (!query) return true;
      return [entry.file_name, entry.artist_name, entry.original_path]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    });
  }, [artistFilter, entries, searchQuery]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, RecycleEntry[]>();
    visibleEntries.forEach(entry => {
      const key = entry.artist_name || '未分類作品';
      const group = groups.get(key) || [];
      group.push(entry);
      groups.set(key, group);
    });
    return Array.from(groups.entries());
  }, [visibleEntries]);

  const sendToSystemRecycleBin = async () => {
    if (!confirmTarget || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      const endpoint = confirmTarget === 'all'
        ? '/api/recycle-bin/send-all-to-system'
        : `/api/recycle-bin/${encodeURIComponent(confirmTarget.trash_id)}/send-to-system`;
      const response = await fetch(endpoint, { method: 'POST' });
      const data = await response.json().catch(() => ({})) as { moved?: number; errors?: string[]; detail?: string };
      if (!response.ok) throw new Error(data.detail || `移至系統資源回收筒失敗（${response.status}）`);
      setConfirmTarget(null);
      await loadEntries();
      if (data.errors?.length) setError(`已處理 ${data.moved ?? 0} 項，但仍有部分項目未完成：${data.errors.join('；')}`);
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
        className="recycle-bin-modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
        role="presentation"
        onClick={event => {
          if (event.target === event.currentTarget && !actionLoading) onClose();
        }}
      >
        <section
          className="recycle-bin-modal__panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recycle-bin-title"
        >
          <header className="recycle-bin-modal__header flex shrink-0 items-start justify-between gap-4 px-5 py-5 sm:px-7">
            <div className="min-w-0">
              <p className="recycle-bin-modal__eyebrow text-xs font-semibold">可復原檔案管理</p>
              <h2 id="recycle-bin-title" className="mt-1 truncate text-xl font-bold">回收區</h2>
              <p className="recycle-bin-modal__description mt-1 text-xs leading-5">這裡的檔案尚未永久刪除；執行後會交給 Windows 資源回收筒，仍可從系統還原。</p>
            </div>
            <button type="button" onClick={onClose} className="recycle-bin-modal__close" aria-label="關閉回收區" title="關閉回收區">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div className="recycle-bin-modal__toolbar flex shrink-0 flex-wrap items-center gap-2 px-5 py-3 sm:px-7">
            <label className="recycle-bin-modal__search relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
              <span className="sr-only">搜尋回收區</span>
              <input
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="搜尋檔名、繪師或原始路徑"
                className="w-full rounded-lg py-2 ps-9 pe-3 text-sm"
              />
            </label>
            <label className="recycle-bin-modal__select-label">
              <span className="sr-only">依繪師篩選</span>
              <select value={artistFilter} onChange={event => setArtistFilter(event.target.value)} className="rounded-lg px-3 py-2 text-sm">
                <option value="all">所有繪師</option>
                {artistOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <span className="recycle-bin-modal__count ms-auto text-xs">{visibleEntries.length} / {entries.length} 項</span>
            <button
              type="button"
              onClick={() => setConfirmTarget('all')}
              disabled={loading || actionLoading || entries.every(entry => !entry.available)}
              className="recycle-bin-modal__danger-button inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              移至資源回收筒
            </button>
          </div>

          {error && <div className="recycle-bin-modal__error px-5 py-3 text-xs sm:px-7" role="alert">{error}</div>}

          <div className="recycle-bin-modal__content min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            {loading ? (
              <div className="recycle-bin-modal__empty" role="status" aria-live="polite" aria-busy="true">
                <div className="recycle-bin-modal__empty-icon" aria-hidden="true"><Trash2 className="h-6 w-6" /></div>
                <p className="text-sm font-semibold">正在讀取回收區…</p>
              </div>
            ) : groupedEntries.length === 0 ? (
              <div className="recycle-bin-modal__empty" role="status">
                <div className="recycle-bin-modal__empty-icon" aria-hidden="true"><Trash2 className="h-6 w-6" /></div>
                <p className="text-sm font-semibold">回收區目前是空的</p>
                <p className="recycle-bin-modal__description mt-1 text-xs">移入回收區的作品會保留在這裡，等待你確認是否交給系統資源回收筒。</p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedEntries.map(([artistName, group]) => (
                  <section key={artistName} aria-labelledby={`recycle-group-${artistName}`}>
                    <div className="recycle-bin-modal__group-heading mb-2 flex items-center gap-2">
                      <Folder className="h-4 w-4" aria-hidden="true" />
                      <h3 id={`recycle-group-${artistName}`} className="text-sm font-semibold">{artistName}</h3>
                      <span className="recycle-bin-modal__count text-xs">{group.length} 項</span>
                    </div>
                    <div className="recycle-bin-modal__group overflow-hidden rounded-xl">
                      {group.map(entry => (
                        <article key={entry.trash_id} className="recycle-bin-modal__row flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold" title={entry.file_name}>{entry.file_name}</p>
                            <p className="recycle-bin-modal__meta mt-1 truncate text-xs" title={entry.original_path}>
                              {formatDate(entry.trashed_at)} · {formatBytes(entry.file_size)} · {entry.original_path}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setConfirmTarget(entry)}
                            disabled={!entry.available || actionLoading}
                            className="recycle-bin-modal__row-action inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                            title={entry.available ? '移至 Windows 資源回收筒' : '找不到回收區檔案'}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {entry.available ? '移至資源回收筒' : '檔案不存在'}
                          </button>
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
