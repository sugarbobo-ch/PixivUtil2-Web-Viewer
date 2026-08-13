import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { DEFAULT_WEB_CONFIG } from '../../types';
import { SettingsLibraryContent } from './SettingsLibraryContent';
import { SettingsPixivContent } from './SettingsPixivContent';

const WEB_CONFIG_DRAFT = {
  ...DEFAULT_WEB_CONFIG,
  pixivConfigPath: DEFAULT_WEB_CONFIG.pixivConfigPath ?? '',
};

const renderLibrary = () => render(
  <SettingsLibraryContent
    webConfig={WEB_CONFIG_DRAFT}
    setWebConfig={vi.fn()}
    rootDirectory="D:/media"
    librarySourceHasUnsavedChanges={false}
    libraryJobIsBusy={false}
    onRescanDirectory={vi.fn()}
    artists={[]}
    selectedArtistIds={[]}
    setSelectedArtistIds={vi.fn()}
    onUpdateSelectedArtists={vi.fn()}
    scanning={false}
    onAnalyzeMissingColors={vi.fn()}
    onOrganizeThumbnailCache={vi.fn()}
    libraryJob={null}
    libraryJobIsActive={false}
    libraryProgress={null}
    onCancelLibraryJob={vi.fn()}
    thumbnailCacheStats={{
      active_files: 0,
      active_bytes: 0,
      tracked_files: 0,
      recoverable_files: 0,
      recoverable_bytes: 0,
      recovery_jobs: [],
    }}
    thumbnailCacheLoading={false}
    expandedRecoveryJobId={null}
    recoveryDetails={null}
    recoveryDetailsLoading={false}
    onToggleRecoveryDetails={vi.fn()}
    onRestoreThumbnailCache={vi.fn()}
    onRecycleThumbnailCache={vi.fn()}
    onRecoveryPageChange={vi.fn()}
  />,
);

describe('settings content panels', () => {
  it('renders Library operations independently of the modal shell', () => {
    renderLibrary();

    expect(screen.getByText('圖片資料庫')).toBeTruthy();
    expect(screen.getByRole('button', { name: '更新圖片資料庫' })).toBeTruthy();
    expect(screen.getByText('縮圖儲存空間')).toBeTruthy();
  });

  it('renders localized Pixiv config fields independently of the modal shell', () => {
    render(
      <I18nProvider initialLanguage="en">
        <SettingsPixivContent
          webConfig={WEB_CONFIG_DRAFT}
          setWebConfig={vi.fn()}
          pixivSections={{
            Settings: { rootdirectory: 'D:/media', useproxy: 'False' },
            Network: { useproxy: 'False' },
          }}
          activeSection="Settings"
          setActiveSection={vi.fn()}
          sectionFilter=""
          setSectionFilter={vi.fn()}
          configPathInfo={{
            configPath: 'config.ini',
            backupPath: 'config.ini.bak',
            defaultConfigPath: 'config.ini',
            usingDefaultPath: true,
          }}
          loading={false}
          onSaveConfigPath={vi.fn()}
          onUpdateValue={vi.fn()}
          onNavigateToLibrary={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText('Image root directory')).toBeTruthy();
    expect(screen.getByText('Root directory for downloaded images and work folders.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Network settings/ })).toBeTruthy();
  });
});
