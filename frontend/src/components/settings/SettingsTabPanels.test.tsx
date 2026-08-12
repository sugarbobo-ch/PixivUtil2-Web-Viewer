import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SettingsBackupTab,
  SettingsLibraryTab,
  SettingsPixivTab,
  SettingsWebTab,
} from './SettingsTabPanels';

describe('settings tab boundaries', () => {
  it('keeps the four domain panels addressable as tab panels', () => {
    const onCreateBackup = vi.fn();
    const onRestoreBackup = vi.fn();

    render(
      <>
        <span id="settings-tab-web">Web</span>
        <span id="settings-tab-library">Library</span>
        <span id="settings-tab-pixiv">Pixiv</span>
        <span id="settings-tab-backup">Backup</span>
        <SettingsWebTab hiddenArtists={[]} onUnhideArtist={vi.fn()}>
          <p>web content</p>
        </SettingsWebTab>
        <SettingsLibraryTab><p>library content</p></SettingsLibraryTab>
        <SettingsPixivTab><p>pixiv content</p></SettingsPixivTab>
        <SettingsBackupTab
          configPath="config.ini"
          backupPath="config.ini.bak"
          hasBackup
          loading={false}
          onCreateBackup={onCreateBackup}
          onRestoreBackup={onRestoreBackup}
        />
      </>,
    );

    expect(document.getElementById('settings-panel-web')?.textContent).toContain('web content');
    expect(document.getElementById('settings-panel-library')?.textContent).toContain('library content');
    expect(document.getElementById('settings-panel-pixiv')?.textContent).toContain('pixiv content');
    expect(document.getElementById('settings-panel-backup')?.textContent).toContain('config.ini');
    expect((screen.getByRole('button', { name: '立即建立手動備份' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '從 .bak 還原' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
