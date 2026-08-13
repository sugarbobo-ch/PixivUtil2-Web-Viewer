import React, { useEffect, useRef, useState } from 'react';
import '../styles/settings.css';
import { Eye, Settings2, Trash2, X } from 'lucide-react';
import { Artist } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { Button, IconButton, Input } from './ui';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';
import { apiClient } from '../api/client';
import { getArtistScopeKey } from '../utils/artistIdentity';
import { useI18n } from '../i18n';

interface ArtistSettingsModalProps {
  isOpen: boolean;
  artist: Artist | null;
  onClose: () => void;
  onArtistChanged?: () => void;
  onArtistMetadataChanged?: () => void;
}

type ArtistAction = 'hide' | 'trash';

export const ArtistSettingsModal: React.FC<ArtistSettingsModalProps> = ({
  isOpen,
  artist,
  onClose,
  onArtistChanged,
  onArtistMetadataChanged,
}) => {
  const { t, formatNumber } = useI18n();
  const [action, setAction] = useState<ArtistAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<'verified' | 'rejected' | 'inferred' | 'unknown'>(artist?.identity_status ?? 'unknown');
  const [customMemberId, setCustomMemberId] = useState<string>(artist?.member_id && artist.member_id > 0 ? String(artist.member_id) : '');
  const [customFanboxId, setCustomFanboxId] = useState<string>(artist?.fanbox_id || '');
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const getArtistName = (entry: Artist) => entry.name || t('common.artistId', { id: entry.member_id });

  useModalFocusTrap({
    isOpen: isOpen && !!artist,
    dialogRef,
    initialFocusRef: closeButtonRef,
    disabled: !!action,
  });

  useEffect(() => {
    if (!isOpen || !artist) {
      setAction(null);
      setLoading(false);
      setIdentityLoading(false);
      setMessage(null);
      setError(null);
    } else {
      setCurrentStatus(artist.identity_status ?? 'unknown');
      setCustomMemberId(artist.member_id && artist.member_id > 0 ? String(artist.member_id) : '');
      setCustomFanboxId(artist.fanbox_id || '');
    }
  }, [artist, isOpen]);

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

      const artistName = getArtistName(artist);
      setMessage(action === 'hide'
        ? t('settings.artistHideSuccess', { name: artistName })
        : t('settings.artistTrashSuccess', {
          name: artistName,
          count: typeof data.moved_files === 'number'
            ? formatNumber(data.moved_files)
            : typeof data.trashed_items === 'number' ? formatNumber(data.trashed_items) : formatNumber(0),
        }));
      setAction(null);
      onArtistChanged?.();
      onClose();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('errors.unknown'));
      setAction(null);
    } finally {
      setLoading(false);
    }
  };

  const handleIdentityStatus = async (
    status: 'verified' | 'rejected' | 'inferred',
    overrideMemberId?: number | null,
    overrideFanboxId?: string | null,
  ) => {
    if (!artist?.folder_id || identityLoading) return;
    setIdentityLoading(true);
    setMessage(null);
    setError(null);
    try {
      let targetMemberId: number | null = null;
      if (overrideMemberId !== undefined) {
        targetMemberId = overrideMemberId;
      } else {
        const raw = customMemberId.trim();
        const match = raw.match(/pixiv\.net\/users\/(\d+)/i) || raw.match(/(\d+)/);
        targetMemberId = match ? parseInt(match[1], 10) : artist.member_id;
      }
      if (typeof targetMemberId === 'number' && (isNaN(targetMemberId) || targetMemberId <= 0)) {
        targetMemberId = null;
      }

      const targetFanboxId = overrideFanboxId !== undefined ? overrideFanboxId : customFanboxId.trim();

      await apiClient.artists.updateIdentity(artist.folder_id, status, targetMemberId, targetFanboxId);
      setCurrentStatus(status);
      setMessage(status === 'verified'
        ? t('settings.identityVerifiedMessage', { id: targetMemberId ?? artist.member_id })
        : status === 'rejected'
          ? t('settings.identityRejectedMessage')
          : t('settings.identityInferredMessage'));
      onArtistMetadataChanged?.();
    } catch (identityError) {
      setError(identityError instanceof Error ? identityError.message : t('errors.unknown'));
    } finally {
      setIdentityLoading(false);
    }
  };

  if (!isOpen || !artist) return null;

  const artistName = getArtistName(artist);

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
                {t('settings.artistTitle', { name: artistName })}
              </h2>
            </div>
            <IconButton ref={closeButtonRef} type="button" onClick={onClose} variant="ghost" className="settings-modal__close" aria-label={t('settings.closeArtistSettings')} title={t('settings.closeArtistSettings')}>
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
                  {t('settings.artistWorkCount', { count: formatNumber(artist.artwork_count) })}
                </p>
              </div>
              <div className="settings-modal__description rounded-lg border border-[var(--settings-border-soft)] px-3 py-2 text-xs leading-5">
                {t('settings.recycleSafety')}
              </div>
              {artist.folder_id && (
                <div className="space-y-3 border-t border-[var(--settings-border-soft)] pt-3">
                  <div>
                    <p className="settings-modal__label text-sm font-semibold">{t('settings.identity')}</p>
                    <p className="settings-modal__description mt-1 text-xs leading-5">
                      {currentStatus === 'verified'
                        ? t('settings.identityVerified', { id: customMemberId || artist.member_id })
                        : currentStatus === 'rejected'
                          ? t('settings.identityRejected')
                          : t('settings.identityInferred', { id: customMemberId || artist.member_id })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium opacity-80">Pixiv 繪師網址 / Member ID</label>
                      <Input
                        type="text"
                        controlSize="sm"
                        value={customMemberId}
                        onChange={e => setCustomMemberId(e.target.value)}
                        placeholder="例如 12345 或 https://www.pixiv.net/users/12345"
                        className="w-full"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium opacity-80">FANBOX 創作者網址 / ID</label>
                      <Input
                        type="text"
                        controlSize="sm"
                        value={customFanboxId}
                        onChange={e => setCustomFanboxId(e.target.value)}
                        placeholder="例如 https://www.pixiv.net/fanbox/creator/12345 或 xxx.fanbox.cc"
                        className="w-full"
                      />
                    </div>
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={identityLoading || loading}
                        onClick={() => {
                          const rawMember = customMemberId.trim();
                          const match = rawMember.match(/pixiv\.net\/users\/(\d+)/i) || rawMember.match(/(\d+)/);
                          const parsedMember = match ? parseInt(match[1], 10) : null;
                          void handleIdentityStatus('verified', parsedMember, customFanboxId.trim());
                        }}
                      >
                        儲存自主設定
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--settings-border-soft)]">
                    {currentStatus !== 'verified' && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={identityLoading || loading}
                        onClick={() => void handleIdentityStatus('verified')}
                      >
                        {t('settings.confirmMember')}
                      </Button>
                    )}
                    {currentStatus !== 'rejected' && (
                      <Button
                        type="button"
                        variant="plain"
                        disabled={identityLoading || loading}
                        onClick={() => void handleIdentityStatus('rejected')}
                      >
                        {t('settings.markUnknown')}
                      </Button>
                    )}
                    {(currentStatus === 'verified' || currentStatus === 'rejected') && (
                      <Button
                        type="button"
                        variant="plain"
                        disabled={identityLoading || loading}
                        onClick={() => void handleIdentityStatus('inferred')}
                      >
                        {t('settings.revokeConfirmation')}
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
                {t('settings.hideArtist')}
              </Button>
              <Button
                type="button"
                onClick={() => setAction('trash')}
                disabled={loading}
                variant="danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t('settings.trashArtistWorks')}
              </Button>
            </div>
          </div>

          <footer className="settings-modal__footer flex justify-end px-6 py-4">
            <Button type="button" onClick={onClose} variant="plain">
              {t('common.close')}
            </Button>
          </footer>
        </section>
      </div>

      <ConfirmModal
        isOpen={action !== null}
        title={action === 'hide' ? t('settings.hideArtistTitle') : t('settings.trashArtistTitle')}
        message={action === 'hide'
          ? t('settings.hideArtistMessage', { name: artistName })
          : t('settings.trashArtistMessage', { name: artistName })}
        confirmLabel={action === 'hide' ? t('settings.hideArtistConfirm') : t('settings.moveArtistToRecycleBin')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void handleAction()}
        onCancel={() => {
          if (!loading) setAction(null);
        }}
      />
    </>
  );
};
