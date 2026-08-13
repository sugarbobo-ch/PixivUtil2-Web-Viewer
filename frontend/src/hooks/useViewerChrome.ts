import { useCallback, useEffect, useRef, useState } from 'react';

interface UseViewerChromeOptions {
  showToolbarByDefault: boolean;
  onShowToolbarChange?: (showToolbar: boolean) => void;
  showFilmstripByDefault: boolean;
  onShowFilmstripChange?: (showFilmstrip: boolean) => void;
  fullscreenShowCheckerboard: boolean;
  onCheckerboardChange?: (enabled: boolean) => void;
}

export const useViewerChrome = ({
  showToolbarByDefault,
  onShowToolbarChange,
  showFilmstripByDefault,
  onShowFilmstripChange,
  fullscreenShowCheckerboard,
  onCheckerboardChange,
}: UseViewerChromeOptions) => {
  const [showToolbar, setShowToolbar] = useState(showToolbarByDefault);
  const [showFilmstrip, setShowFilmstrip] = useState(showFilmstripByDefault);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [isMobileToolbarOpen, setIsMobileToolbarOpen] = useState(false);
  const [checkerboardEnabled, setCheckerboardEnabled] = useState(fullscreenShowCheckerboard);
  const viewerRef = useRef<HTMLDivElement>(null);
  const toolbarRestoreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileToolbarToggleRef = useRef<HTMLButtonElement>(null);
  const mobileToolbarMenuRef = useRef<HTMLDivElement>(null);
  const mobileToolbarWasOpenRef = useRef(false);

  useEffect(() => {
    setShowToolbar(showToolbarByDefault);
  }, [showToolbarByDefault]);

  useEffect(() => {
    setShowFilmstrip(showFilmstripByDefault);
  }, [showFilmstripByDefault]);

  useEffect(() => {
    setCheckerboardEnabled(fullscreenShowCheckerboard);
  }, [fullscreenShowCheckerboard]);

  useEffect(() => {
    if (!isMobileToolbarOpen) {
      if (mobileToolbarWasOpenRef.current) {
        mobileToolbarWasOpenRef.current = false;
        mobileToolbarToggleRef.current?.focus({ preventScroll: true });
      }
      return undefined;
    }

    mobileToolbarWasOpenRef.current = true;
    const focusFrame = window.requestAnimationFrame(() => {
      const buttons = mobileToolbarMenuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const firstVisibleButton = Array.from(buttons ?? []).find(button => button.getClientRects().length > 0);
      firstVisibleButton?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [isMobileToolbarOpen]);

  useEffect(() => {
    if (!isMobileToolbarOpen) return undefined;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.fullscreen-viewer__mobile-toolbar-toggle, #fullscreen-mobile-toolbar')) return;
      setIsMobileToolbarOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  }, [isMobileToolbarOpen]);

  const handleShowToolbarChange = useCallback((nextValue: boolean) => {
    if (showToolbar === nextValue) return;
    setShowToolbar(nextValue);
    onShowToolbarChange?.(nextValue);
  }, [onShowToolbarChange, showToolbar]);

  const handleShowFilmstripChange = useCallback((nextValue: boolean) => {
    if (showFilmstrip === nextValue) return;
    setShowFilmstrip(nextValue);
    onShowFilmstripChange?.(nextValue);
  }, [onShowFilmstripChange, showFilmstrip]);

  const handleCheckerboardChange = useCallback((nextValue: boolean) => {
    if (checkerboardEnabled === nextValue) return;
    setCheckerboardEnabled(nextValue);
    onCheckerboardChange?.(nextValue);
  }, [checkerboardEnabled, onCheckerboardChange]);

  const toggleShowToolbar = useCallback(() => {
    handleShowToolbarChange(!showToolbar);
  }, [handleShowToolbarChange, showToolbar]);

  const toggleShowFilmstrip = useCallback(() => {
    handleShowFilmstripChange(!showFilmstrip);
  }, [handleShowFilmstripChange, showFilmstrip]);

  const toggleCheckerboard = useCallback(() => {
    handleCheckerboardChange(!checkerboardEnabled);
  }, [checkerboardEnabled, handleCheckerboardChange]);

  const showToolbarAgain = useCallback(() => {
    handleShowToolbarChange(true);
  }, [handleShowToolbarChange]);

  return {
    viewerRef,
    toolbarRestoreButtonRef,
    mobileToolbarToggleRef,
    mobileToolbarMenuRef,
    showToolbar,
    showFilmstrip,
    showShortcutHelp,
    isMobileToolbarOpen,
    checkerboardEnabled,
    setShowShortcutHelp,
    setIsMobileToolbarOpen,
    handleShowToolbarChange,
    handleShowFilmstripChange,
    handleCheckerboardChange,
    toggleShowToolbar,
    toggleShowFilmstrip,
    toggleCheckerboard,
    showToolbarAgain,
  };
};
