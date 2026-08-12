export const SIDEBAR_DEFAULT_WIDTH = 320;
export const SIDEBAR_MIN_WIDTH = 224;
export const SIDEBAR_MAX_WIDTH = 560;
export const SIDEBAR_MAIN_MIN_WIDTH = 320;
export const SIDEBAR_SNAP_DISTANCE = 20;
export const SIDEBAR_KEYBOARD_STEP = 24;
export const SIDEBAR_KEYBOARD_LARGE_STEP = 48;

export const getSidebarMaxWidth = (viewportWidth: number): number => {
  const safeViewportWidth = Number.isFinite(viewportWidth)
    ? viewportWidth
    : SIDEBAR_MAIN_MIN_WIDTH + SIDEBAR_MAX_WIDTH;

  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, Math.round(safeViewportWidth - SIDEBAR_MAIN_MIN_WIDTH)),
  );
};

export const clampSidebarWidth = (
  value: number,
  maxWidth = SIDEBAR_MAX_WIDTH,
): number => {
  const safeValue = Number.isFinite(value) ? value : SIDEBAR_DEFAULT_WIDTH;
  const safeMaxWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.round(maxWidth));
  return Math.min(safeMaxWidth, Math.max(SIDEBAR_MIN_WIDTH, Math.round(safeValue)));
};

export const snapSidebarWidth = (
  value: number,
  maxWidth = SIDEBAR_MAX_WIDTH,
): number => {
  const clampedWidth = clampSidebarWidth(value, maxWidth);
  if (Math.abs(clampedWidth - SIDEBAR_DEFAULT_WIDTH) > SIDEBAR_SNAP_DISTANCE) {
    return clampedWidth;
  }

  return clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH, maxWidth);
};
