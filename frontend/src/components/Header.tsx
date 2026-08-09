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

const getLibraryJobLabel = (job: LibraryJob) => {
  if (job.status === 'queued') return '排隊中';
  if (job.status === 'cancelling') return '正在停止…';
  if (job.phase === 'discovering') return `讀取資料夾・${job.discovered.toLocaleString()}`;
  if (job.phase === 'analyzing_colors') return `分析色彩・${job.processed.toLocaleString()} / ${job.total ?? '…'}`;
  if (job.phase === 'organizing_cache') return `整理縮圖・${job.processed.toLocaleString()} / ${job.total ?? '…'}`;
  return `更新資料庫・${job.processed.toLocaleString()} / ${job.total ?? '…'}`;
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
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
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
          aria-label="切換側邊欄"
          aria-expanded={isSidebarOpen}
          aria-controls="gallery-filter-sidebar"
          className="app-header__desktop-sidebar-trigger header-action header-action-icon"
          title="顯示或隱藏側邊欄"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </IconButton>
        <IconButton
          type="button"
          onClick={toggleMenu}
          aria-label="切換功能選單"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu-drawer"
          className="app-header__mobile-menu-trigger header-action header-action-icon"
          title="開啟功能選單"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </IconButton>
        <div className="app-header__identity">
          <a
            href="/"
            className="header-logo"
            aria-label="回到首頁，顯示全部繪師"
          >
            PixivUtil2 Gallery
          </a>
          <span className="header-count">{totalCount} 作品</span>
        </div>
        {isLibraryJobActive(libraryJob) && (
          <Button
            type="button"
            onClick={onOpenSettings}
            variant="secondary"
            className="header-library-status header-action"
            aria-label={`媒體資料庫工作：${getLibraryJobLabel(libraryJob!)}`}
            title="查看媒體資料庫工作進度"
          >
            <RefreshCw className="header-library-status__icon" aria-hidden="true" />
            <span className="header-library-status__label">{getLibraryJobLabel(libraryJob!)}</span>
          </Button>
        )}
      </div>

      <IconButton
        type="button"
        onClick={() => setIsMobileSearchOpen(open => !open)}
        aria-expanded={isMobileSearchOpen}
        aria-controls="header-search"
        aria-label={isMobileSearchOpen ? '關閉搜尋' : '開啟搜尋'}
        className="app-header__mobile-search-toggle header-action header-action-icon"
        title={isMobileSearchOpen ? '關閉搜尋' : '開啟搜尋'}
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
          clearButtonLabel="清除搜尋"
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="搜尋標題或繪師名稱"
          placeholder="搜尋標題或繪師名稱..."
          className="header-search-input"
        />
      </div>

      <div className="app-header__desktop-actions">
        <div className="app-header__controls">
        <div className="header-mode-group" role="group" aria-label="檢視模式">
          <Button
            type="button"
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            variant={viewMode === 'grid' ? 'primary' : 'ghost'}
            size="sm"
            aria-label={viewMode === 'grid' ? '作品清單' : '返回作品清單'}
            className={`header-mode-button ${viewMode === 'grid' ? 'is-active' : ''}`}
            title={viewMode === 'grid' ? '作品清單' : '返回作品清單'}
          >
            {viewMode === 'grid' ? (
              <Grid className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{viewMode === 'grid' ? '作品清單' : '返回作品清單'}</span>
          </Button>
          <Button
            type="button"
            onClick={() => setViewMode('fullscreen')}
            aria-pressed={viewMode === 'fullscreen'}
            variant={viewMode === 'fullscreen' ? 'primary' : 'ghost'}
            size="sm"
            aria-label="全螢幕檢視"
            className={`header-mode-button ${viewMode === 'fullscreen' ? 'is-active' : ''}`}
            title="全螢幕檢視"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">全螢幕</span>
          </Button>
          <Button
            type="button"
            onClick={() => setViewMode('webtoon')}
            aria-pressed={viewMode === 'webtoon'}
            variant={viewMode === 'webtoon' ? 'primary' : 'ghost'}
            size="sm"
            aria-label="條漫檢視"
            className={`header-mode-button ${viewMode === 'webtoon' ? 'is-active' : ''}`}
            title="條漫檢視"
          >
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">條漫</span>
          </Button>
        </div>
      </div>

        <div
          id="header-mobile-tools"
        className="app-header__mobile-tools"
        aria-label="更多工具"
      >
        <div className="app-header__mode-actions">
          {onToggleGroupMangaPosts && (
            <Button
              type="button"
              onClick={onToggleGroupMangaPosts}
              aria-pressed={groupMangaPosts}
              aria-label={groupMangaPosts ? '關閉組圖模式' : '開啟組圖模式'}
              variant={groupMangaPosts ? 'primary' : 'secondary'}
              className={`header-action header-action-labeled ${groupMangaPosts ? 'is-active' : ''}`}
              title="切換組圖模式"
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">{groupMangaPosts ? '組圖模式（開）' : '組圖模式'}</span>
            </Button>
          )}

          {onToggleBlur && (
            <Button
              type="button"
              onClick={onToggleBlur}
              aria-pressed={blurEnabled}
              aria-label={blurEnabled ? '關閉模糊遮罩' : '開啟模糊遮罩'}
              variant={blurEnabled ? 'primary' : 'secondary'}
              className={`header-action header-action-labeled ${blurEnabled ? 'is-active' : ''}`}
              title={blurEnabled ? '關閉模糊遮罩' : '開啟模糊遮罩'}
            >
              {blurEnabled ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden md:inline">{blurEnabled ? '模糊遮罩（開）' : '模糊遮罩'}</span>
            </Button>
          )}

          {viewMode !== 'webtoon' && (
            <Button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              aria-pressed={isEditMode}
              aria-label={isEditMode ? '結束編輯模式' : '開啟編輯模式'}
              variant={isEditMode ? 'primary' : 'secondary'}
              className={`header-action header-action-labeled ${isEditMode ? 'is-active' : ''}`}
              title="切換編輯模式 (E)"
            >
              <CheckSquare className="h-4 w-4" aria-hidden="true" />
              <span>{isEditMode ? '編輯中' : '編輯模式'}</span>
              <kbd className="header-shortcut">E</kbd>
            </Button>
          )}
        </div>

        <div className="app-header__utility-actions">
          <IconButton
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            variant="ghost"
            aria-label={theme === 'dark' ? '切換至亮色模式' : '切換至暗色模式'}
            aria-pressed={theme === 'light'}
            className="header-action header-action-icon"
            title={theme === 'dark' ? '切換至亮色模式' : '切換至暗色模式'}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
          </IconButton>

          <IconButton
            type="button"
            onClick={onOpenSettings}
            variant="ghost"
            aria-label="開啟設定"
            className="header-action header-action-icon"
            title="開啟設定"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>
        </div>
      </div>
    </header>
  );
};
