import { describe, expect, it } from 'vitest';
import { calculateReaderSpreadLayout } from './readerSpreadLayout';

describe('calculateReaderSpreadLayout', () => {
  it('uses stage height for a pair of portrait pages and centers the narrower spread', () => {
    const layout = calculateReaderSpreadLayout(1152, 551, [
      { width: 1000, height: 1600 },
      { width: 1000, height: 1600 },
    ]);

    expect(layout).not.toBeNull();
    expect(layout?.width).toBeCloseTo(688.75);
    expect(layout?.height).toBeCloseTo(551);
    expect(layout?.slotWidths).toEqual([expect.closeTo(344.375), expect.closeTo(344.375)]);
    expect(layout?.slotHeights).toEqual([expect.closeTo(551), expect.closeTo(551)]);
  });

  it('uses stage width when the combined pages would otherwise overflow horizontally', () => {
    const layout = calculateReaderSpreadLayout(1152, 551, [
      { width: 2032, height: 1440 },
      { width: 2032, height: 1440 },
    ]);

    expect(layout).not.toBeNull();
    expect(layout?.width).toBeCloseTo(1152);
    expect(layout?.height).toBeCloseTo(1440 * (1152 / 4064));
    expect(layout?.slotWidths).toEqual([expect.closeTo(576), expect.closeTo(576)]);
    expect(layout?.slotHeights).toEqual([
      expect.closeTo(1440 * (1152 / 4064)),
      expect.closeTo(1440 * (1152 / 4064)),
    ]);
  });

  it('normalizes pages with the same aspect ratio but different source resolutions', () => {
    const layout = calculateReaderSpreadLayout(1152, 551, [
      { width: 1000, height: 1600 },
      { width: 500, height: 800 },
    ]);

    expect(layout).not.toBeNull();
    expect(layout?.width).toBeCloseTo(688.75);
    expect(layout?.height).toBeCloseTo(551);
    expect(layout?.slotWidths).toEqual([expect.closeTo(344.375), expect.closeTo(344.375)]);
    expect(layout?.slotHeights).toEqual([expect.closeTo(551), expect.closeTo(551)]);
  });

  it('keeps unequal aspect ratios at one page height without stretching either page', () => {
    const layout = calculateReaderSpreadLayout(600, 800, [
      { width: 1000, height: 1600 },
      { width: 1200, height: 1600 },
    ]);

    expect(layout).not.toBeNull();
    expect(layout?.width).toBeCloseTo(600);
    expect(layout?.height).toBeCloseTo(600 / 1.375);
    expect(layout?.slotWidths).toEqual([
      expect.closeTo(600 * (0.625 / 1.375)),
      expect.closeTo(600 * (0.75 / 1.375)),
    ]);
    expect(layout?.slotHeights).toEqual([
      expect.closeTo(600 / 1.375),
      expect.closeTo(600 / 1.375),
    ]);
  });

  it('waits until every page has a usable intrinsic size', () => {
    expect(calculateReaderSpreadLayout(1152, 551, [
      { width: 1000, height: 1600 },
      null,
    ])).toBeNull();
    expect(calculateReaderSpreadLayout(0, 551, [
      { width: 1000, height: 1600 },
      { width: 1000, height: 1600 },
    ])).toBeNull();
  });
});
