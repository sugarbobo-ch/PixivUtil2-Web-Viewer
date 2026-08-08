import { useEffect, useState } from 'react';

export type ImagePriority = 0 | 1 | 2 | 3;
export type ImageKind = 'thumbnail' | 'original';
export type ImageOwner = 'grid' | 'month-navigation' | 'filmstrip' | 'fullscreen' | 'webtoon';

interface ImageLoadTask {
  url: string;
  priority: ImagePriority;
  kind: ImageKind;
  owner: ImageOwner;
}

interface Consumer {
  id: number;
  task: ImageLoadTask;
  resolveAdmission: () => void;
  cancelled: boolean;
  admitted: boolean;
}

interface RecordEntry {
  url: string;
  kind: ImageKind;
  consumers: Map<number, Consumer>;
  started: boolean;
  loaded: boolean;
  active: boolean;
  preloader?: HTMLImageElement;
}

interface TaskHandle {
  admitted: Promise<void>;
  cancel: () => void;
  promote: (priority: ImagePriority) => void;
}

export interface ImagePreloadHandle {
  promise: Promise<void>;
  cancel: () => void;
}

const MAX_ACTIVE: Record<ImageKind, number> = {
  // A viewport commonly contains 20–30 cards. Keep enough thumbnail slots
  // open that a scrub jump can fill the visible row in one network wave,
  // while originals remain strictly limited below.
  thumbnail: 12,
  original: 2,
};

export class ImageLoadScheduler {
  private records = new Map<string, RecordEntry>();
  private loadedUrls = new Map<string, number>();
  private nextConsumerId = 1;
  private activeCount: Record<ImageKind, number> = { thumbnail: 0, original: 0 };
  private pausedOwners = new Set<ImageOwner>();
  private readonly maxLoadedUrls = 384;
  private pumpScheduled = false;

  request(task: ImageLoadTask): TaskHandle {
    const existing = this.records.get(task.url);
    const isLoaded = this.loadedUrls.has(task.url) || existing?.loaded;
    let resolveAdmission!: () => void;
    const admitted = new Promise<void>(resolve => {
      resolveAdmission = resolve;
    });
    const id = this.nextConsumerId++;
    const consumer: Consumer = {
      id,
      task,
      resolveAdmission,
      cancelled: false,
      admitted: false,
    };

    if (isLoaded) {
      consumer.admitted = true;
      queueMicrotask(resolveAdmission);
    } else {
      const record = existing ?? {
        url: task.url,
        kind: task.kind,
        consumers: new Map<number, Consumer>(),
        started: false,
        loaded: false,
        active: false,
      };
      record.consumers.set(id, consumer);
      this.records.set(task.url, record);
      if (record.started) {
        consumer.admitted = true;
        queueMicrotask(resolveAdmission);
      } else {
        this.schedulePump();
      }
    }

    return {
      admitted,
      cancel: () => {
        consumer.cancelled = true;
        const record = this.records.get(task.url);
        record?.consumers.delete(id);
        this.removeIfUnused(record);
        this.schedulePump();
      },
      promote: (priority: ImagePriority) => {
        consumer.task = { ...consumer.task, priority };
        this.schedulePump();
      },
    };
  }

  isLoaded(url: string) {
    return this.loadedUrls.has(url) || this.records.get(url)?.loaded === true;
  }

  preload(task: ImageLoadTask): ImagePreloadHandle {
    const handle = this.request(task);
    let settled = false;
    let resolvePreload!: () => void;
    const promise = new Promise<void>(resolve => {
      resolvePreload = resolve;
      handle.admitted.then(() => {
        if (settled) return;
        const record = this.records.get(task.url);
        if (!record || record.loaded) {
          settled = true;
          resolve();
          return;
        }

        const image = new Image();
        image.decoding = 'async';
        image.fetchPriority = task.priority <= 1 ? 'high' : 'low';
        record.preloader = image;
        const finish = (success: boolean) => {
          if (settled) return;
          settled = true;
          image.onload = null;
          image.onerror = null;
          this.markFinished(task.url, success);
          resolve();
        };
        image.onload = () => finish(true);
        image.onerror = () => finish(false);
        image.src = task.url;
      });
    });
    return {
      promise,
      cancel: () => {
        if (settled) return;
        settled = true;
        handle.cancel();
        resolvePreload();
      },
    };
  }

  markLoaded(url: string) {
    this.markFinished(url, true);
  }

  markFinished(url: string, cacheResult: boolean) {
    const record = this.records.get(url);
    if (record?.loaded) return;
    if (record && !cacheResult) {
      this.releaseActive(record);
      record.preloader = undefined;
      record.consumers.clear();
      this.records.delete(url);
      this.schedulePump();
      return;
    }
    if (record) {
      record.loaded = true;
      this.releaseActive(record);
      for (const consumer of record.consumers.values()) consumer.admitted = true;
    }
    if (!cacheResult) {
      this.schedulePump();
      return;
    }
    this.loadedUrls.delete(url);
    this.loadedUrls.set(url, Date.now());
    while (this.loadedUrls.size > this.maxLoadedUrls) {
      const oldest = this.loadedUrls.keys().next().value as string | undefined;
      if (!oldest) break;
      this.loadedUrls.delete(oldest);
    }
    this.schedulePump();
  }

  pauseOwner(owner: ImageOwner) {
    this.pausedOwners.add(owner);
  }

  resumeOwner(owner: ImageOwner) {
    this.pausedOwners.delete(owner);
    this.schedulePump();
  }

  cancelOwner(owner: ImageOwner) {
    for (const [url, record] of this.records) {
      for (const consumer of record.consumers.values()) {
        if (consumer.task.owner === owner && !record.started) {
          consumer.cancelled = true;
          record.consumers.delete(consumer.id);
        }
      }
      this.removeIfUnused(record);
      if (!this.records.has(url)) continue;
    }
    this.schedulePump();
  }

  private schedulePump() {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }

  private pump() {
    const candidates = Array.from(this.records.values())
      .filter(record => !record.started && !record.loaded)
      .map(record => {
        const consumers = Array.from(record.consumers.values())
          .filter(consumer => !consumer.cancelled && !this.pausedOwners.has(consumer.task.owner));
        if (consumers.length === 0) return null;
        const best = consumers.reduce((winner, current) => (
          current.task.priority < winner.task.priority ? current : winner
        ));
        return { record, best };
      })
      .filter((entry): entry is { record: RecordEntry; best: Consumer } => entry !== null)
      .sort((a, b) => a.best.task.priority - b.best.task.priority);

    for (const { record } of candidates) {
      if (this.activeCount[record.kind] >= MAX_ACTIVE[record.kind]) continue;
      record.started = true;
      record.active = true;
      this.activeCount[record.kind] += 1;
      for (const consumer of record.consumers.values()) {
        if (!consumer.cancelled && !consumer.admitted) {
          consumer.admitted = true;
          consumer.resolveAdmission();
        }
      }
    }
  }

  private removeIfUnused(record: RecordEntry | undefined) {
    if (!record || record.consumers.size > 0) return;
    this.releaseActive(record);
    if (record.preloader) {
      record.preloader.onload = null;
      record.preloader.onerror = null;
      record.preloader.src = '';
      record.preloader = undefined;
    }
    this.records.delete(record.url);
  }

  private releaseActive(record: RecordEntry) {
    if (!record.active) return;
    record.active = false;
    this.activeCount[record.kind] = Math.max(0, this.activeCount[record.kind] - 1);
  }
}

export const imageLoadScheduler = new ImageLoadScheduler();

export const useImageLoadPermission = ({
  url,
  priority,
  kind,
  owner,
  enabled = true,
}: ImageLoadTask & { enabled?: boolean }) => {
  const [admitted, setAdmitted] = useState(() => imageLoadScheduler.isLoaded(url));

  useEffect(() => {
    if (!enabled || !url) {
      setAdmitted(false);
      return undefined;
    }

    let active = true;
    const handle = imageLoadScheduler.request({ url, priority, kind, owner });
    handle.admitted.then(() => {
      if (active) setAdmitted(true);
    });

    return () => {
      active = false;
      handle.cancel();
    };
  }, [enabled, kind, owner, priority, url]);

  return admitted;
};
