import React, { useState } from 'react';
import { ImageItem } from '../types';
import { Check, Film, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Calendar, ArrowUpDown } from 'lucide-react';

interface GalleryGridProps {
  images: ImageItem[];
  totalImages: number;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (num: number) => void;
  sortMode: 'newest_month' | 'oldest_month' | 'oldest' | 'natural_name';
  onSortModeChange: (mode: 'newest_month' | 'oldest_month' | 'oldest' | 'natural_name') => void;
  isEditMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (imageId: number) => void;
  onOpenFullscreen: (index: number) => void;
}

export const GalleryGrid: React.FC<GalleryGridProps> = ({
  images,
  totalImages,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  sortMode,
  onSortModeChange,
  isEditMode,
  selectedIds,
  onToggleSelect,
  onOpenFullscreen,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalImages / itemsPerPage));
  const startOffset = (currentPage - 1) * itemsPerPage;
  const endOffset = Math.min(startOffset + images.length, totalImages);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
        <p className="text-base font-medium">沒有找到相符的作品</p>
        <p className="text-xs mt-1">請嘗試變更篩選條件或搜尋關鍵字</p>
      </div>
    );
  }

  const normalizeMonthKey = (dateStr: string | undefined): { key: string; label: string } => {
    if (!dateStr) return { key: '未指定月份', label: '未指定月份' };
    const str = dateStr.trim();
    const matchHyphen = str.match(/^(\d{4})[\-/](\d{1,2})/);
    if (matchHyphen) {
      const y = matchHyphen[1];
      const m = matchHyphen[2].padStart(2, '0');
      return { key: `${y}-${m}`, label: `${y} 年 ${m} 月` };
    }
    const matchDigits = str.match(/^(\d{4})(\d{2})/);
    if (matchDigits) {
      const y = matchDigits[1];
      const m = matchDigits[2];
      return { key: `${y}-${m}`, label: `${y} 年 ${m} 月` };
    }
    return { key: '未指定月份', label: '未指定月份' };
  };

  // Group images by Month
  const groupedByMonth: Record<string, { label: string; items: { item: ImageItem; globalIndex: number }[] }> = {};

  images.forEach((item, globalIndex) => {
    const { key: monthKey, label: monthLabel } = normalizeMonthKey(item.created_date);
    if (!groupedByMonth[monthKey]) {
      groupedByMonth[monthKey] = { label: monthLabel, items: [] };
    }
    groupedByMonth[monthKey].items.push({ item, globalIndex });
  });

  const monthKeys = Object.keys(groupedByMonth);
  if (sortMode === 'oldest' || sortMode === 'oldest_month') {
    monthKeys.sort((a, b) => a.localeCompare(b));
  } else if (sortMode === 'natural_name') {
    monthKeys.sort((a, b) => a.localeCompare(b));
  } else {
    monthKeys.sort((a, b) => b.localeCompare(a));
  }

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxButtons = 7;
    if (totalPages <= maxButtons) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      {/* iOS-Style Quick Month Index Bar & Sort Mode Control */}
      <div className="sticky top-[57px] z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-800/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 select-none">
        {/* Month Quick Jump Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 max-w-full">
          <span className="text-xs font-semibold text-zinc-400 whitespace-nowrap flex items-center gap-1 mr-1">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" /> 月份索引:
          </span>
          {monthKeys.map(mKey => (
            <button
              key={mKey}
              onClick={() => {
                const el = document.getElementById(`month-section-${mKey}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-900 hover:bg-indigo-600 hover:text-white border border-zinc-800 text-zinc-300 transition-all whitespace-nowrap shadow-xs"
            >
              {mKey} ({groupedByMonth[mKey].items.length})
            </button>
          ))}
        </div>

        {/* Sort Mode Dropdown Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-medium text-zinc-400">排序:</span>
          <select
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value as any)}
            className="px-2.5 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="newest_month">最新月份 (月份新到舊，作品正序 1-1 -&gt; 1-10)</option>
            <option value="oldest_month">舊月份在前 (月份舊到新，作品正序 1-1 -&gt; 1-10)</option>
            <option value="oldest">舊作品在前 (時間與作品舊到新)</option>
            <option value="natural_name">檔名自然排序 (1-1, 1-2 ... 1-10)</option>
          </select>
        </div>
      </div>

      {/* Main Grid View - Grouped by Month Sections */}
      <div className="p-4 space-y-6">
        {monthKeys.map(mKey => {
          const group = groupedByMonth[mKey];
          return (
            <div key={mKey} id={`month-section-${mKey}`} className="space-y-3 scroll-mt-28">
              {/* Sticky Month Section Header */}
              <div className="sticky top-[108px] z-10 py-2 px-3.5 bg-zinc-900/90 backdrop-blur border border-zinc-800/80 rounded-xl flex items-center justify-between shadow-md">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <span>{group.label}</span>
                </div>
                <span className="text-[11px] font-medium text-zinc-400">
                  此月份共有 {group.items.length} 張作品
                </span>
              </div>

              {/* Artwork Cards Grid for this Month */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {group.items.map(({ item, globalIndex }) => {
                  const isSelected = selectedIds.has(item.image_id);
                  const isVideo = item.save_name.toLowerCase().endsWith('.mp4');

                  return (
                    <div
                      key={item.image_id}
                      onClick={() => {
                        if (isEditMode) {
                          onToggleSelect(item.image_id);
                        } else {
                          onOpenFullscreen(globalIndex);
                        }
                      }}
                      className={`group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border transition-all duration-200 cursor-pointer select-none ${
                        isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-500 ring-offset-2 ring-offset-zinc-950 scale-[0.98]'
                          : 'border-zinc-800 hover:border-zinc-700 hover:shadow-lg hover:shadow-indigo-500/10'
                      }`}
                    >
                      {/* Thumbnail Image */}
                      <img
                        src={`/api/thumbnail?path=${encodeURIComponent(item.save_name || '')}&image_id=${item.image_id}`}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />

                      {/* Video Badge */}
                      {isVideo && (
                        <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white">
                          <Film className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Selection Checkbox (Edit Mode) */}
                      {isEditMode && (
                        <div className="absolute top-2 left-2 z-10">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-black/40 border border-white/40 text-transparent hover:border-white'
                            }`}
                          >
                            <Check className="w-4 h-4" />
                          </div>
                        </div>
                      )}

                      {/* Gradient Overlay & Metadata Title */}
                      <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs font-medium text-white truncate">{item.title || '無題'}</p>
                        <p className="text-[10px] text-zinc-400 truncate">{item.artist_name || `繪師 ID: ${item.member_id}`}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-zinc-800 text-xs text-zinc-400">
          <div>
            顯示第 <span className="font-semibold text-zinc-200">{startOffset + 1}</span> - <span className="font-semibold text-zinc-200">{endOffset}</span> 張，共 <span className="font-semibold text-indigo-400">{totalImages}</span> 張作品
          </div>

          {/* Page Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900"
              title="第一頁"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900 flex items-center gap-1 px-2.5"
            >
              <ChevronLeft className="w-4 h-4" /> 上一頁
            </button>

            {getPageNumbers().map((p, idx) => {
              if (typeof p === 'string') {
                return <span key={idx} className="px-2 text-zinc-500">...</span>;
              }
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                    currentPage === p
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {p}
                </button>
              );
            })}

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900 flex items-center gap-1 px-2.5"
            >
              下一頁 <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900"
              title="最後一頁"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>

          {/* Per-Page Selector */}
          <div className="flex items-center gap-2">
            <span>每頁顯示:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                onItemsPerPageChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-indigo-500"
            >
              <option value={100}>100 張</option>
              <option value={200}>200 張</option>
              <option value={500}>500 張</option>
              <option value={1000}>1000 張</option>
              <option value={5000}>全部 (5000)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
