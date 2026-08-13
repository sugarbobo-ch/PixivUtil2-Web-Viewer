import { describe, expect, it } from 'vitest';
import {
  buildGlobalGalleryLayoutIndex,
  createGlobalHeightIndex,
  FenwickTree,
  getGalleryLayoutMetrics,
} from './globalLayoutIndex';

describe('global layout index', () => {
  it('keeps month geometry and card ranges stable for grouped and ungrouped layouts', () => {
    const index = buildGlobalGalleryLayoutIndex([
      { key: '2024-02', label: '2024/02', offset: 0, imageCount: 5, cardCount: 3 },
      { key: '2024-01', label: '2024/01', offset: 5, imageCount: 5, cardCount: 5 },
    ], {
      columns: 2,
      cardSize: 100,
      rowGap: 10,
      headerHeight: 40,
      sectionGap: 20,
    });

    expect(index.months.map(month => ({
      key: month.key,
      top: month.top,
      rows: month.rows,
      height: month.height,
    }))).toEqual([
      { key: '2024-02', top: 0, rows: 2, height: 250 },
      { key: '2024-01', top: 270, rows: 3, height: 360 },
    ]);
    expect(index.totalHeight).toBe(630);
    expect(index.getMonthTop('2024-01')).toBe(270);
    expect(index.getMonthAtOffset(260)?.key).toBe('2024-02');
    expect(index.getMonthAtOffset(280)?.key).toBe('2024-01');
    expect(index.getMonthForGlobalIndex(0)?.key).toBe('2024-02');
    expect(index.getMonthForGlobalIndex(9)?.key).toBe('2024-01');
    expect(index.getViewportRange(280, 430, 0)).toEqual({ start: 5, end: 9 });
  });

  it('uses the same card geometry for unloaded and ready slots', () => {
    const index = buildGlobalGalleryLayoutIndex([
      { key: 'month', label: 'Month', offset: 10, imageCount: 4, cardCount: 4 },
    ], {
      columns: 2,
      cardSize: 120,
      rowGap: 8,
      headerHeight: 32,
    });

    expect(index.months[0]).toMatchObject({ rows: 2, height: 280 });
    expect(index.getViewportRange(0, 1000, 1)).toEqual({ start: 10, end: 14 });
  });

  it('includes the header-to-grid gap in absolute month bounds', () => {
    const index = buildGlobalGalleryLayoutIndex([
      { key: 'month', label: 'Month', offset: 0, imageCount: 1, cardCount: 1 },
    ], {
      columns: 1,
      cardSize: 120,
      rowGap: 0,
      headerHeight: 40,
      contentGap: 12,
    });

    expect(index.metrics.contentGap).toBe(12);
    expect(index.months[0]).toMatchObject({ rows: 1, height: 172 });
    expect(index.totalHeight).toBe(172);
  });

  it('keeps the production content gap explicit across breakpoints', () => {
    expect(getGalleryLayoutMetrics(640, 0).contentGap).toBe(12);
    expect(getGalleryLayoutMetrics(1440, 320).contentGap).toBe(12);
  });
});

describe('global dense height index', () => {
  it('keeps prefix offsets queryable and returns anchor compensation', () => {
    const index = createGlobalHeightIndex(4, 100);

    expect(index.getOffset(2)).toBe(200);
    expect(index.getIndexAtOffset(0)).toBe(0);
    expect(index.getIndexAtOffset(199)).toBe(1);

    expect(index.updateMeasuredHeight(0, 140, 2)).toEqual({ deltaAboveAnchor: 40, changed: true });
    expect(index.getOffset(2)).toBe(240);
    expect(index.getIndexAtOffset(239)).toBe(1);
    expect(index.updateMeasuredHeight(0, 150, 2)).toEqual({ deltaAboveAnchor: 0, changed: false });
  });

  it('supports prefix sums for zero-length and edge offsets', () => {
    const tree = new FenwickTree([0, 5, 10]);

    expect(tree.total()).toBe(15);
    expect(tree.sum(2)).toBe(5);
    expect(tree.findIndexAtOffset(0)).toBe(1);
    expect(tree.findIndexAtOffset(15)).toBe(2);
  });
});
