import React, { ReactNode } from 'react';
import { Save, Trash2, RotateCcw } from 'lucide-react';
import { HiddenArtist } from '../../types';
import { Badge, Button } from '../ui';

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
}) => (
  <SettingsTabFrame id="settings-panel-web" labelledBy="settings-tab-web">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="settings-modal__heading text-base font-bold">顯示與瀏覽</h3>
        <p className="settings-modal__description mt-1 text-sm leading-5">調整檢視器的外觀、縮圖與瀏覽行為。</p>
      </div>
      {onOpenRecycleBin && (
        <Button type="button" onClick={onOpenRecycleBin} variant="secondary">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          開啟回收區
        </Button>
      )}
    </div>

    {hiddenArtists.length > 0 && (
      <section className="settings-modal__hidden-artists space-y-2" aria-labelledby="hidden-artists-title">
        <div className="flex items-center justify-between gap-3">
          <h4 id="hidden-artists-title" className="settings-modal__label text-sm font-semibold">已隱藏繪師</h4>
          <span className="settings-modal__text-subtle text-xs">{hiddenArtists.length} 位</span>
        </div>
        <div className="space-y-2">
          {hiddenArtists.map(artist => (
            <div key={artist.folder_id || artist.scope_key || String(artist.member_id)} className="settings-modal__hidden-artist-row flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2">
              <span className="min-w-0 truncate text-xs" title={artist.display_name || artist.name || artist.folder_name || undefined}>{artist.display_name || artist.name || artist.folder_name || `繪師 ${artist.member_id}`}</span>
              <Button type="button" onClick={() => void onUnhideArtist(artist)} variant="secondary">
                恢復顯示
              </Button>
            </div>
          ))}
        </div>
      </section>
    )}

    {children}
  </SettingsTabFrame>
);

export const SettingsLibraryTab: React.FC<{ children: ReactNode }> = ({ children }) => (
  <SettingsTabFrame id="settings-panel-library" labelledBy="settings-tab-library" className="settings-modal__library space-y-8">
    <div>
      <h3 className="settings-modal__heading text-base font-bold">媒體資料庫</h3>
      <p className="settings-modal__description mt-1 text-sm leading-5">管理圖片清單、背景工作與縮圖儲存空間。</p>
    </div>
    {children}
  </SettingsTabFrame>
);

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
}) => (
  <SettingsTabFrame id="settings-panel-backup" labelledBy="settings-tab-backup">
    <div>
      <h3 className="settings-modal__heading text-base font-bold">設定檔備份</h3>
      <p className="settings-modal__description mt-1 text-sm leading-5">儲存設定時會自動備份，也可以隨時手動建立目前 config.ini 的 .bak 備份。</p>
    </div>

    <div className="settings-modal__backup-card space-y-4 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="settings-modal__label text-sm font-semibold">目前設定檔</h4>
          <p className="settings-modal__description mt-1 break-all font-mono text-xs leading-5">{configPath || '載入中…'}</p>
        </div>
        <Badge variant={hasBackup ? 'success' : 'neutral'} size="sm">
          {hasBackup ? '已有 .bak 備份' : '尚無備份'}
        </Badge>
      </div>
      <div>
        <p className="settings-modal__description mb-3 break-all text-xs leading-5">
          備份檔：<code className="settings-modal__code">{backupPath || '載入中…'}</code>
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={onCreateBackup} disabled={loading} variant="success">
            <Save className="h-4 w-4" aria-hidden="true" />
            {loading ? '處理中…' : '立即建立手動備份'}
          </Button>
          <Button type="button" onClick={onRestoreBackup} disabled={loading || !hasBackup} variant="secondary">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            從 .bak 還原
          </Button>
        </div>
      </div>
    </div>
  </SettingsTabFrame>
);
