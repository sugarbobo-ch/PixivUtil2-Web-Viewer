import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export type AnchoredPopoverPlacement = 'start' | 'end';
export type AnchoredPopoverVerticalPlacement = 'down' | 'up';

export interface AnchoredPopoverElementRef {
  current: HTMLElement | null;
}

export interface AnchoredPopoverPosition {
  top: number;
  left: number;
  anchorWidth: number;
  maxHeight: number;
}

export type FloatingCustomProperties = CSSProperties & Record<`--${string}`, string>;

interface UseAnchoredPopoverOptions {
  open: boolean;
  anchorRef: AnchoredPopoverElementRef;
  contentRef: AnchoredPopoverElementRef;
  /**
   * Optional horizontal collision boundary. The viewport still controls
   * vertical placement, while this element keeps the floating surface inside
   * a layout region such as the viewer main area.
   */
  boundaryRef?: AnchoredPopoverElementRef;
  placement?: AnchoredPopoverPlacement;
  maxMenuHeight?: (viewportHeight: number) => number;
}

const ANCHORED_POPOVER_GAP = 8;
const ANCHORED_POPOVER_GUTTER = 12;

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
);

const positionsMatch = (left: AnchoredPopoverPosition | null, right: AnchoredPopoverPosition) => (
  left !== null
  && Math.abs(left.top - right.top) < 0.5
  && Math.abs(left.left - right.left) < 0.5
  && Math.abs(left.anchorWidth - right.anchorWidth) < 0.5
  && Math.abs(left.maxHeight - right.maxHeight) < 0.5
);

export const readCssCustomProperties = (
  element: HTMLElement,
  prefixes: readonly string[],
): Record<`--${string}`, string> => {
  const computedStyle = window.getComputedStyle(element);
  const properties: Record<`--${string}`, string> = {};

  for (let index = 0; index < computedStyle.length; index += 1) {
    const propertyName = computedStyle.item(index);
    if (!prefixes.some(prefix => propertyName.startsWith(prefix))) continue;

    const value = computedStyle.getPropertyValue(propertyName).trim();
    if (value) properties[propertyName as `--${string}`] = value;
  }

  return properties;
};

export function useAnchoredPopover({
  open,
  anchorRef,
  contentRef,
  boundaryRef,
  placement = 'start',
  maxMenuHeight,
}: UseAnchoredPopoverOptions) {
  const [position, setPosition] = useState<AnchoredPopoverPosition | null>(null);
  const [verticalPlacement, setVerticalPlacement] = useState<AnchoredPopoverVerticalPlacement>('down');
  const scheduledFrameRef = useRef<number | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const content = contentRef.current;
    if (!anchor || !content) return;

    const anchorRect = anchor.getBoundingClientRect();
    content.style.setProperty('--anchored-anchor-width', `${anchorRect.width}px`);

    const viewportWidth = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const boundaryRect = boundaryRef?.current?.getBoundingClientRect();
    const hasVisibleBoundary = Boolean(
      boundaryRect
      && boundaryRect.width > 0
      && boundaryRect.right > 0
      && boundaryRect.left < viewportWidth,
    );
    const horizontalMin = hasVisibleBoundary && boundaryRect && boundaryRect.left > ANCHORED_POPOVER_GUTTER
      ? Math.max(0, boundaryRect.left)
      : ANCHORED_POPOVER_GUTTER;
    const horizontalMax = hasVisibleBoundary && boundaryRect && boundaryRect.right < viewportWidth - ANCHORED_POPOVER_GUTTER
      ? Math.min(viewportWidth, boundaryRect.right)
      : viewportWidth - ANCHORED_POPOVER_GUTTER;
    const availableWidth = Math.max(1, horizontalMax - horizontalMin);

    if (hasVisibleBoundary) {
      content.style.setProperty('--anchored-max-width', `${availableWidth}px`);
    } else {
      content.style.removeProperty('--anchored-max-width');
    }

    const contentRect = content.getBoundingClientRect();
    const contentWidth = Math.max(1, contentRect.width || anchorRect.width);
    const contentHeight = Math.max(1, content.scrollHeight || contentRect.height);
    const availableBelow = Math.max(
      1,
      viewportHeight - anchorRect.bottom - ANCHORED_POPOVER_GAP - ANCHORED_POPOVER_GUTTER,
    );
    const availableAbove = Math.max(
      1,
      anchorRect.top - ANCHORED_POPOVER_GAP - ANCHORED_POPOVER_GUTTER,
    );
    const shouldOpenUp = contentHeight > availableBelow && availableAbove > availableBelow;
    const nextVerticalPlacement: AnchoredPopoverVerticalPlacement = shouldOpenUp ? 'up' : 'down';
    const availableHeight = shouldOpenUp ? availableAbove : availableBelow;
    const configuredMaxHeight = maxMenuHeight?.(viewportHeight) ?? Number.POSITIVE_INFINITY;
    const nextMaxHeight = Math.max(
      1,
      Math.min(
        availableHeight,
        Number.isFinite(configuredMaxHeight) ? Math.max(1, configuredMaxHeight) : availableHeight,
      ),
    );
    const visibleHeight = Math.min(contentHeight, nextMaxHeight);
    const desiredTop = nextVerticalPlacement === 'up'
      ? anchorRect.top - visibleHeight - ANCHORED_POPOVER_GAP
      : anchorRect.bottom + ANCHORED_POPOVER_GAP;
    const top = clamp(
      desiredTop,
      ANCHORED_POPOVER_GUTTER,
      viewportHeight - visibleHeight - ANCHORED_POPOVER_GUTTER,
    );

    const isRtl = window.getComputedStyle(anchor).direction === 'rtl';
    const alignToStart = placement === 'start';
    const desiredLeft = alignToStart === !isRtl
      ? anchorRect.left
      : anchorRect.right - contentWidth;
    const left = clamp(
      desiredLeft,
      horizontalMin,
      horizontalMax - contentWidth,
    );
    const nextPosition = {
      top,
      left,
      anchorWidth: anchorRect.width,
      maxHeight: nextMaxHeight,
    };

    setVerticalPlacement(current => current === nextVerticalPlacement ? current : nextVerticalPlacement);
    setPosition(current => positionsMatch(current, nextPosition) ? current : nextPosition);
  }, [anchorRef, boundaryRef, contentRef, maxMenuHeight, placement]);

  const schedulePosition = useCallback(() => {
    if (scheduledFrameRef.current !== null) return;

    scheduledFrameRef.current = window.requestAnimationFrame(() => {
      scheduledFrameRef.current = null;
      updatePosition();
    });
  }, [updatePosition]);

  useLayoutEffect(() => {
    if (!open) {
      if (scheduledFrameRef.current !== null) {
        window.cancelAnimationFrame(scheduledFrameRef.current);
        scheduledFrameRef.current = null;
      }
      setPosition(null);
      setVerticalPlacement('down');
      return undefined;
    }

    updatePosition();

    const handleViewportChange = () => schedulePosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);
    const resizeObserver = typeof ResizeObserver !== 'undefined' && contentRef.current
      ? new ResizeObserver(handleViewportChange)
      : null;
    if (resizeObserver && contentRef.current) resizeObserver.observe(contentRef.current);
    if (resizeObserver && anchorRef.current) resizeObserver.observe(anchorRef.current);
    if (resizeObserver && boundaryRef?.current) resizeObserver.observe(boundaryRef.current);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      resizeObserver?.disconnect();
      if (scheduledFrameRef.current !== null) {
        window.cancelAnimationFrame(scheduledFrameRef.current);
        scheduledFrameRef.current = null;
      }
    };
  }, [anchorRef, boundaryRef, contentRef, open, schedulePosition, updatePosition]);

  return { position, verticalPlacement };
}
