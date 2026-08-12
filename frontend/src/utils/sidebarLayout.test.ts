import { describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  getSidebarMaxWidth,
  SIDEBAR_DEFAULT_WIDTH,
  snapSidebarWidth,
} from './sidebarLayout';

describe('sidebar layout sizing', () => {
  it('keeps enough room for the main content on compact desktop widths', () => {
    expect(getSidebarMaxWidth(641)).toBe(321);
    expect(getSidebarMaxWidth(1024)).toBe(560);
  });

  it('snaps widths within the default-width threshold', () => {
    expect(snapSidebarWidth(SIDEBAR_DEFAULT_WIDTH - 20)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(snapSidebarWidth(SIDEBAR_DEFAULT_WIDTH + 20)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(snapSidebarWidth(SIDEBAR_DEFAULT_WIDTH - 21)).toBe(SIDEBAR_DEFAULT_WIDTH - 21);
    expect(snapSidebarWidth(SIDEBAR_DEFAULT_WIDTH + 21)).toBe(SIDEBAR_DEFAULT_WIDTH + 21);
  });

  it('clamps persisted and keyboard values to the supported range', () => {
    expect(clampSidebarWidth(1)).toBe(224);
    expect(clampSidebarWidth(999)).toBe(560);
    expect(clampSidebarWidth(999, 321)).toBe(321);
  });
});
