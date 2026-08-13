import type {
  GlobalIndex,
  LoadIntent,
  MediaRange,
  MediaRangeAdapter,
  MediaQuery,
  MediaSlot,
  MediaWindowController,
  MediaWindowDebugState,
  MediaWindowSnapshot,
  MonthLayoutItem,
} from './types';

export class StaleMediaRequestError extends Error {
  constructor(message = 'The media range request is stale.') {
    super(message);
    this.name = 'StaleMediaRequestError';
  }
}

export class InvalidMediaRangeResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMediaRangeResponseError';
  }
}

interface ChunkRecord {
  key: string;
  start: number;
  end: number;
  complete: boolean;
  lastUsed: number;
}

interface PendingChunk {
  key: string;
  controller: AbortController;
  promise: Promise<void>;
  generation: number;
  intent: LoadIntent;
}

interface PinRecord {
  owner: string;
  range: MediaRange;
}

export interface GlobalMediaWindowOptions {
  adapter: MediaRangeAdapter;
  query: MediaQuery;
  chunkSize?: number;
  maxChunks?: number;
}

const INTENT_PRIORITY: Record<LoadIntent, number> = {
  'month-jump': 0,
  viewport: 1,
  'reader-neighbor': 2,
  'scrub-preview': 3,
};

const clampInteger = (value: number, fallback = 0) => (
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
);

const normalizeRange = (range: MediaRange): MediaRange => {
  const start = clampInteger(range.start);
  const end = clampInteger(range.end);
  return { start, end: Math.max(start, end) };
};

const chunkKey = (range: MediaRange) => `${range.start}:${range.end}`;

const chunkRangeFromKey = (key: string): MediaRange => {
  const [startValue, endValue] = key.split(':').map(Number);
  const start = Number.isFinite(startValue) ? startValue : 0;
  const end = Number.isFinite(endValue) ? endValue : start;
  return { start, end: Math.max(start, end) };
};

const rangesOverlap = (left: MediaRange, right: MediaRange) => (
  left.start < right.end && right.start < left.end
);

const createUnloadedSlot = (index: number): MediaSlot => ({
  index,
  status: 'unloaded',
});

const isAbortLike = (error: unknown) => (
  (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
  || (error instanceof Error && error.name === 'AbortError')
);

const monthLayoutsEqual = (left: MonthLayoutItem[], right: MonthLayoutItem[]) => (
  left.length === right.length
  && left.every((month, index) => {
    const next = right[index];
    return Boolean(next)
      && month.key === next.key
      && month.label === next.label
      && month.offset === next.offset
      && month.imageCount === next.imageCount
      && month.cardCount === next.cardCount;
  })
);

export class GlobalMediaWindow implements MediaWindowController {
  private readonly adapter: MediaRangeAdapter;
  private readonly chunkSize: number;
  private readonly maxChunks: number;
  private query: MediaQuery;
  private generation = 0;
  private revision = '';
  private total = 0;
  private months: MonthLayoutItem[] = [];
  private sequence = 0;
  private readonly slots = new Map<number, MediaSlot>();
  private readonly placeholderColors = new Map<number, string>();
  private readonly chunks = new Map<string, ChunkRecord>();
  private readonly pending = new Map<string, PendingChunk>();
  private readonly pins = new Map<string, PinRecord>();
  private readonly listeners = new Set<() => void>();
  private snapshot: MediaWindowSnapshot;

  constructor({ adapter, query, chunkSize = 200, maxChunks = 5 }: GlobalMediaWindowOptions) {
    this.adapter = adapter;
    this.chunkSize = Math.max(1, clampInteger(chunkSize, 200));
    this.maxChunks = Math.max(1, clampInteger(maxChunks, 5));
    this.query = query;
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): MediaWindowSnapshot => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  ensure = async (range: MediaRange, intent: LoadIntent): Promise<void> => {
    const normalized = normalizeRange(range);
    if (normalized.end <= normalized.start) return;

    if (intent === 'month-jump') this.preemptLowerPriorityRequests(intent);
    if (intent === 'scrub-preview') this.preemptStaleScrubPreviews(normalized);

    const chunkRanges = this.getChunkRanges(normalized)
      .sort((left, right) => left.start - right.start);
    await Promise.all(chunkRanges.map(chunk => this.loadChunk(chunk, intent)));
  };

  pin = (owner: string, range: MediaRange) => {
    const normalizedOwner = owner.trim() || 'anonymous';
    this.pins.set(normalizedOwner, { owner: normalizedOwner, range: normalizeRange(range) });
    this.evictIfNeeded();
    return () => {
      const current = this.pins.get(normalizedOwner);
      if (current?.range.start === range.start && current.range.end === range.end) {
        this.pins.delete(normalizedOwner);
        this.evictIfNeeded();
      }
    };
  };

  reset = (query: MediaQuery) => {
    this.generation += 1;
    this.abortPending();
    this.query = query;
    this.revision = '';
    this.total = 0;
    this.months = [];
    this.slots.clear();
    this.placeholderColors.clear();
    this.chunks.clear();
    this.publish();
  };

  getDebugState = (): MediaWindowDebugState => ({
    chunkStarts: Array.from(this.chunks.values())
      .sort((left, right) => left.start - right.start)
      .map(chunk => chunk.start),
    pinnedChunkStarts: Array.from(this.chunks.values())
      .filter(chunk => this.isChunkPinned(chunk))
      .sort((left, right) => left.start - right.start)
      .map(chunk => chunk.start),
    maxChunks: this.maxChunks,
    generation: this.generation,
  });

  private buildSnapshot(): MediaWindowSnapshot {
    return {
      revision: this.revision,
      total: this.total,
      months: this.months,
      get: (index: GlobalIndex) => {
        const safeIndex = clampInteger(index);
        const slot = this.slots.get(safeIndex);
        return slot ? { ...slot } : createUnloadedSlot(safeIndex);
      },
      getPlaceholderColor: (index: GlobalIndex) => this.placeholderColors.get(clampInteger(index)),
      getLoaded: (range?: MediaRange) => {
        const normalized = range ? normalizeRange(range) : null;
        return Array.from(this.slots.values())
          .filter(slot => slot.status === 'ready')
          .filter(slot => !normalized || (slot.index >= normalized.start && slot.index < normalized.end))
          .sort((left, right) => left.index - right.index)
          .map(slot => ({ ...slot }));
      },
      isRangeReady: (range: MediaRange) => {
        const normalized = normalizeRange(range);
        const end = this.total > 0 ? Math.min(normalized.end, this.total) : normalized.end;
        if (end <= normalized.start) return true;
        for (let index = normalized.start; index < end; index += 1) {
          if (this.slots.get(index)?.status !== 'ready') return false;
        }
        return true;
      },
    };
  }

  private publish() {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private getChunkRanges(range: MediaRange): MediaRange[] {
    const start = Math.floor(range.start / this.chunkSize) * this.chunkSize;
    const requestedEnd = Math.max(start, range.end);
    const ranges: MediaRange[] = [];
    for (let chunkStart = start; chunkStart < requestedEnd; chunkStart += this.chunkSize) {
      ranges.push({
        start: chunkStart,
        end: chunkStart + this.chunkSize,
      });
    }
    return ranges;
  }

  private isChunkPinned(chunk: ChunkRecord) {
    return Array.from(this.pins.values()).some(pin => rangesOverlap(pin.range, chunk));
  }

  private markRangeLoading(range: MediaRange) {
    const expectedEnd = this.total > 0 ? Math.min(range.end, this.total) : range.end;
    for (let index = range.start; index < expectedEnd; index += 1) {
      const current = this.slots.get(index);
      if (current?.status === 'ready') continue;
      this.slots.set(index, { index, status: 'loading' });
    }
    this.publish();
  }

  private async loadChunk(range: MediaRange, intent: LoadIntent): Promise<void> {
    const key = chunkKey(range);
    const cached = this.chunks.get(key);
    if (cached?.complete) {
      cached.lastUsed = ++this.sequence;
      return;
    }

    const existing = this.pending.get(key);
    if (existing) {
      if (INTENT_PRIORITY[intent] < INTENT_PRIORITY[existing.intent]) existing.intent = intent;
      return existing.promise;
    }

    const generation = this.generation;
    const controller = new AbortController();
    this.markRangeLoading(range);

    const request: PendingChunk = {
      key,
      controller,
      generation,
      intent,
      promise: Promise.resolve(),
    };
    const promise = this.adapter.load(this.query, range, controller.signal)
      .then(response => {
        if (generation !== this.generation || controller.signal.aborted) {
          throw new StaleMediaRequestError();
        }
        this.applyResponse(range, response, generation);
      })
      .catch(error => {
        if (generation !== this.generation || isAbortLike(error)) {
          throw error instanceof StaleMediaRequestError
            ? error
            : new StaleMediaRequestError();
        }

        const expectedEnd = this.total > 0 ? Math.min(range.end, this.total) : range.end;
        for (let index = range.start; index < expectedEnd; index += 1) {
          const current = this.slots.get(index);
          if (current?.status !== 'ready') this.slots.set(index, { index, status: 'error' });
        }
        this.publish();
        throw error;
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
    request.promise = promise;
    this.pending.set(key, request);
    return promise;
  }

  private applyResponse(
    requestedRange: MediaRange,
    response: Awaited<ReturnType<MediaRangeAdapter['load']>>,
    generation: number,
  ) {
    if (generation !== this.generation) throw new StaleMediaRequestError();
    if (!response || typeof response.revision !== 'string' || response.revision.length === 0) {
      throw new InvalidMediaRangeResponseError('Media range response is missing revision.');
    }
    if (!Number.isSafeInteger(response.total) || response.total < 0) {
      throw new InvalidMediaRangeResponseError('Media range response has an invalid total.');
    }
    if (response.range.start !== requestedRange.start || response.range.end < response.range.start) {
      throw new InvalidMediaRangeResponseError('Media range response does not match its requested offset.');
    }

    if (this.revision && response.revision !== this.revision) {
      // A revision change invalidates every previously loaded slot. Abort all
      // other responses in this generation so an old range cannot be merged
      // back after the new snapshot becomes authoritative.
      this.abortPending(chunkKey(requestedRange));
      this.generation += 1;
      this.revision = response.revision;
      this.total = 0;
      this.months = [];
      this.slots.clear();
      this.placeholderColors.clear();
      this.chunks.clear();
    } else {
      this.revision = response.revision;
    }

    this.total = response.total;
    const nextMonths = response.months.map(month => ({ ...month }));
    // Range responses repeat the complete month index. Preserve the existing
    // array when its values did not change so a chunk arriving cannot rebuild
    // the gallery layout (and reset viewport pinning) on every response.
    if (!monthLayoutsEqual(this.months, nextMonths)) this.months = nextMonths;
    for (let index = this.total; index < requestedRange.end; index += 1) {
      this.slots.delete(index);
    }
    const responseEnd = Math.min(response.range.end, response.total);
    for (let index = requestedRange.start; index < Math.min(requestedRange.end, response.total); index += 1) {
      const item = response.images[index - response.range.start];
      if (item) {
        this.slots.set(index, { index, status: 'ready', item });
        if (/^#[0-9A-Fa-f]{6}$/.test(item.dominant_color ?? '')) {
          this.placeholderColors.set(index, item.dominant_color!);
        }
      } else if (index < responseEnd) {
        this.slots.set(index, { index, status: 'error' });
      }
    }

    const expectedEnd = Math.min(requestedRange.end, response.total);
    const complete = expectedEnd <= requestedRange.start
      || this.snapshotRangeReady(requestedRange.start, expectedEnd);
    const record: ChunkRecord = {
      key: chunkKey(requestedRange),
      start: requestedRange.start,
      end: requestedRange.end,
      complete,
      lastUsed: ++this.sequence,
    };
    this.chunks.set(record.key, record);
    this.evictIfNeeded();
    this.publish();
    if (!complete) {
      throw new InvalidMediaRangeResponseError('Media range response omitted an item inside its declared range.');
    }
  }

  private snapshotRangeReady(start: number, end: number) {
    for (let index = start; index < end; index += 1) {
      if (this.slots.get(index)?.status !== 'ready') return false;
    }
    return true;
  }

  private abortPending(exceptKey?: string) {
    for (const [key, pending] of this.pending) {
      if (key === exceptKey) continue;
      pending.controller.abort();
      this.pending.delete(key);
      const range = this.getChunkRanges({
        start: pending.key.split(':').map(Number)[0] ?? 0,
        end: pending.key.split(':').map(Number)[1] ?? 0,
      })[0];
      if (range) {
        const end = this.total > 0 ? Math.min(range.end, this.total) : range.end;
        for (let index = range.start; index < end; index += 1) {
          if (this.slots.get(index)?.status === 'loading') this.slots.set(index, createUnloadedSlot(index));
        }
      }
    }
    this.publish();
  }

  private preemptLowerPriorityRequests(intent: LoadIntent) {
    const priority = INTENT_PRIORITY[intent];
    let changed = false;
    for (const [key, pending] of this.pending) {
      if (INTENT_PRIORITY[pending.intent] <= priority) continue;
      changed = true;
      pending.controller.abort();
      this.pending.delete(key);
      const [startValue, endValue] = key.split(':').map(Number);
      const start = Number.isFinite(startValue) ? startValue : 0;
      const end = Number.isFinite(endValue) ? endValue : start;
      for (let index = start; index < Math.min(end, this.total || end); index += 1) {
        if (this.slots.get(index)?.status === 'loading') this.slots.set(index, createUnloadedSlot(index));
      }
    }
    if (changed) this.publish();
  }

  private preemptStaleScrubPreviews(keepRange: MediaRange) {
    let changed = false;
    for (const [key, pending] of this.pending) {
      if (pending.intent !== 'scrub-preview') continue;
      const range = chunkRangeFromKey(key);
      if (rangesOverlap(range, keepRange)) continue;

      changed = true;
      pending.controller.abort();
      this.pending.delete(key);
      const end = this.total > 0 ? Math.min(range.end, this.total) : range.end;
      for (let index = range.start; index < end; index += 1) {
        if (this.slots.get(index)?.status === 'loading') this.slots.set(index, createUnloadedSlot(index));
      }
    }
    if (changed) this.publish();
  }

  private evictIfNeeded() {
    while (this.chunks.size > this.maxChunks) {
      const candidate = Array.from(this.chunks.values())
        .filter(chunk => !this.isChunkPinned(chunk) && !this.pending.has(chunk.key))
        .sort((left, right) => left.lastUsed - right.lastUsed)[0];
      if (!candidate) return;
      this.chunks.delete(candidate.key);
      const end = this.total > 0 ? Math.min(candidate.end, this.total) : candidate.end;
      for (let index = candidate.start; index < end; index += 1) {
        const current = this.slots.get(index);
        if (current?.status === 'ready') this.slots.delete(index);
      }
    }
  }
}

export const createGlobalMediaWindow = (options: GlobalMediaWindowOptions) => (
  new GlobalMediaWindow(options)
);
