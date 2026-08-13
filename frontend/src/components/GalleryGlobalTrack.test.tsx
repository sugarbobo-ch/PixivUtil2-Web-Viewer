import React from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GalleryGlobalTrack } from './GalleryGlobalTrack';
import { buildGlobalGalleryLayoutIndex } from '../media-window/globalLayoutIndex';
import type { MediaSlot, MediaWindowController, MediaWindowSnapshot } from '../media-window';
import type { ImageItem } from '../types';

const makeImage = (index: number): ImageItem => ({
  image_id: index + 1,
  member_id: 1,
  title: `Image ${index + 1}`,
  save_name: `image-${index + 1}.jpg`,
  created_date: '2026-08-01',
  last_update_date: '2026-08-01',
});

const makeSnapshot = (total: number, readyCount: number): MediaWindowSnapshot => {
  const slots = new Map<number, MediaSlot>();
  for (let index = 0; index < readyCount; index += 1) {
    slots.set(index, { index, status: 'ready', item: makeImage(index) });
  }
  return {
    revision: 'test-revision',
    total,
    months: [{ key: '2026-08', label: '2026-08', offset: 0, imageCount: total, cardCount: total }],
    get: index => slots.get(index) ?? { index, status: 'unloaded' },
    getPlaceholderColor: index => index === 0 ? '#123456' : undefined,
    getLoaded: range => Array.from(slots.values()).filter(slot => (
      !range || (slot.index >= range.start && slot.index < range.end)
    )),
    isRangeReady: range => Array.from({ length: Math.max(0, range.end - range.start) }, (_, offset) => range.start + offset)
      .every(index => slots.get(index)?.status === 'ready'),
  };
};

const makeController = (): MediaWindowController => ({
  getSnapshot: () => makeSnapshot(12, 0),
  subscribe: () => () => undefined,
  ensure: vi.fn(async () => undefined),
  pin: vi.fn(() => () => undefined),
  reset: vi.fn(),
});

describe('GalleryGlobalTrack', () => {
  it('keeps loaded cards on placeholders while MonthQuickNav is moving', async () => {
    const containerRef = React.createRef<HTMLDivElement>();
    const layout = buildGlobalGalleryLayoutIndex([
      { key: '2026-08', label: '2026-08', offset: 0, imageCount: 3, cardCount: 3 },
    ], {
      columns: 3,
      cardSize: 120,
      rowGap: 8,
      headerHeight: 40,
      contentGap: 12,
    });

    const { container } = render(
      <div ref={containerRef} data-gallery-scroll-container="true">
        <GalleryGlobalTrack
          mediaWindow={makeController()}
          snapshot={makeSnapshot(3, 3)}
          layout={layout}
          thumbnailSize={320}
          groupMangaPosts={false}
          isEditMode={false}
          selectedIds={new Set()}
          onSetSelection={vi.fn()}
          onOpenFullscreen={vi.fn()}
          blurEnabled={false}
          demoMode={false}
          navigationMode="scrubbing-preview"
          scrollContainerRef={containerRef}
        />
      </div>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelectorAll('.gallery-thumbnail img')).toHaveLength(0);
    expect(container.querySelectorAll('.gallery-thumbnail')).toHaveLength(3);
  });

  it('keeps skeleton geometry bounded to the visible row window', () => {
    const containerRef = React.createRef<HTMLDivElement>();
    const layout = buildGlobalGalleryLayoutIndex([
      { key: '2026-08', label: '2026-08', offset: 0, imageCount: 12, cardCount: 12 },
    ], {
      columns: 3,
      cardSize: 120,
      rowGap: 8,
      headerHeight: 40,
      sectionGap: 16,
    });

    const { container } = render(
      <div ref={containerRef} data-gallery-scroll-container="true">
        <GalleryGlobalTrack
          mediaWindow={makeController()}
          snapshot={makeSnapshot(12, 0)}
          layout={layout}
          thumbnailSize={320}
          groupMangaPosts={false}
          isEditMode={false}
          selectedIds={new Set()}
          onSetSelection={vi.fn()}
          onOpenFullscreen={vi.fn()}
          blurEnabled={false}
          demoMode
          scrollContainerRef={containerRef}
        />
      </div>,
    );

    const skeletons = container.querySelectorAll('.gallery-global-card-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.length).toBeLessThanOrEqual(12);
    expect(container.querySelector('.gallery-global-track')?.getAttribute('data-global-total')).toBe('12');
    expect((container.querySelector('.gallery-global-track__grid') as HTMLElement | null)?.style.insetInline).toBe('0px');
    expect(container.querySelector('.gallery-global-card-placeholder.has-dominant-color')).not.toBeNull();
  });

  it('keeps the grid gap inside the fixed month section bounds', () => {
    const containerRef = React.createRef<HTMLDivElement>();
    const layout = buildGlobalGalleryLayoutIndex([
      { key: '2026-08', label: '2026-08', offset: 0, imageCount: 3, cardCount: 3 },
    ], {
      columns: 3,
      cardSize: 120,
      rowGap: 8,
      headerHeight: 40,
      contentGap: 12,
    });

    const { container } = render(
      <div ref={containerRef} data-gallery-scroll-container="true">
        <GalleryGlobalTrack
          mediaWindow={makeController()}
          snapshot={makeSnapshot(3, 0)}
          layout={layout}
          thumbnailSize={320}
          groupMangaPosts={false}
          isEditMode={false}
          selectedIds={new Set()}
          onSetSelection={vi.fn()}
          onOpenFullscreen={vi.fn()}
          blurEnabled={false}
          demoMode
          scrollContainerRef={containerRef}
        />
      </div>,
    );

    const section = container.querySelector<HTMLElement>('.gallery-global-track__month');
    const gridShell = container.querySelector<HTMLElement>('.gallery-global-track__grid-shell');
    expect(section?.style.height).toBe('172px');
    expect(gridShell?.style.height).toBe('120px');
    expect(gridShell?.style.marginBlockStart).toBe('12px');
  });
});
