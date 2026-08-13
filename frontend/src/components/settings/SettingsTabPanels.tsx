import React, { ReactNode } from 'react';
import { Save, Trash2, RotateCcw } from 'lucide-react';
import { HiddenArtist } from '../../types';
import { Badge, Button } from '../ui';
import { useI18n } from '../../i18n';

interface SettingsTabFrameProps {
  id: string;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}

const SettingsTabFrame: React.FC<SettingsTabFrameProps> = ({
  id,
  labelledBy,
  className = 'space-y-6',
  children,
}) => (
  <section id={id} role="tabpanel" aria-labelledby={labelledBy} className={className}>
    {children}
  </section>
);

export interface SettingsWebTabProps {
  hiddenArtists: HiddenArtist[];
  onUnhideArtist: (artist: HiddenArtist) => void | Promise<void>;
  onOpenRecycleBin?: () => void;
  children: ReactNode;
}

export const SettingsWebTab: React.FC<SettingsWebTabProps> = ({
  hiddenArtists,
  onUnhideArtist,
  onOpenRecycleBin,
  children,
}) => {
  const { t, formatNumber } = useI18n();
  return (
    <SettingsTabFrame id="settings-panel-web" labelledBy="settings-tab-web">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="settings-modal__heading text-base font-bold">{t('settings.displayAndBrowsing')}</h3>
        <p className="settings-modal__description mt-1 text-sm leading-5">{t('settings.webDescription')}</p>
      </div>
      {onOpenRecycleBin && (
        <Button type="button" onClick={onOpenRecycleBin} variant="secondary">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('settings.openRecycleBin')}
        </Button>
      )}
    </div>

    {hiddenArtists.length > 0 && (
      <section className="settings-modal__hidden-artists space-y-2" aria-labelledby="hidden-artists-title">
        <div className="flex items-center justify-between gap-3">
          <h4 id="hidden-artists-title" className="settings-modal__label text-sm font-semibold">{t('settings.hiddenArtists')}</h4>
          <span className="settings-modal__text-subtle text-xs">{t('settings.artistCount', { count: formatNumber(hiddenArtists.length) })}</span>
        </div>
        <div className="space-y-2">
          {hiddenArtists.map(artist => (
            <div key={artist.folder_id || artist.scope_key || String(artist.member_id)} className="settings-modal__hidden-artist-row flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2">
              <span className="min-w-0 truncate text-xs" title={artist.display_name || artist.name || artist.folder_name || undefined}>{artist.display_name || artist.name || artist.folder_name || t('common.artistId', { id: artist.member_id })}</span>
              <Button type="button" onClick={() => void onUnhideArtist(artist)} variant="secondary">
                {t('settings.restoreVisibility')}
              </Button>
            </div>
          ))}
        </div>
      </section>
    )}

    {children}
    </SettingsTabFrame>
  );
};

export const SettingsLibraryTab: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useI18n();
  return (
    <SettingsTabFrame id="settings-panel-library" labelledBy="settings-tab-library" className="settings-modal__library space-y-8">
    <div>
      <h3 className="settings-modal__heading text-base font-bold">{t('settings.library')}</h3>
      <p className="settings-modal__description mt-1 text-sm leading-5">{t('settings.libraryDescription')}</p>
    </div>
    {children}
    </SettingsTabFrame>
  );
};

export const SettingsPixivTab: React.FC<{ children: ReactNode }> = ({ children }) => (
  <SettingsTabFrame id="settings-panel-pixiv" labelledBy="settings-tab-pixiv">
    {children}
  </SettingsTabFrame>
);

export interface SettingsBackupTabProps {
  configPath: string;
  backupPath: string;
  hasBackup: boolean;
  loading: boolean;
  onCreateBackup: () => void;
  onRestoreBackup: () => void;
}

export const SettingsBackupTab: React.FC<SettingsBackupTabProps> = ({
  configPath,
  backupPath,
  hasBackup,
  loading,
  onCreateBackup,
  onRestoreBackup,
}) => {
  const { t } = useI18n();
  return (
    <SettingsTabFrame id="settings-panel-backup" labelledBy="settings-tab-backup">
    <div>
      <h3 className="settings-modal__heading text-base font-bold">{t('settings.backup')}</h3>
      <p className="settings-modal__description mt-1 text-sm leading-5">{t('settings.backupDescription')}</p>
    </div>

    <div className="settings-modal__backup-card space-y-4 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="settings-modal__label text-sm font-semibold">{t('settings.currentConfig')}</h4>
          <p className="settings-modal__description mt-1 break-all font-mono text-xs leading-5">{configPath || t('settings.loading')}</p>
        </div>
        <Badge variant={hasBackup ? 'success' : 'neutral'} size="sm">
          {hasBackup ? t('settings.hasBackup') : t('settings.noBackup')}
        </Badge>
      </div>
      <div>
        <p className="settings-modal__description mb-3 break-all text-xs leading-5">
          {t('settings.backupFile')} <code className="settings-modal__code">{backupPath || t('settings.loading')}</code>
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={onCreateBackup} disabled={loading} variant="success">
            <Save className="h-4 w-4" aria-hidden="true" />
            {loading ? t('common.processing') : t('settings.createBackup')}
          </Button>
          <Button type="button" onClick={onRestoreBackup} disabled={loading || !hasBackup} variant="secondary">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t('settings.restoreBackup')}
          </Button>
        </div>
      </div>
    </div>
    </SettingsTabFrame>
  );
};
