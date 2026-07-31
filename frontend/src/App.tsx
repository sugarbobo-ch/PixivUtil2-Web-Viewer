import React, { useState, useEffect, useCallback } from 'react';
import { Artist, MonthItem, ImageItem, ViewMode, ThemeMode } from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { GalleryGrid } from './components/GalleryGrid';
import { FullscreenViewer } from './components/FullscreenViewer';
import { WebtoonFeed } from './components/WebtoonFeed';
import { BatchEditToolbar } from './components/BatchEditToolbar';
import { ConfirmModal } from './components/ConfirmModal';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);

  // Data States
  const [artists, setArtists] = useState<Artist[]>([]);
  const [months, setMonths] = useState<MonthItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);

  // Filter States
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Selection & Modal States
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<number[]>([]);

  // Sync Theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Fetch Artists & Months
  useEffect(() => {
    fetch('/api/artists')
      .then(res => res.json())
      .then(data => setArtists(data))
      .catch(err => console.error('Failed to fetch artists:', err));

    fetch('/api/months')
      .then(res => res.json())
      .then(data => setMonths(data))
      .catch(err => console.error('Failed to fetch months:', err));
  }, []);

  // Fetch Images based on Filters
  const fetchImages = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedMonth) params.append('month', selectedMonth);
    if (selectedArtist) params.append('artist_id', selectedArtist.toString());
    if (searchQuery) params.append('search', searchQuery);

    fetch(`/api/images?${params.toString()}`)
      .then(res => res.json())
      .then(data => setImages(data))
      .catch(err => console.error('Failed to fetch images:', err));
  }, [selectedMonth, selectedArtist, searchQuery]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // Handle Edit Mode Toggle & Keyboard E Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'e' || e.key === 'E') {
        setIsEditMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Multi-select handlers
  const toggleSelectImage = (imageId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  };

  const handleSelectAll = () => {
    const all = new Set(images.map(img => img.image_id));
    setSelectedIds(all);
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Delete Actions
  const promptDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setDeleteTargets(Array.from(selectedIds));
    setShowConfirmModal(true);
  };

  const promptDeleteSingle = (imageId: number) => {
    setDeleteTargets([imageId]);
    setShowConfirmModal(true);
  };

  const confirmExecuteDelete = async () => {
    if (!deleteTargets.length) return;
    try {
      const res = await fetch('/api/images/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_ids: deleteTargets }),
      });
      const data = await res.json();
      console.log('Batch delete output:', data);

      // Refresh list and clear selection
      fetchImages();
      setSelectedIds(prev => {
        const next = new Set(prev);
        deleteTargets.forEach(id => next.delete(id));
        return next;
      });
      setShowConfirmModal(false);
      setDeleteTargets([]);
      if (fullscreenIndex !== null && deleteTargets.includes(images[fullscreenIndex]?.image_id)) {
        setFullscreenIndex(null);
      }
    } catch (err) {
      console.error('Failed to execute delete:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 transition-colors">
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        theme={theme}
        setTheme={setTheme}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        totalCount={images.length}
      />

      <div className="flex flex-1">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          months={months}
          artists={artists}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedArtist={selectedArtist}
          setSelectedArtist={setSelectedArtist}
        />

        <main className="flex-1 min-w-0">
          {viewMode === 'grid' && (
            <GalleryGrid
              images={images}
              isEditMode={isEditMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelectImage}
              onOpenFullscreen={(idx) => setFullscreenIndex(idx)}
            />
          )}

          {viewMode === 'webtoon' && (
            <WebtoonFeed images={images} />
          )}

          {viewMode === 'fullscreen' && images.length > 0 && (
            <FullscreenViewer
              images={images}
              currentIndex={fullscreenIndex ?? 0}
              onClose={() => setViewMode('grid')}
              onNavigate={(idx) => setFullscreenIndex(idx)}
              onDeleteCurrent={promptDeleteSingle}
            />
          )}
        </main>
      </div>

      {/* Modal Fullscreen Overlay when clicked from Grid */}
      {viewMode === 'grid' && fullscreenIndex !== null && (
        <FullscreenViewer
          images={images}
          currentIndex={fullscreenIndex}
          onClose={() => setFullscreenIndex(null)}
          onNavigate={(idx) => setFullscreenIndex(idx)}
          onDeleteCurrent={promptDeleteSingle}
        />
      )}

      {/* Batch Edit Toolbar */}
      {isEditMode && (
        <BatchEditToolbar
          selectedCount={selectedIds.size}
          totalCount={images.length}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onDeleteSelected={promptDeleteSelected}
          onCancel={() => setIsEditMode(false)}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        title="確認永久刪除作品？"
        message={`確定要永久刪除選取的 ${deleteTargets.length} 項作品嗎？該操作將會同時刪除本機實體檔案並自資料庫中移除紀錄，此步驟無法復原。`}
        confirmLabel="永久刪除"
        cancelLabel="取消"
        onConfirm={confirmExecuteDelete}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
  );
};

export default App;
