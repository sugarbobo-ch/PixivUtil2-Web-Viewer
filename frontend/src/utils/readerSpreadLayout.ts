export interface ReaderSpreadMediaSize {
  width: number;
  height: number;
}

export interface ReaderSpreadLayout {
  width: number;
  height: number;
  slotWidths: number[];
  slotHeights: number[];
}

const isValidMediaSize = (size: ReaderSpreadMediaSize | null): size is ReaderSpreadMediaSize => (
  size !== null
  && Number.isFinite(size.width)
  && Number.isFinite(size.height)
  && size.width > 0
  && size.height > 0
);

/**
 * Fits a spread as one proportional unit inside the available stage.
 *
 * Every page shares one displayed height while preserving its own aspect
 * ratio. Source files can therefore use different resolutions or pixel
 * densities without appearing as physically different page heights. The
 * complete spread is then fitted to the stage as one connected unit.
 */
export const calculateReaderSpreadLayout = (
  stageWidth: number,
  stageHeight: number,
  mediaSizes: Array<ReaderSpreadMediaSize | null>,
): ReaderSpreadLayout | null => {
  if (
    !Number.isFinite(stageWidth)
    || !Number.isFinite(stageHeight)
    || stageWidth <= 0
    || stageHeight <= 0
    || mediaSizes.length === 0
    || !mediaSizes.every(isValidMediaSize)
  ) return null;

  const aspectRatios = mediaSizes.map(size => size.width / size.height);
  const combinedAspectRatio = aspectRatios.reduce((total, ratio) => total + ratio, 0);
  const displayHeight = Math.min(stageHeight, stageWidth / combinedAspectRatio);
  if (!Number.isFinite(displayHeight) || displayHeight <= 0) return null;

  const slotWidths = aspectRatios.map(ratio => ratio * displayHeight);
  const slotHeights = mediaSizes.map(() => displayHeight);

  return {
    width: combinedAspectRatio * displayHeight,
    height: displayHeight,
    slotWidths,
    slotHeights,
  };
};
