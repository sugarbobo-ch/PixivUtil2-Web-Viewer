import React, { useEffect, useState } from 'react';
import { Eye, RefreshCw, Settings2, Trash2, X } from 'lucide-react';
import { Artist } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface ArtistSettingsModalProps {
  isOpen: boolean;
  artist: Artist | null;
  onClose: () => void;
  onArtistChanged?: () => void;
  onOpenRecycleBin?: () => void;
  isUpdating?: boolean;
  onRequestUpdate?: () => void;
}

type ArtistAction = 'hide' | 'trash';

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : '發生未知錯誤，請稍後再試。'
);

export const ArtistSettingsModal: React.FC<ArtistSettingsModalProps> = ({
  isOpen,
  artist,
  onClose,
  onArtistChanged,
  onOpenRecycleBin,
  isUpdating = false,
  onRequestUpdate,
}) => {
  const [action, setAction] = useState<ArtistAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setAction(null);
      setLoading(false);
      setMessage(null);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !action && !loading) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [action, isOpen, loading, onClose]);

  const handleAction = async () => {
    if (!artist || !action || loading) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const endpoint = action === 'hide'
        ? `/api/artists/${encodeURIComponent(artist.member_id)}/hide`
        : `/api/artists/${encodeURIComponent(artist.member_id)}/trash`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: action === 'hide' ? { 'Content-Type': 'application/json' } : undefined,
        body: action === 'hide'
          ? JSON.stringify({ folder_name: artist.folder_name || artist.name || '' })
          : undefined,
      });
      const data = await response.json().catch(() => ({})) as {
        detail?: string;
        moved_files?: number;
        trashed_items?: number;
      };
      if (!response.ok) throw new Error(data.detail || `繪師操作失敗（${response.status}）`);

      const artistName = artist.name || `繪師 ${artist.member_id}`;
      setMessage(action === 'hide'
        ? `已隱藏「${artistName}」；原始檔案沒有被移動。`
        : `已將「${artistName}」的 ${data.moved_files ?? data.trashed_items ?? 0} 個作品移到回收區。`);
      setAction(null);
      onArtistChanged?.();
      onClose();
    } catch (actionError) {
      setError(getErrorMessage(actionError));
      setAction(null);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !artist) return null;

  const artistName = artist.name || `繪師 ${artist.member_id}`;

  return (
    <>
      <div
        className="settings-modal fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 backdrop-blur-sm"
        role="presentation"
        onClick={event => {
          if (event.target === event.currentTarget && !loading && !action) onClose();
        }}
      >
        <section
          className="settings-modal__panel flex w-full max-w-xl flex-col overflow-hidden rounded-2xl shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="artist-settings-title"
        >
          <header className="settings-modal__header flex min-h-16 items-center justify-between gap-3 py-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="settings-modal__title-icon">
                <Settings2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 id="artist-settings-title" className="settings-modal__title truncate text-lg font-bold">
                繪師設定：{artistName}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="settings-modal__close" aria-label="關閉繪師設定" title="關閉繪師設定">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div className="settings-modal__content space-y-5 p-6">
            {error && <p className="settings-modal__message is-error rounded-lg px-3 py-2 text-sm" role="alert">{error}</p>}
            {message && <p className="settings-modal__message is-success rounded-lg px-3 py-2 text-sm" role="status">{message}</p>}

            <div className="settings-modal__artist-card space-y-3 rounded-xl p-4">
              <div>
                <p className="settings-modal__label truncate text-sm font-semibold">{artistName}</p>
                <p className="settings-modal__description mt-1 text-xs leading-5">
                  目前有 {artist.artwork_count.toLocaleString()} 個作品。以下動作只會套用到這位繪師。
                </p>
              </div>
              <div className="settings-modal__description rounded-lg border border-[var(--settings-border-soft)] px-3 py-2 text-xs leading-5">
                移入回收區不會直接刪除原始檔案；下一次掃描也會略過應用程式回收區。
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {onRequestUpdate && (
                <button
                  type="button"
                  onClick={onRequestUpdate}
                  disabled={loading || isUpdating}
                  className="settings-modal__secondary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold sm:col-span-2"
                >
                  <RefreshCw className={`settings-modal__library-status-icon h-4 w-4 ${isUpdating ? 'is-active' : ''}`} aria-hidden="true" />
                  {isUpdating ? '背景更新中…' : '更新作品資料'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setAction('hide')}
                disabled={loading}
                className="settings-modal__secondary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                隱藏此繪師
              </button>
              <button
                type="button"
                onClick={() => setAction('trash')}
                disabled={loading}
                className="settings-modal__danger-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                刪除全部作品（移到回收區）
              </button>
            </div>

            {onOpenRecycleBin && (
              <button
                type="button"
                onClick={onOpenRecycleBin}
                className="settings-modal__secondary-button inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                查看回收區
              </button>
            )}
          </div>

          <footer className="settings-modal__footer flex justify-end px-6 py-4">
            <button type="button" onClick={onClose} className="settings-modal__secondary-button min-h-11 rounded-xl px-4 py-2 text-sm font-semibold">
              關閉
            </button>
          </footer>
        </section>
      </div>

      <ConfirmModal
        isOpen={action !== null}
        title={action === 'hide' ? '隱藏這位繪師？' : '將這位繪師的作品移到回收區？'}
        message={action === 'hide'
          ? `隱藏「${artistName}」後，Web Viewer 會在列表與掃描結果中略過它；原始檔案不會被移動。`
          : `確定要將「${artistName}」的全部作品移到回收區嗎？檔案仍可在回收區移至 Windows 資源回收筒，不會直接刪除。`}
        confirmLabel={action === 'hide' ? '隱藏繪師' : '移到回收區'}
        cancelLabel="取消"
        onConfirm={() => void handleAction()}
        onCancel={() => {
          if (!loading) setAction(null);
        }}
      />
    </>
  );
};
