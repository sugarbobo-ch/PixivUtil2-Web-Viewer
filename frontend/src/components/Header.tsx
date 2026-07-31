import React from 'react';
import { 
  Grid, 
  Maximize2, 
  ScrollText, 
  Sun, 
  Moon, 
  CheckSquare, 
  Search, 
  SlidersHorizontal,
  Settings
} from 'lucide-react';
import { ViewMode, ThemeMode } from '../types';

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
  totalCount: number;
  onOpenSettings: () => void;
}

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
  totalCount,
  onOpenSettings
}) => {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-zinc-900/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 text-zinc-100 transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          aria-label="開啟選單"
          className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300 transition-colors"
          title="開啟/收折側邊欄"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            PixivUtil2 Gallery
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
            {totalCount} 作品
          </span>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative flex-1 max-w-md mx-4">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜尋標題或繪師名稱..."
          className="w-full pl-9 pr-4 py-1.5 text-sm bg-zinc-800/80 border border-zinc-700/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-zinc-100 placeholder-zinc-500 transition-all"
        />
      </div>

      {/* Control Buttons */}
      <div className="flex items-center gap-2">
        {/* View Mode Switcher */}
        <div className="flex items-center p-1 bg-zinc-800/90 rounded-lg border border-zinc-700/50">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
              viewMode === 'grid'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="網格瀑布流"
          >
            <Grid className="w-4 h-4" />
            <span className="hidden sm:inline">網格</span>
          </button>
          <button
            onClick={() => setViewMode('fullscreen')}
            className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
              viewMode === 'fullscreen'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="滾輪翻頁模式 (Wheel Flip)"
          >
            <Maximize2 className="w-4 h-4" />
            <span className="hidden sm:inline">滾輪翻頁</span>
          </button>
          <button
            onClick={() => setViewMode('webtoon')}
            className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
              viewMode === 'webtoon'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="條漫垂直連貫模式 (Webtoon Strip)"
          >
            <ScrollText className="w-4 h-4" />
            <span className="hidden sm:inline">條漫連畫</span>
          </button>
        </div>

        {/* Edit Mode Toggle */}
        <button
          onClick={() => setIsEditMode(!isEditMode)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
            isEditMode
              ? 'bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-900/40 animate-pulse'
              : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
          }`}
          title="切換批次編輯模式 (快捷鍵 E)"
        >
          <CheckSquare className="w-4 h-4" />
          <span>{isEditMode ? '結束編輯' : '編輯模式 (E)'}</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors"
          title="切換深色/淺色主題"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Settings Toggle */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors"
          title="系統與目錄設定"
        >
          <Settings className="w-4 h-4 text-indigo-400" />
        </button>
      </div>
    </header>
  );
};
