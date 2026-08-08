import React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
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
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="切換側邊欄"
          aria-expanded={isSidebarOpen}
          aria-controls="gallery-filter-sidebar"
          className="app-header__desktop-sidebar-trigger header-action header-action-icon"
          title="顯示或隱藏側邊欄"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={toggleMenu}
          aria-label="切換功能選單"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu-drawer"
          className="app-header__mobile-menu-trigger header-action header-action-icon"
          title="開啟功能選單"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="app-header__identity">
          <span className="header-logo">PixivUtil2 Gallery</span>
          <span className="header-count">{totalCount} 作品</span>
        </div>
        {isLibraryJobActive(libraryJob) && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="header-library-status header-action"
            aria-label={`媒體資料庫工作：${getLibraryJobLabel(libraryJob!)}`}
            title="查看媒體資料庫工作進度"
          >
            <RefreshCw className="header-library-status__icon" aria-hidden="true" />
            <span className="header-library-status__label">{getLibraryJobLabel(libraryJob!)}</span>
          </button>
        )}
      </div>

      <button
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
      </button>

      <div id="header-search" className="app-header__search">
        <Search className="header-search-icon" aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="搜尋標題或繪師名稱"
          placeholder="搜尋標題或繪師名稱..."
          className="header-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="清除搜尋"
            className="header-clear-button"
            title="清除搜尋"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="app-header__desktop-actions">
        <div className="app-header__controls">
        <div className="header-mode-group" role="group" aria-label="檢視模式">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            aria-label="網格檢視"
            className={`header-mode-button ${viewMode === 'grid' ? 'is-active' : ''}`}
            title="網格檢視"
          >
            <Grid className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">網格</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('fullscreen')}
            aria-pressed={viewMode === 'fullscreen'}
            aria-label="全螢幕檢視"
            className={`header-mode-button ${viewMode === 'fullscreen' ? 'is-active' : ''}`}
            title="全螢幕檢視"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">全螢幕</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('webtoon')}
            aria-pressed={viewMode === 'webtoon'}
            aria-label="條漫檢視"
            className={`header-mode-button ${viewMode === 'webtoon' ? 'is-active' : ''}`}
            title="條漫檢視"
          >
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">條漫</span>
          </button>
        </div>
      </div>

        <div
          id="header-mobile-tools"
        className="app-header__mobile-tools"
        aria-label="更多工具"
      >
        <div className="app-header__mode-actions">
          {onToggleGroupMangaPosts && (
            <button
              type="button"
              onClick={onToggleGroupMangaPosts}
              aria-pressed={groupMangaPosts}
              aria-label={groupMangaPosts ? '關閉組圖模式' : '開啟組圖模式'}
              className={`header-action header-action-labeled ${groupMangaPosts ? 'is-active' : ''}`}
              title="切換組圖模式"
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">{groupMangaPosts ? '組圖模式（開）' : '組圖模式'}</span>
            </button>
          )}

          {onToggleBlur && (
            <button
              type="button"
              onClick={onToggleBlur}
              aria-pressed={blurEnabled}
              aria-label={blurEnabled ? '關閉模糊遮罩' : '開啟模糊遮罩'}
              className={`header-action header-action-labeled ${blurEnabled ? 'is-active' : ''}`}
              title={blurEnabled ? '關閉模糊遮罩' : '開啟模糊遮罩'}
            >
              {blurEnabled ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden md:inline">{blurEnabled ? '模糊遮罩（開）' : '模糊遮罩'}</span>
            </button>
          )}

          {viewMode !== 'webtoon' && (
            <button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              aria-pressed={isEditMode}
              aria-label={isEditMode ? '結束編輯模式' : '開啟編輯模式'}
              className={`header-action header-action-labeled ${isEditMode ? 'is-danger' : ''}`}
              title="切換編輯模式 (E)"
            >
              <CheckSquare className="h-4 w-4" aria-hidden="true" />
              <span>{isEditMode ? '編輯中' : '編輯模式'}</span>
              <kbd className="header-shortcut">E</kbd>
            </button>
          )}
        </div>

        <div className="app-header__utility-actions">
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? '切換至亮色模式' : '切換至暗色模式'}
            aria-pressed={theme === 'light'}
            className="header-action header-action-icon"
            title={theme === 'dark' ? '切換至亮色模式' : '切換至暗色模式'}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="開啟設定"
            className="header-action header-action-icon"
            title="開啟設定"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        </div>
      </div>
    </header>
  );
};
