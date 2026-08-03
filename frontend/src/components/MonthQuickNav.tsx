import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getScrollTopForElement, scrollElementToContainerStart } from '../utils/galleryLayout';

export interface MonthJumpItem {
  key: string;
  label: string;
  count: number;
  offset?: number;
}

export interface MonthJumpNavigationOptions {
  behavior?: ScrollBehavior;
  scrubbing?: boolean;
  previewOnly?: boolean;
}

export type MonthNavigationPhase = 'click-start' | 'scrub-start' | 'preview' | 'settle' | 'commit' | 'cancel' | 'end';

interface MonthQuickNavProps {
  items: MonthJumpItem[];
  sectionKeys?: string;
  onJumpToMonth?: (item: MonthJumpItem, options?: MonthJumpNavigationOptions) => void;
  onPrefetchMonth?: (item: MonthJumpItem) => void;
  onNavigationChange?: (phase: MonthNavigationPhase, item?: MonthJumpItem) => void;
  isLoading?: boolean;
}

interface MonthScrubGesture {
  pointerId: number;
  startX: number;
  startY: number;
  startIndex: number;
  pixelsPerMonth: number;
  moved: boolean;
  lastKey: string | null;
}

const getMonthScrollContainer = (target: HTMLElement) => (
  target.closest('[data-gallery-scroll-container="true"]')
  ?? target.closest('main')
) as HTMLElement | null;

const scrollMonthTarget = (target: HTMLElement, behavior: ScrollBehavior) => {
  const container = getMonthScrollContainer(target);

  if (!container) {
    target.scrollIntoView({ behavior, block: 'start' });
    return;
  }

  scrollElementToContainerStart(container, target, behavior);
};

export const MonthQuickNav: React.FC<MonthQuickNavProps> = ({ items, sectionKeys = '', onJumpToMonth, onPrefetchMonth, onNavigationChange, isLoading = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(items[0]?.key ?? null);
  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [popupTopOverride, setPopupTopOverride] = useState<string | null>(null);
  const [rulerViewport, setRulerViewport] = useState({ top: 0, height: 0 });
  const navRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const ticksRef = useRef<HTMLSpanElement>(null);
  const tickListRef = useRef<HTMLSpanElement>(null);
  const scrubGestureRef = useRef<MonthScrubGesture | null>(null);
  const suppressClickRef = useRef(false);
  const itemKeys = items.map(item => item.key).join('|');

  useLayoutEffect(() => {
    const updateRulerViewport = () => {
      const main = railRef.current?.closest('main') as HTMLElement | null;
      if (!main) return;

      const mainRect = main.getBoundingClientRect();
      const stickyToolbar = main.querySelector<HTMLElement>('[data-viewer-sticky-toolbar]');
      const stickyStyle = stickyToolbar ? window.getComputedStyle(stickyToolbar) : null;
      const stickyTop = Number.parseFloat(stickyStyle?.top ?? '0') || 0;
      const stickySpacing = Number.parseFloat(stickyStyle?.marginTop ?? '0') || 0;
      const stickyHeight = stickyToolbar?.getBoundingClientRect().height ?? 0;
      const regionTop = Math.max(
        mainRect.top,
        mainRect.top + Math.max(0, stickyTop) + Math.max(0, stickySpacing) + stickyHeight,
      );
      const regionBottom = Math.min(window.innerHeight, mainRect.bottom);
      const regionHeight = Math.max(0, regionBottom - regionTop);
      const nextViewport = {
        top: Math.round(regionTop),
        height: Math.round(regionHeight),
      };

      setRulerViewport(current => (
        current.top === nextViewport.top
        && current.height === nextViewport.height
          ? current
          : nextViewport
      ));
    };

    updateRulerViewport();
    const frameId = window.requestAnimationFrame(updateRulerViewport);
    const settleTimer = window.setTimeout(updateRulerViewport, 0);
    window.addEventListener('resize', updateRulerViewport);

    const main = railRef.current?.closest('main') as HTMLElement | null;
    const resizeObserver = main && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateRulerViewport)
      : null;
    const stickyToolbar = main?.querySelector<HTMLElement>('[data-viewer-sticky-toolbar]');
    if (resizeObserver && main) resizeObserver.observe(main);
    if (resizeObserver && stickyToolbar) resizeObserver.observe(stickyToolbar);

    const mutationObserver = stickyToolbar && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(updateRulerViewport)
      : null;
    if (mutationObserver && stickyToolbar) {
      mutationObserver.observe(stickyToolbar, {
        attributes: true,
        attributeFilter: ['class', 'style'],
        childList: true,
        subtree: true,
      });
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', updateRulerViewport);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [itemKeys, sectionKeys]);
  const activeIndex = Math.max(0, items.findIndex(item => item.key === activeMonthKey));
  const hoveredIndex = items.findIndex(item => item.key === hoveredMonthKey);
  const displayIndex = hoveredIndex >= 0 ? hoveredIndex : activeIndex;
  const displayItem = items[displayIndex] ?? items[0] ?? { key: '', label: '未指定月份', count: 0 };
  const defaultPopupTop = items.length > 1 ? `${(displayIndex / (items.length - 1)) * 100}%` : '50%';
  const popupTop = popupTopOverride ?? defaultPopupTop;

  const ensureTickVisible = (index: number) => {
    const viewport = ticksRef.current;
    const tick = tickListRef.current?.children[index] as HTMLElement | undefined;
    if (!viewport || !tick) return;

    const tickTop = tick.offsetTop;
    const tickBottom = tickTop + tick.offsetHeight;
    const visibleTop = viewport.scrollTop;
    const visibleBottom = visibleTop + viewport.clientHeight;

    if (tickTop < visibleTop) viewport.scrollTop = tickTop;
    if (tickBottom > visibleBottom) viewport.scrollTop = tickBottom - viewport.clientHeight;
  };

  const setPopupTopAtClientY = (clientY: number) => {
    const nav = navRef.current;
    if (!nav) return;

    const rect = nav.getBoundingClientRect();
    const top = Math.max(0, Math.min(rect.height, clientY - rect.top));
    setPopupTopOverride(`${top}px`);
  };

  const setPopupTopAtIndex = (index: number) => {
    ensureTickVisible(index);
    const nav = navRef.current;
    const tick = tickListRef.current?.children[index] as HTMLElement | undefined;
    if (!nav || !tick) return;

    const navRect = nav.getBoundingClientRect();
    const tickRect = tick.getBoundingClientRect();
    const top = Math.max(0, Math.min(navRect.height, tickRect.top + tickRect.height / 2 - navRect.top));
    setPopupTopOverride(`${top}px`);
  };

  const getIndexAtClientY = (clientY: number) => {
    const viewport = ticksRef.current;
    const tickList = tickListRef.current;
    if (!viewport || !tickList) return 0;

    const rect = viewport.getBoundingClientRect();
    const contentY = clientY - rect.top + viewport.scrollTop;
    const ratio = Math.max(0, Math.min(1, contentY / Math.max(1, tickList.scrollHeight)));
    return Math.round(ratio * (items.length - 1));
  };

  const getPixelsPerMonth = () => {
    const tickList = tickListRef.current;
    const firstTick = tickList?.children[0] as HTMLElement | undefined;
    const secondTick = tickList?.children[1] as HTMLElement | undefined;
    if (firstTick && secondTick) return Math.max(1, secondTick.offsetTop - firstTick.offsetTop);
    return Math.max(1, (tickList?.scrollHeight ?? 1) / Math.max(1, items.length - 1));
  };

  // Keep the gallery in sync with the pointer's fractional position while a
  // drag is in progress. Month ticks are discrete, but the content scroll can
  // interpolate between the two surrounding section anchors for a continuous
  // slide instead of stepping once per month.
  const scrollScrubPreview = (clientY: number, gesture: MonthScrubGesture) => {
    if (items.length === 0) return;

    const fractionalIndex = Math.max(
      0,
      Math.min(
        items.length - 1,
        gesture.startIndex + (clientY - gesture.startY) / Math.max(1, gesture.pixelsPerMonth),
      ),
    );
    const lowerIndex = Math.floor(fractionalIndex);
    const upperIndex = Math.min(items.length - 1, lowerIndex + 1);
    const fraction = fractionalIndex - lowerIndex;
    const lowerTarget = document.getElementById(`month-section-${items[lowerIndex].key}`);
    const upperTarget = document.getElementById(`month-section-${items[upperIndex].key}`);
    const anchor = lowerTarget ?? upperTarget;
    if (!anchor) return;

    const container = getMonthScrollContainer(anchor);
    if (!container) return;

    const lowerTop = lowerTarget ? getScrollTopForElement(container, lowerTarget) : getScrollTopForElement(container, anchor);
    const upperTop = upperTarget ? getScrollTopForElement(container, upperTarget) : lowerTop;
    const top = lowerTop + (upperTop - lowerTop) * fraction;
    container.scrollTo({ top, behavior: 'auto' });
  };

  useEffect(() => {
    if (items.length === 0) {
      setActiveMonthKey(null);
      setHoveredMonthKey(null);
      return;
    }

    setActiveMonthKey(current => current && items.some(item => item.key === current) ? current : items[0].key);

    const main = railRef.current?.closest('main') as HTMLElement | null;
    const scrollRoot = main?.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]') ?? main;
    let frameId: number | null = null;

    const updateActiveMonth = () => {
      frameId = null;
      const sectionElements = items
        .map(item => document.getElementById(`month-section-${item.key}`))
        .filter((element): element is HTMLElement => element !== null);

      if (sectionElements.length === 0) return;

      const activationLine = (scrollRoot?.getBoundingClientRect().top ?? 0) + 96;
      let currentSection = sectionElements[0];

      for (const section of sectionElements) {
        if (section.getBoundingClientRect().top <= activationLine) {
          currentSection = section;
        } else {
          break;
        }
      }

      const currentKey = currentSection.id.replace('month-section-', '');
      setActiveMonthKey(current => current === currentKey ? current : currentKey);
    };

    const scheduleActiveMonthUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateActiveMonth);
    };

    const scrollTarget = scrollRoot ?? window;
    scrollTarget.addEventListener('scroll', scheduleActiveMonthUpdate, { passive: true });
    scheduleActiveMonthUpdate();

    return () => {
      scrollTarget.removeEventListener('scroll', scheduleActiveMonthUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [itemKeys, sectionKeys]);

  useEffect(() => {
    if (!isLoading || scrubGestureRef.current) return;
    setIsOpen(false);
    setHoveredMonthKey(null);
    setPopupTopOverride(null);
  }, [isLoading]);

  useEffect(() => {
    if (items.length === 0) return;

    const frameId = window.requestAnimationFrame(() => {
      if (hoveredIndex < 0) {
        setPopupTopAtIndex(activeIndex);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeIndex, hoveredIndex, itemKeys]);

  if (items.length === 0) return null;

  const previewMonthAtClientY = (clientY: number) => {
    const item = items[getIndexAtClientY(clientY)];
    if (item) {
      onPrefetchMonth?.(item);
      setPopupTopAtClientY(clientY);
      setIsOpen(true);
      setHoveredMonthKey(item.key);
    }
    return item;
  };

  const previewMonthWhileScrubbing = (clientY: number, gesture: MonthScrubGesture) => {
    const deltaIndex = Math.round((clientY - gesture.startY) / gesture.pixelsPerMonth);
    const index = Math.max(0, Math.min(items.length - 1, gesture.startIndex + deltaIndex));
    const item = items[index];
    if (item) {
      ensureTickVisible(index);
      onPrefetchMonth?.(item);
      // Start the target-window preload before moving the gallery so the
      // network request gets a head start during rapid pointer movement.
      scrollScrubPreview(clientY, gesture);
      setPopupTopAtClientY(clientY);
      setIsOpen(true);
      setHoveredMonthKey(item.key);
      if (gesture.lastKey !== item.key) onNavigationChange?.('preview', item);
    }
    return item;
  };

  const handleRulerWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const viewport = ticksRef.current;
    if (!viewport || viewport.scrollHeight <= viewport.clientHeight) return;

    event.preventDefault();
    event.stopPropagation();

    const delta = event.deltaMode === 1
      ? event.deltaY * 16
      : event.deltaMode === 2
        ? event.deltaY * viewport.clientHeight
        : event.deltaY;
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTop = Math.max(0, Math.min(maxScrollTop, viewport.scrollTop + delta));
    previewMonthAtClientY(event.clientY);
  };

  const scrubToMonth = (item: MonthJumpItem, preserveRulerPosition = false, previewOnly = false) => {
    if (!preserveRulerPosition) {
      const itemIndex = items.findIndex(current => current.key === item.key);
      if (itemIndex >= 0) ensureTickVisible(itemIndex);
    }

    const target = document.getElementById(`month-section-${item.key}`);
    if (!previewOnly) {
      if (!target) {
        onJumpToMonth?.(item, { behavior: 'auto', scrubbing: true });
      } else {
        scrollMonthTarget(target, 'auto');
      }
    }

    setActiveMonthKey(item.key);
    setHoveredMonthKey(item.key);
    setIsOpen(true);
  };

  const scrollToMonth = (item: MonthJumpItem, options: MonthJumpNavigationOptions = {}) => {
    const itemIndex = items.findIndex(current => current.key === item.key);
    if (itemIndex >= 0) setPopupTopAtIndex(itemIndex);

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior = options.behavior ?? (prefersReducedMotion ? 'auto' : 'smooth');
    // Start warming the destination before the scroll begins. For a same-page
    // jump this lets thumbnail decoding overlap the smooth movement; for a
    // cross-page jump the page request can overlap it as well.
    onPrefetchMonth?.(item);
    if (options.scrubbing) onNavigationChange?.('preview', item);
    else onNavigationChange?.('click-start', item);
    const target = document.getElementById(`month-section-${item.key}`);
    if (!target) {
      onJumpToMonth?.(item, { ...options, behavior });
    } else {
      scrollMonthTarget(target, behavior);
    }

    setActiveMonthKey(item.key);
    setHoveredMonthKey(null);
    setIsOpen(false);
  };

  const jumpToClientY = (clientY: number) => {
    const item = items[getIndexAtClientY(clientY)];
    if (item) scrollToMonth(item);
  };

  const handleRailPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;

    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const startIndex = getIndexAtClientY(event.clientY);
    const pixelsPerMonth = getPixelsPerMonth();
    const item = previewMonthAtClientY(event.clientY);
    scrubGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startIndex,
      pixelsPerMonth,
      moved: false,
      lastKey: item?.key ?? null,
    };
    onNavigationChange?.('scrub-start', item ?? undefined);
    setIsScrubbing(true);
  };

  const handleRailPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = scrubGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    event.preventDefault();
    if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 5) {
      gesture.moved = true;
    }

    const item = gesture.moved
      ? previewMonthWhileScrubbing(event.clientY, gesture)
      : previewMonthAtClientY(event.clientY);
    if (gesture.moved && item && gesture.lastKey !== item.key) {
      gesture.lastKey = item.key;
      scrubToMonth(item, true, true);
    }
  };

  const finishRailPointer = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = scrubGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const item = !cancelled && gesture.moved
      ? previewMonthWhileScrubbing(event.clientY, gesture)
      : items[getIndexAtClientY(event.clientY)];
    if (!cancelled && item && !gesture.moved) {
      suppressClickRef.current = true;
      scrollToMonth(item);
    } else if (!cancelled && gesture.moved) {
      suppressClickRef.current = true;
      if (item) scrubToMonth(item, true, false);
      onNavigationChange?.('commit', item ?? undefined);
      setActiveMonthKey(item?.key ?? activeMonthKey);
      setHoveredMonthKey(null);
      setIsOpen(false);
      setPopupTopOverride(null);
    } else {
      if (cancelled) onNavigationChange?.('cancel');
      setIsOpen(false);
      setHoveredMonthKey(null);
      setPopupTopOverride(null);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scrubGestureRef.current = null;
    setIsScrubbing(false);
  };

  const closeWhenMouseLeaves = () => {
    if (scrubGestureRef.current) return;
    setIsOpen(false);
    setHoveredMonthKey(null);
    setPopupTopOverride(null);
  };

  const closeWhenFocusLeaves = () => {
    window.requestAnimationFrame(() => {
      if (!navRef.current?.contains(document.activeElement)) closeWhenMouseLeaves();
    });
  };

  const handleRulerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = Math.min(items.length - 1, activeIndex + 1);
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = Math.max(0, activeIndex - 1);
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (event.key === 'Enter' || event.key === ' ') nextIndex = activeIndex;

    if (event.key === 'Escape') {
      setIsOpen(false);
      setHoveredMonthKey(null);
      setPopupTopOverride(null);
      return;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    const item = items[nextIndex];
    if (item) scrollToMonth(item);
  };

  return (
    <nav
      ref={navRef}
      className={`viewer-month-index${isOpen ? ' is-open' : ''}${isLoading ? ' is-loading' : ''}${isScrubbing ? ' is-scrubbing' : ''}`}
      style={{
        '--viewer-ruler-region-top': `${rulerViewport.top}px`,
        '--viewer-ruler-region-height': `${rulerViewport.height}px`,
      } as React.CSSProperties}
      aria-busy={isLoading}
      aria-label="年份與月份快速索引"
      onMouseLeave={closeWhenMouseLeaves}
      onBlurCapture={closeWhenFocusLeaves}
    >
      <div
      ref={railRef}
        role="slider"
        tabIndex={0}
        aria-label="點擊尺規跳轉年份與月份"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, items.length - 1)}
        aria-valuenow={hoveredIndex >= 0 ? hoveredIndex : activeIndex}
        aria-valuetext={displayItem.label}
        aria-describedby="month-quick-nav-panel"
        className="viewer-month-index__rail group flex cursor-pointer items-center justify-center px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        onMouseEnter={() => {
          setPopupTopAtIndex(activeIndex);
          setIsOpen(true);
        }}
        onMouseMove={event => {
          if (!scrubGestureRef.current) previewMonthAtClientY(event.clientY);
        }}
        onPointerDown={handleRailPointerDown}
        onPointerMove={handleRailPointerMove}
        onPointerUp={event => finishRailPointer(event)}
        onPointerCancel={event => finishRailPointer(event, true)}
        onWheel={handleRulerWheel}
        onClick={event => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            return;
          }
          jumpToClientY(event.clientY);
        }}
        onKeyDown={handleRulerKeyDown}
      >
        <span
          ref={ticksRef}
          className="viewer-month-index__ticks"
          style={{ '--month-index-count': items.length } as React.CSSProperties}
          aria-hidden="true"
        >
          <span
            ref={tickListRef}
            className="viewer-month-index__tick-list"
          >
            {items.map((item, index) => {
              const isYearStart = index === 0 || item.key.slice(0, 4) !== items[index - 1].key.slice(0, 4);
              const isActive = activeMonthKey === item.key;
              const isPreview = hoveredMonthKey === item.key;

              return (
                <span
                  key={item.key}
                  className={`viewer-month-index__tick${isYearStart ? ' is-year-start' : ''}${isActive ? ' is-active' : ''}${isPreview ? ' is-preview' : ''}`}
                />
              );
            })}
          </span>
        </span>
        <span className="viewer-month-index__loading" aria-hidden="true" />
      </div>

      <div
        id="month-quick-nav-panel"
        className="viewer-month-index__panel rounded-2xl border border-zinc-800/90 bg-zinc-900/95 px-3.5 py-3 text-zinc-100 shadow-2xl shadow-black/40 backdrop-blur-xl"
        style={{ '--month-index-popup-top': popupTop } as React.CSSProperties}
        aria-hidden="true"
      >
        <p className="viewer-month-index__panel-kicker text-[10px] font-medium uppercase tracking-[0.18em] text-indigo-300/80">作品時間</p>
        <p className="viewer-month-index__panel-label mt-1 text-sm font-semibold text-zinc-100">{displayItem.label}</p>
        <p className="viewer-month-index__panel-meta">{displayItem.count} 張作品</p>
      </div>

    </nav>
  );
};
