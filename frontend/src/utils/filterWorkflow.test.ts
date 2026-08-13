import { describe, expect, it } from 'vitest';
import { parseFilterUrl, syncFilterUrl } from './filterWorkflow';
import { resolveMonthTarget, sortMonthIndexItems } from './monthNavigation';

describe('filter and month workflow helpers', () => {
  it('normalizes repeated URL filters and rejects invalid artist ids', () => {
    const state = parseFilterUrl('http://localhost/?month=2024-02,2024-01&month=2024-02&artist_id=abc&search=blue');
    expect(state).toEqual({
      selectedMonths: ['2024-02', '2024-01'],
      selectedArtist: null,
      searchQuery: 'blue',
    });
  });

  it('writes shareable filter state without disturbing the path or hash', () => {
    window.history.replaceState({}, '', '/gallery#top');
    syncFilterUrl({ selectedMonths: ['2024-02'], selectedArtist: '42', searchQuery: 'blue sky' });
    expect(window.location.pathname).toBe('/gallery');
    expect(window.location.hash).toBe('#top');
    expect(window.location.search).toBe('?month=2024-02&artist_id=42&search=blue+sky');
  });

  it('accepts permanent managed-folder ids in shared URLs via folder_id or legacy artist_id', () => {
    const rawUuid = '550e8400-e29b-41d4-a716-446655440000';
    const folderId = `folder:${rawUuid}`;
    expect(parseFilterUrl(`http://localhost/?folder_id=${encodeURIComponent(rawUuid)}`).selectedArtist)
      .toBe(folderId);
    expect(parseFilterUrl(`http://localhost/?artist_id=${encodeURIComponent(folderId)}`).selectedArtist)
      .toBe(folderId);
  });

  it('writes folder_id for folder selection state', () => {
    window.history.replaceState({}, '', '/gallery');
    const folderId = 'folder:550e8400-e29b-41d4-a716-446655440000';
    syncFilterUrl({ selectedMonths: [], selectedArtist: folderId, searchQuery: '' });
    expect(window.location.search).toBe('?folder_id=550e8400-e29b-41d4-a716-446655440000');
  });

  it('sorts month index consistently with gallery sort mode', () => {
    const items = [
      { key: '2024-01', label: '2024/01', count: 2 },
      { key: '2024-03', label: '2024/03', count: 4 },
      { key: '2024-02', label: '2024/02', count: 1 },
    ];
    expect(sortMonthIndexItems(items, 'oldest_month').map(item => item.key)).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(sortMonthIndexItems(items, 'newest_month').map(item => item.key)).toEqual(['2024-03', '2024-02', '2024-01']);
  });

  it('uses API offsets when present and count offsets as a safe fallback', () => {
    const items = [
      { key: '2024-03', label: '2024/03', count: 4 },
      { key: '2024-02', label: '2024/02', count: 2 },
      { key: '2024-01', label: '2024/01', count: 3 },
    ];
    expect(resolveMonthTarget(items[2], items, 4)).toEqual({ offset: 6, page: 2, localIndex: 2 });
    expect(resolveMonthTarget({ ...items[1], offset: 9 }, items, 4)).toEqual({ offset: 9, page: 3, localIndex: 1 });
  });
});
