export type ScrollPerformanceStatus = 'pending' | 'passed' | 'failed' | 'unsupported';

export interface ScrollPerformanceSnapshot {
  supported: boolean;
  scrollTop: number;
  scrollHeight: number;
  imageCount: number;
  loadedImages: number;
  brokenImages: number;
  scrollPositions: number[];
  longTaskDurations: number[];
}

export interface ScrollPerformanceResult {
  status: ScrollPerformanceStatus;
  supported: boolean;
  scrollTop: number;
  scrollHeight: number;
  imageCount: number;
  loadedImages: number;
  brokenImages: number;
  scrollStepCount: number;
  scrollPositions: number[];
  longTaskCount: number;
  maxLongTaskMs: number;
}

declare global {
  interface Window {
    __WEB_VIEWER_SCROLL_QA__?: ScrollPerformanceResult;
  }
}

const QA_QUERY_PARAM = 'qa-scroll-performance';
const SCROLL_STEPS = 3;
const STEP_SETTLE_MS = 500;
const PROBE_TIMEOUT_MS = 30_000;
const LONG_TASK_LIMIT_MS = 100;

export const summarizeScrollPerformance = (
  snapshot: ScrollPerformanceSnapshot,
): ScrollPerformanceResult => {
  const maxLongTaskMs = snapshot.longTaskDurations.length > 0
    ? Math.max(...snapshot.longTaskDurations)
    : 0;

  return {
    status: !snapshot.supported
      ? 'unsupported'
      : snapshot.scrollPositions.length < SCROLL_STEPS
        || snapshot.brokenImages > 0
        || maxLongTaskMs > LONG_TASK_LIMIT_MS
        ? 'failed'
        : 'passed',
    supported: snapshot.supported,
    scrollTop: snapshot.scrollTop,
    scrollHeight: snapshot.scrollHeight,
    imageCount: snapshot.imageCount,
    loadedImages: snapshot.loadedImages,
    brokenImages: snapshot.brokenImages,
    scrollStepCount: snapshot.scrollPositions.length,
    scrollPositions: [...snapshot.scrollPositions],
    longTaskCount: snapshot.longTaskDurations.length,
    maxLongTaskMs,
  };
};

const wait = (durationMs: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, durationMs);
});

const getGallerySnapshot = (
  container: HTMLElement,
  supported: boolean,
  longTaskDurations: number[],
  scrollPositions: number[],
): ScrollPerformanceSnapshot => {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>('main img'));
  return {
    supported,
    scrollTop: Math.round(container.scrollTop),
    scrollHeight: Math.round(container.scrollHeight),
    imageCount: images.length,
    loadedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length,
    brokenImages: images.filter((image) => image.complete && image.naturalWidth === 0).length,
    scrollPositions: [...scrollPositions],
    longTaskDurations: [...longTaskDurations],
  };
};

const publishResult = (result: ScrollPerformanceResult) => {
  window.__WEB_VIEWER_SCROLL_QA__ = result;
  document.documentElement.dataset.webViewerScrollQa = result.status;

  const output = document.querySelector<HTMLOutputElement>('[data-web-viewer-scroll-qa="true"]');
  if (output) output.value = JSON.stringify(result);
};

const createOutput = () => {
  const output = document.createElement('output');
  output.dataset.webViewerScrollQa = 'true';
  output.hidden = true;
  output.setAttribute('aria-live', 'polite');
  document.body.append(output);
  return output;
};

const observeLongTasks = (durations: number[]) => {
  if (typeof PerformanceObserver === 'undefined') return null;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) durations.push(entry.duration);
    });
    observer.observe({ type: 'longtask', buffered: true });
    return observer;
  } catch {
    return null;
  }
};

const findGalleryContainer = () => (
  document.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]')
  ?? document.querySelector<HTMLElement>('.gallery-month-content')
);

export const startScrollPerformanceProbe = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;

  const output = createOutput();
  const initialResult: ScrollPerformanceResult = {
    status: 'pending',
    supported: false,
    scrollTop: 0,
    scrollHeight: 0,
    imageCount: 0,
    loadedImages: 0,
    brokenImages: 0,
    scrollStepCount: 0,
    scrollPositions: [],
    longTaskCount: 0,
    maxLongTaskMs: 0,
  };
  publishResult(initialResult);

  let cancelled = false;
  let timeoutId: number | undefined;
  let observer: PerformanceObserver | null = null;
  let detachScrollListener: (() => void) | null = null;

  const finish = (result: ScrollPerformanceResult) => {
    if (cancelled) return;
    publishResult(result);
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    observer?.disconnect();
    detachScrollListener?.();
    detachScrollListener = null;
  };

  const run = async () => {
    const startedAt = Date.now();
    let container = findGalleryContainer();
    while (!container && Date.now() - startedAt < PROBE_TIMEOUT_MS && !cancelled) {
      await wait(250);
      container = findGalleryContainer();
    }

    if (!container || cancelled) {
      finish({ ...initialResult, status: 'failed' });
      return;
    }

    const longTaskDurations: number[] = [];
    observer = observeLongTasks(longTaskDurations);
    const supported = observer !== null;
    const scrollPositions: number[] = [];
    let lastRecordedTop = Math.round(container.scrollTop);
    const minimumScrollDelta = Math.max(100, Math.round(container.clientHeight * 0.35));
    const onScroll = () => {
      const currentTop = Math.round(container.scrollTop);
      if (Math.abs(currentTop - lastRecordedTop) < minimumScrollDelta) return;
      lastRecordedTop = currentTop;
      scrollPositions.push(currentTop);
      if (scrollPositions.length < SCROLL_STEPS) return;

      window.setTimeout(() => {
        if (cancelled) return;
        finish(summarizeScrollPerformance(getGallerySnapshot(
          container,
          supported,
          longTaskDurations,
          scrollPositions,
        )));
      }, STEP_SETTLE_MS);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    detachScrollListener = () => container.removeEventListener('scroll', onScroll);
  };

  timeoutId = window.setTimeout(() => {
    if (!cancelled) finish({ ...initialResult, status: 'failed' });
  }, PROBE_TIMEOUT_MS + SCROLL_STEPS * STEP_SETTLE_MS + 1000);
  void run();

  return () => {
    cancelled = true;
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    observer?.disconnect();
    output.remove();
  };
};

export const isScrollPerformanceProbeRequested = () => (
  typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get(QA_QUERY_PARAM) === '1'
);
