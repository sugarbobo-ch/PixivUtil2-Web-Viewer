import { normalizeSelectedMonths } from './timeFilters';

export interface FilterUrlState {
  selectedMonths: string[];
  selectedArtist: string | null;
  searchQuery: string;
}

const emptyFilterUrlState: FilterUrlState = {
  selectedMonths: [],
  selectedArtist: null,
  searchQuery: '',
};

export const parseFilterUrl = (href?: string): FilterUrlState => {
  const source = href ?? (typeof window === 'undefined' ? null : window.location.href);
  if (!source) return { ...emptyFilterUrlState };

  const params = new URL(source, 'http://localhost').searchParams;
  const folderValue = params.get('folder_id');
  const artistValue = params.get('artist_id');

  let selectedArtist: string | null = null;

  const rawFolderUuid = folderValue
    ? (folderValue.startsWith('folder:') ? folderValue.slice(7) : folderValue)
    : null;
  const isRawFolderUuid = rawFolderUuid !== null && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(rawFolderUuid);

  if (isRawFolderUuid) {
    selectedArtist = `folder:${rawFolderUuid}`;
  } else if (artistValue && artistValue !== '0') {
    const isLegacyMemberId = /^-?\d+$/.test(artistValue);
    const isScopeKey = /^artist:[a-f\d]{40}$/i.test(artistValue);
    const isFolderId = /^folder:[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(artistValue);
    const isBareUuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(artistValue);

    if (isLegacyMemberId || isScopeKey || isFolderId) {
      selectedArtist = artistValue;
    } else if (isBareUuid) {
      selectedArtist = `folder:${artistValue}`;
    }
  }

  const selectedMonths = normalizeSelectedMonths(Array.from(new Set(
    params.getAll('month')
      .flatMap(value => value.split(','))
      .map(value => value.trim())
      .filter(Boolean),
  )));

  return {
    selectedMonths,
    selectedArtist,
    searchQuery: params.get('search') ?? '',
  };
};

export const syncFilterUrl = (state: FilterUrlState) => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const normalizedSelectedMonths = normalizeSelectedMonths(state.selectedMonths);
  if (normalizedSelectedMonths.length > 0) {
    url.searchParams.set('month', normalizedSelectedMonths.join(','));
  } else {
    url.searchParams.delete('month');
  }

  if (state.selectedArtist !== null) {
    if (state.selectedArtist.startsWith('folder:')) {
      url.searchParams.set('folder_id', state.selectedArtist.slice(7));
      url.searchParams.delete('artist_id');
    } else {
      url.searchParams.set('artist_id', String(state.selectedArtist));
      url.searchParams.delete('folder_id');
    }
  } else {
    url.searchParams.delete('artist_id');
    url.searchParams.delete('folder_id');
  }

  if (state.searchQuery) {
    url.searchParams.set('search', state.searchQuery);
  } else {
    url.searchParams.delete('search');
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
};
