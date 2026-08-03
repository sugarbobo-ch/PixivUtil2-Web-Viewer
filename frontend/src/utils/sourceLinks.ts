import { ArtistSourceLinks, SourceLink } from '../types';

const sourceLinkRequests = new Map<string, Promise<SourceLink | null>>();
const artistSourceRequests = new Map<string, Promise<ArtistSourceLinks | null>>();

const isSourceLink = (value: unknown): value is SourceLink => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SourceLink>;
  return (
    (candidate.platform === 'pixiv' || candidate.platform === 'fanbox') &&
    typeof candidate.url === 'string' &&
    typeof candidate.source_id === 'string' &&
    candidate.verified === true
  );
};

const requestJson = async (url: string): Promise<unknown> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchSourceLink = (path: string): Promise<SourceLink | null> => {
  const key = path.trim();
  if (!key) return Promise.resolve(null);

  const cached = sourceLinkRequests.get(key);
  if (cached) return cached;

  const request = requestJson(`/api/source-link?path=${encodeURIComponent(key)}`).then(value => (
    isSourceLink(value) ? value : null
  ));
  sourceLinkRequests.set(key, request);
  return request;
};

export const fetchFirstSourceLink = async (paths: readonly string[]): Promise<SourceLink | null> => {
  for (const path of paths) {
    const link = await fetchSourceLink(path);
    if (link) return link;
  }
  return null;
};

export const fetchArtistSourceLinks = (artistId: number): Promise<ArtistSourceLinks | null> => {
  const key = String(artistId);
  const cached = artistSourceRequests.get(key);
  if (cached) return cached;

  const request = requestJson(`/api/artist-source-link?artist_id=${encodeURIComponent(key)}`).then(value => {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<ArtistSourceLinks>;
    const verifiedMemberId = candidate.verified_member_id;
    if (typeof verifiedMemberId !== 'number' || !Number.isInteger(verifiedMemberId) || verifiedMemberId <= 0) {
      return null;
    }

    return {
      verified_member_id: verifiedMemberId,
      pixiv: isSourceLink(candidate.pixiv) ? candidate.pixiv : null,
      fanbox: isSourceLink(candidate.fanbox) ? candidate.fanbox : null,
    };
  });
  artistSourceRequests.set(key, request);
  return request;
};
