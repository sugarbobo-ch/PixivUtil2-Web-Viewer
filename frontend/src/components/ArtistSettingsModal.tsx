import React, { useEffect, useRef, useState } from 'react';
import { Eye, Settings2, Trash2, X } from 'lucide-react';
import { Artist } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { Button, IconButton } from './ui/Button';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';
import { apiClient } from '../api/client';
import { getArtistScopeKey } from '../utils/artistIdentity';

interface ArtistSettingsModalProps {
  isOpen: boolean;
  artist: Artist | null;
  onClose: () => void;
  onArtistChanged?: () => void;
  onArtistMetadataChanged?: () => void;
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
  onArtistMetadataChanged,
}) => {
  const [action, setAction] = useState<ArtistAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useModalFocusTrap({
    isOpen: isOpen && !!artist,
    dialogRef,
    initialFocusRef: closeButtonRef,
    disabled: !!action,
  });

  useEffect(() => {
    if (!isOpen) {
      setAction(null);
      setLoading(false);
      setIdentityLoading(false);
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
      const artistKey = getArtistScopeKey(artist);
      const data = action === 'hide'
        ? await apiClient.artists.hide(artistKey, artist.folder_name || artist.name || '')
        : await apiClient.artists.trash(artistKey);

      const artistName = artist.name || `繪師 ${artist.member_id}`;
      setMessage(action === 'hide'
        ? `已隱藏「${artistName}」；原始檔案沒有被移動。`
        : `已將「${artistName}」的 ${typeof data.moved_files === 'number'
          ? data.moved_files
          : typeof data.trashed_items === 'number' ? data.trashed_items : 0} 個作品移到回收區。`);
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

  const handleIdentityStatus = async (status: 'verified' | 'rejected' | 'inferred') => {
    if (!artist?.folder_id || identityLoading) return;
    setIdentityLoading(true);
    setMessage(null);
    setError(null);
    try {
      await apiClient.artists.updateIdentity(artist.folder_id, status);
      setMessage(status === 'verified'
        ? `已確認此資料夾對應 member ID ${artist.member_id}。`
        : status === 'rejected'
          ? '已將此資料夾標記為未知創作者，不會顯示創作者來源連結。'
          : '已撤銷確認，創作者身份需要重新確認。');
      onArtistMetadataChanged?.();
    } catch (identityError) {
      setError(getErrorMessage(identityError));
    } finally {
      setIdentityLoading(false);
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
          ref={dialogRef}
          className="settings-modal__panel flex w-full max-w-xl flex-col overflow-hidden rounded-2xl"
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
            <IconButton ref={closeButtonRef} type="button" onClick={onClose} variant="ghost" className="settings-modal__close" aria-label="關閉繪師設定" title="關閉繪師設定">
              <X className="h-5 w-5" aria-hidden="true" />
            </IconButton>
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
              {artist.folder_id && artist.member_id > 0 && (
                <div className="space-y-3 border-t border-[var(--settings-border-soft)] pt-3">
                  <div>
                    <p className="settings-modal__label text-sm font-semibold">創作者身份</p>
                    <p className="settings-modal__description mt-1 text-xs leading-5">
                      {artist.identity_status === 'verified'
                        ? `已確認為 member ID ${artist.member_id}，可以顯示 Pixiv／FANBOX 來源連結。`
                        : artist.identity_status === 'rejected'
                          ? '目前標記為未知創作者，不會根據資料夾名稱推定來源連結。'
                          : `資料夾名稱包含 member ID ${artist.member_id}，但尚未確認是否為真正的創作者。`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {artist.identity_status !== 'verified' && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={identityLoading || loading}
                        onClick={() => void handleIdentityStatus('verified')}
                      >
                        確認此 member ID
                      </Button>
                    )}
                    {artist.identity_status !== 'rejected' && (
                      <Button
                        type="button"
                        variant="plain"
                        disabled={identityLoading || loading}
                        onClick={() => void handleIdentityStatus('rejected')}
                      >
                        標記為未知
                      </Button>
                    )}
                    {artist.identity_status === 'verified' && (
                      <Button
                        type="button"
                        variant="plain"
                        disabled={identityLoading || loading}
                        onClick={() => void handleIdentityStatus('inferred')}
                      >
                        撤銷確認
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                onClick={() => setAction('hide')}
                disabled={loading}
                variant="secondary"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                隱藏此繪師
              </Button>
              <Button
                type="button"
                onClick={() => setAction('trash')}
                disabled={loading}
                variant="danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                刪除全部作品（移到回收區）
              </Button>
            </div>
          </div>

          <footer className="settings-modal__footer flex justify-end px-6 py-4">
            <Button type="button" onClick={onClose} variant="plain">
              關閉
            </Button>
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
