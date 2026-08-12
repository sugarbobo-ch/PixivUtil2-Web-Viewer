import { describe, expect, it } from 'vitest';
import { LibraryJob } from '../types';
import {
  getLibraryJobStatusDescription,
  getLibraryJobStatusTitle,
} from './libraryJobPresentation';

const createJob = (overrides: Partial<LibraryJob> = {}): LibraryJob => ({
  job_id: 'presentation-test',
  job_type: 'update-library',
  status: 'running',
  phase: 'indexing',
  directory: 'C:/media',
  analyze_colors: true,
  discovered: 10,
  total: 10,
  processed: 4,
  added: 0,
  updated: 0,
  unchanged: 4,
  conflicts: 0,
  errors: 0,
  colors_created: 0,
  colors_reused: 0,
  cache_moved: 0,
  current_file: 'image.jpg',
  error_message: null,
  cancel_requested: false,
  created_at: '2026-08-10T00:00:00Z',
  started_at: '2026-08-10T00:00:01Z',
  finished_at: null,
  updated_at: '2026-08-10T00:00:02Z',
  ...overrides,
});

describe('library job presentation', () => {
  it('renders interrupted jobs as an actionable terminal state', () => {
    const job = createJob({
      status: 'interrupted',
      phase: 'interrupted',
      error_message: 'Backend restarted; run the library job again',
    });

    expect(getLibraryJobStatusTitle(job)).toBe('圖片資料庫更新被中斷');
    expect(getLibraryJobStatusDescription(job)).toBe('Backend restarted; run the library job again');
  });

  it('keeps cache job copy distinct from image-library copy', () => {
    const job = createJob({
      job_type: 'organize-thumbnail-cache',
      status: 'cancelled',
      phase: 'cancelled',
      cache_moved: 3,
    });

    expect(getLibraryJobStatusTitle(job)).toBe('縮圖整理已取消');
    expect(getLibraryJobStatusDescription(job)).toBe('已保留完成的整理：移出 3 個縮圖。');
  });
});
