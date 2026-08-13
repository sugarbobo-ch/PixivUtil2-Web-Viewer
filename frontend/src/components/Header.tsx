import React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckSquare,
  Eye,
  EyeOff,
  Grid,
  Layers,
  Menu,
  Maximize2,
  Moon,
  ScrollText,
  Search,
  Settings,
  Sun,
  RefreshCw,
  X,
} from 'lucide-react';
import { LibraryJob, ThemeMode, ViewMode } from '../types';
import { useI18n, type I18nContextValue } from '../i18n';
import { Button, IconButton, Input } from './ui';

interface HeaderProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isEditMode: boolean;
  setIsEditMode: (edit: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  toggleSidebar: () => void;
  toggleMenu: () => void;
  isSidebarOpen: boolean;
  isMobileMenuOpen: boolean;
  totalCount: number;
  onOpenSettings: () => void;
  groupMangaPosts?: boolean;
  onToggleGroupMangaPosts?: () => void;
  blurEnabled?: boolean;
  onToggleBlur?: () => void;
  libraryJob?: LibraryJob | null;
}

const isLibraryJobActive = (job?: LibraryJob | null) => (
  !!job && ['queued', 'running', 'cancelling'].includes(job.status)
);

const getLibraryJobLabel = (
  job: LibraryJob,
  t: I18nContextValue['t'],
  formatNumber: I18nContextValue['formatNumber'],
) => {
  if (job.status === 'queued') return t('library.jobQueued');
  if (job.status === 'cancelling') return t('library.jobCancelling');
  const processed = formatNumber(job.processed);
  const total = job.total === undefined || job.total === null ? '…' : formatNumber(job.total);
  if (job.phase === 'discovering') return t('library.jobDiscovering', { count: formatNumber(job.discovered) });
  if (job.phase === 'analyzing_colors') return t('library.jobAnalyzing', { processed, total });
  if (job.phase === 'organizing_cache') return t('library.jobOrganizing', { processed, total });
  return t('library.jobUpdating', { processed, total });
};

export const Header: React.FC<HeaderProps> = ({
  viewMode,
  setViewMode,
  theme,
  setTheme,
  isEditMode,
  setIsEditMode,
  searchQuery,
  setSearchQuery,
  toggleSidebar,
  toggleMenu,
  isSidebarOpen,
  isMobileMenuOpen,
  totalCount,
  onOpenSettings,
  groupMangaPosts = false,
  onToggleGroupMangaPosts,
  blurEnabled = false,
  onToggleBlur,
  libraryJob = null,
}) => {
  const { t, formatNumber } = useI18n();
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const libraryJobLabel = libraryJob ? getLibraryJobLabel(libraryJob, t, formatNumber) : '';
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isMobileSearchOpen) return undefined;

    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isMobileSearchOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsMobileSearchOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const headerClassName = [
    'app-header shrink-0 z-30',
    isMobileSearchOpen ? 'is-mobile-search-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <header className={headerClassName}>
      <div className="app-header__leading">
        <IconButton
          type="button"
          onClick={toggleSidebar}
          aria-label={t('common.toggleSidebar')}
          aria-expanded={isSidebarOpen}
          aria-controls="gallery-filter-sidebar"
          data-focus-fallback="sidebar"
          className="app-header__desktop-sidebar-trigger header-action header-action-icon"
          title={t('common.sidebarVisibility')}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </IconButton>
        <IconButton
          type="button"
          onClick={toggleMenu}
          aria-label={t('common.openMenu')}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu-drawer"
          data-focus-fallback="menu"
          className="app-header__mobile-menu-trigger header-action header-action-icon"
          title={t('common.openMenu')}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </IconButton>
        <div className="app-header__identity">
          <a
            href="/"
            className="header-logo"
            aria-label={t('common.homeGallery')}
          >
            PixivUtil2 Gallery
          </a>
          <span className="header-count">{t('common.worksCount', { count: formatNumber(totalCount) })}</span>
        </div>
        {isLibraryJobActive(libraryJob) && (
          <Button
            type="button"
            onClick={onOpenSettings}
            variant="secondary"
            className="header-library-status header-action"
            aria-label={`${t('common.jobProgress')}：${libraryJobLabel}`}
            title={t('common.jobProgress')}
          >
            <RefreshCw className="header-library-status__icon" aria-hidden="true" />
            <span className="header-library-status__label">{libraryJobLabel}</span>
          </Button>
        )}
      </div>

      <IconButton
        type="button"
        onClick={() => setIsMobileSearchOpen(open => !open)}
        aria-expanded={isMobileSearchOpen}
        aria-controls="header-search"
        aria-label={isMobileSearchOpen ? t('common.closeSearch') : t('common.openSearch')}
        className="app-header__mobile-search-toggle header-action header-action-icon"
        title={isMobileSearchOpen ? t('common.closeSearch') : t('common.openSearch')}
      >
        {isMobileSearchOpen ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Search className="h-5 w-5" aria-hidden="true" />
        )}
      </IconButton>

      <div id="header-search" className="app-header__search">
        <Input
          ref={searchInputRef}
          controlSize="sm"
          leadingIcon={<Search aria-hidden="true" />}
          wrapperClassName="header-search-input-wrap"
          clearable
          onClear={() => setSearchQuery('')}
          clearButtonLabel={t('common.clearSearch')}
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label={t('common.searchTitleArtist')}
          placeholder={`${t('common.searchTitleArtist')}...`}
          className="header-search-input"
        />
      </div>

      <div className="app-header__desktop-actions">
        <div className="app-header__controls">
        <div className="header-mode-group" role="group" aria-label={t('common.viewMode')}>
          <Button
            type="button"
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            variant={viewMode === 'grid' ? 'primary' : 'ghost'}
            size="sm"
            aria-label={viewMode === 'grid' ? t('common.galleryList') : t('common.returnGallery')}
            className={`header-mode-button ${viewMode === 'grid' ? 'is-active' : ''}`}
            title={viewMode === 'grid' ? t('common.galleryList') : t('common.returnGallery')}
          >
            {viewMode === 'grid' ? (
              <Grid className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{viewMode === 'grid' ? t('common.galleryList') : t('common.returnGallery')}</span>
          </Button>
          <Button
            type="button"
            onClick={() => setViewMode('fullscreen')}
            aria-pressed={viewMode === 'fullscreen'}
            variant={viewMode === 'fullscreen' ? 'primary' : 'ghost'}
            size="sm"
            aria-label={t('common.fullscreenView')}
            className={`header-mode-button ${viewMode === 'fullscreen' ? 'is-active' : ''}`}
            title={t('common.fullscreenView')}
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('common.fullscreen')}</span>
          </Button>
          <Button
            type="button"
            onClick={() => setViewMode('webtoon')}
            aria-pressed={viewMode === 'webtoon'}
            variant={viewMode === 'webtoon' ? 'primary' : 'ghost'}
            size="sm"
            aria-label={t('common.webtoonView')}
            className={`header-mode-button ${viewMode === 'webtoon' ? 'is-active' : ''}`}
            title={t('common.webtoonView')}
          >
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('common.webtoon')}</span>
          </Button>
        </div>
      </div>

        <div
          id="header-mobile-tools"
        className="app-header__mobile-tools"
        aria-label={t('common.moreTools')}
      >
        <div className="app-header__mode-actions">
          {onToggleGroupMangaPosts && (
            <Button
              type="button"
              onClick={onToggleGroupMangaPosts}
              aria-pressed={groupMangaPosts}
              aria-label={groupMangaPosts ? t('common.closeGroupMode') : t('common.openGroupMode')}
              variant={groupMangaPosts ? 'primary' : 'secondary'}
              className={`header-action header-action-labeled ${groupMangaPosts ? 'is-active' : ''}`}
              title={t('common.groupMode')}
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">{groupMangaPosts ? t('common.groupModeOn') : t('common.groupMode')}</span>
            </Button>
          )}

          {onToggleBlur && (
            <Button
              type="button"
              onClick={onToggleBlur}
              aria-pressed={blurEnabled}
              aria-label={blurEnabled ? t('common.closeBlur') : t('common.openBlur')}
              variant={blurEnabled ? 'primary' : 'secondary'}
              className={`header-action header-action-labeled ${blurEnabled ? 'is-active' : ''}`}
              title={blurEnabled ? t('common.closeBlur') : t('common.openBlur')}
            >
              {blurEnabled ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden md:inline">{blurEnabled ? t('common.blurOn') : t('common.blur')}</span>
            </Button>
          )}

          {viewMode !== 'webtoon' && (
            <Button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              aria-pressed={isEditMode}
              aria-label={isEditMode ? t('common.endEditMode') : t('common.openEditMode')}
              variant={isEditMode ? 'primary' : 'secondary'}
              className={`header-action header-action-labeled ${isEditMode ? 'is-active' : ''}`}
              title={`${t('common.editMode')} (E)`}
            >
              <CheckSquare className="h-4 w-4" aria-hidden="true" />
              <span>{isEditMode ? t('common.editing') : t('common.editMode')}</span>
              <kbd className="header-shortcut">E</kbd>
            </Button>
          )}
        </div>

        <div className="app-header__utility-actions">
          <IconButton
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            variant="ghost"
            aria-label={theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')}
            aria-pressed={theme === 'light'}
            className="header-action header-action-icon"
            title={theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
          </IconButton>

          <IconButton
            type="button"
            onClick={onOpenSettings}
            variant="ghost"
            aria-label={t('common.openSettings')}
            data-focus-fallback="settings"
            className="header-action header-action-icon"
            title={t('common.openSettings')}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>
        </div>
      </div>
    </header>
  );
};
