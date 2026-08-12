import { Artist } from '../types';

/** Use the folder scope for selection while retaining member_id as metadata. */
export const getArtistScopeKey = (artist: Pick<Artist, 'folder_id' | 'scope_key' | 'member_id'>): string => (
  artist.folder_id || artist.scope_key || String(artist.member_id)
);
