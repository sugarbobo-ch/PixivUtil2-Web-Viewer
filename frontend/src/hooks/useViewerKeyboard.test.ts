import { fireEvent, render } from '@testing-library/react';
import React, { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useViewerKeyboard } from './useViewerKeyboard';

const item = {
  image_id: 1,
  member_id: 2,
  title: 'Keyboard test',
  save_name: 'artist/work.jpg',
  created_date: '2026-08-12',
  last_update_date: '2026-08-12',
};

const Harness: React.FC<{
  viewerRef: React.RefObject<HTMLElement | null>;
  callbacks: Record<string, any>;
}> = ({ viewerRef, callbacks }) => {
  useViewerKeyboard({
    viewerRef,
    currentItem: item,
    imagesLength: 3,
    transformReady: true,
    showShortcutHelp: false,
    isMobileToolbarOpen: false,
    zoomModeShortcuts: [{ mode: 'fit', key: '5', code: 'Digit5' }],
    onClose: callbacks.close,
    onNavigate: callbacks.navigate,
    onDeleteCurrent: callbacks.deleteCurrent,
    onNext: callbacks.next,
    onPrevious: callbacks.previous,
    onArrowRight: callbacks.arrowRight,
    onArrowLeft: callbacks.arrowLeft,
    onToggleShortcutHelp: callbacks.toggleHelp,
    onCloseShortcutHelp: callbacks.closeHelp,
    onCloseMobileToolbar: callbacks.closeMobile,
    onApplyZoomMode: callbacks.applyZoom,
    onZoomIn: callbacks.zoomIn,
    onZoomOut: callbacks.zoomOut,
    onShowActualSize: callbacks.actualSize,
    onFitToViewer: callbacks.fit,
    onRotate: callbacks.rotate,
    onToggleFlipHorizontal: callbacks.flipHorizontal,
    onToggleFlipVertical: callbacks.flipVertical,
    onToggleDetails: callbacks.details,
    onToggleToolbar: callbacks.toolbar,
    onToggleFilmstrip: callbacks.filmstrip,
    onReloadMedia: callbacks.reload,
    onToggleCheckerboard: callbacks.checkerboard,
    onToggleBrowserFullscreen: callbacks.browserFullscreen,
    onToggleSlideshow: callbacks.slideshow,
    onToggleVideoPlayback: callbacks.video,
  });
  return React.createElement('div', { ref: viewerRef, tabIndex: -1 });
};

describe('useViewerKeyboard', () => {
  it('routes navigation and viewer shortcuts while the dialog owns focus', () => {
    const viewerRef = createRef<HTMLElement>();
    const callbacks = Object.fromEntries([
      'close', 'navigate', 'deleteCurrent', 'next', 'previous', 'toggleHelp', 'closeHelp',
      'closeMobile', 'applyZoom', 'zoomIn', 'zoomOut', 'actualSize', 'fit', 'rotate',
      'flipHorizontal', 'flipVertical', 'details', 'toolbar', 'filmstrip', 'reload',
      'checkerboard', 'browserFullscreen', 'slideshow', 'video',
    ].map(name => [name, vi.fn()])) as Record<string, any>;
    const view = render(React.createElement(Harness, { viewerRef, callbacks }));

    fireEvent.keyDown(view.container.firstChild!, { key: 'ArrowRight' });
    fireEvent.keyDown(view.container.firstChild!, { key: '5' });
    fireEvent.keyDown(view.container.firstChild!, { key: 'Delete' });

    expect(callbacks.next).toHaveBeenCalledTimes(1);
    expect(callbacks.applyZoom).toHaveBeenCalledWith('fit');
    expect(callbacks.deleteCurrent).toHaveBeenCalledWith(1);
  });

  it('does not consume native interactive control keys', () => {
    const viewerRef = createRef<HTMLElement>();
    const callbacks = Object.fromEntries([
      'close', 'navigate', 'deleteCurrent', 'next', 'previous', 'toggleHelp', 'closeHelp',
      'closeMobile', 'applyZoom', 'zoomIn', 'zoomOut', 'actualSize', 'fit', 'rotate',
      'flipHorizontal', 'flipVertical', 'details', 'toolbar', 'filmstrip', 'reload',
      'checkerboard', 'browserFullscreen', 'slideshow', 'video',
    ].map(name => [name, vi.fn()])) as Record<string, any>;
    const view = render(React.createElement(Harness, { viewerRef, callbacks }));
    const input = document.createElement('input');
    view.container.firstChild?.appendChild(input);

    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(callbacks.next).not.toHaveBeenCalled();
    expect(callbacks.previous).not.toHaveBeenCalled();
  });

  it('keeps viewer shortcuts available from action-button focus while preserving Space activation', () => {
    const viewerRef = createRef<HTMLElement>();
    const callbacks = Object.fromEntries([
      'close', 'navigate', 'deleteCurrent', 'next', 'previous', 'toggleHelp', 'closeHelp',
      'closeMobile', 'applyZoom', 'zoomIn', 'zoomOut', 'actualSize', 'fit', 'rotate',
      'flipHorizontal', 'flipVertical', 'details', 'toolbar', 'filmstrip', 'reload',
      'checkerboard', 'browserFullscreen', 'slideshow', 'video',
    ].map(name => [name, vi.fn()])) as Record<string, any>;
    const view = render(React.createElement(Harness, { viewerRef, callbacks }));
    const button = document.createElement('button');
    view.container.firstChild?.appendChild(button);

    fireEvent.keyDown(button, { key: 'ArrowRight' });
    fireEvent.keyDown(button, { key: 't' });
    fireEvent.keyDown(button, { key: ' ', code: 'Space' });

    expect(callbacks.next).toHaveBeenCalledTimes(1);
    expect(callbacks.toolbar).toHaveBeenCalledTimes(1);
    expect(callbacks.video).not.toHaveBeenCalled();
  });

  it('routes arrow navigation from a focused video when the reader supplies arrow handlers', () => {
    const viewerRef = createRef<HTMLElement>();
    const callbacks = Object.fromEntries([
      'close', 'navigate', 'deleteCurrent', 'next', 'previous', 'arrowRight', 'arrowLeft', 'toggleHelp', 'closeHelp',
      'closeMobile', 'applyZoom', 'zoomIn', 'zoomOut', 'actualSize', 'fit', 'rotate',
      'flipHorizontal', 'flipVertical', 'details', 'toolbar', 'filmstrip', 'reload',
      'checkerboard', 'browserFullscreen', 'slideshow', 'video',
    ].map(name => [name, vi.fn()])) as Record<string, any>;
    const view = render(React.createElement(Harness, { viewerRef, callbacks }));
    const video = document.createElement('video');
    view.container.firstChild?.appendChild(video);

    fireEvent.keyDown(video, { key: 'ArrowRight' });
    fireEvent.keyDown(video, { key: 'ArrowLeft' });

    expect(callbacks.arrowRight).toHaveBeenCalledTimes(1);
    expect(callbacks.arrowLeft).toHaveBeenCalledTimes(1);
    expect(callbacks.next).not.toHaveBeenCalled();
    expect(callbacks.previous).not.toHaveBeenCalled();
  });
});
