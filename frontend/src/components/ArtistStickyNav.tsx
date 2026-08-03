import React, { useEffect, useState } from 'react';
import { ExternalLink, FilterX } from 'lucide-react';
import { Artist } from '../types';
import { fetchArtistSourceLinks } from '../utils/sourceLinks';

interface ArtistStickyNavProps {
  artist: Artist | null;
  onClearArtist?: () => void;
}

const removeMemberSuffix = (name: string, memberId: number) => {
  const suffixPattern = new RegExp(`\\s*(?:\\(|\\[)?${memberId}(?:\\)|\\])?\\s*$`);
  return name.replace(suffixPattern, '').trim();
};

const getArtistDisplayName = (artist: Artist) => {
  const sourceName = artist.name?.trim() || '';
  const cleanedName = removeMemberSuffix(sourceName, artist.member_id)
    .replace(/^(?:Discord\s+)?FANBOX\s+Archive\s+/i, '')
    .replace(/^FANBOX\s+/i, '')
    .replace(/\s*(?:\(|\[)?\d{3,}(?:\)|\])?\s*$/, '')
    .trim();

  return cleanedName || `繪師 ${artist.member_id}`;
};

export const ArtistStickyNav: React.FC<ArtistStickyNavProps> = ({ artist, onClearArtist }) => {
  const [artistSources, setArtistSources] = useState<Awaited<ReturnType<typeof fetchArtistSourceLinks>>>(null);

  useEffect(() => {
    let cancelled = false;
    setArtistSources(null);

    if (!artist || artist.member_id <= 0) return undefined;

    fetchArtistSourceLinks(artist.member_id).then(sources => {
      if (!cancelled) setArtistSources(sources);
    });

    return () => {
      cancelled = true;
    };
  }, [artist?.member_id]);

  const hasArtist = Boolean(artist && artist.member_id > 0);
  const displayName = artist && artist.member_id > 0
    ? getArtistDisplayName(artist)
    : '全部繪師';
  const verifiedMemberId = artistSources?.verified_member_id;
  const pixivUrl = artistSources?.pixiv?.url
    ?? (verifiedMemberId ? `https://www.pixiv.net/users/${verifiedMemberId}` : null);
  const fanboxUrl = artistSources?.fanbox?.url ?? null;

  return (
    <nav className="artist-sticky-nav" aria-label="目前繪師">
      <div
        className="artist-sticky-nav__current"
        role="group"
        aria-label={`目前繪師：${displayName}`}
      >
        {hasArtist && pixivUrl ? (
          <a
            href={pixivUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="artist-sticky-nav__artist-link"
            aria-label={`在 Pixiv 開啟 ${displayName} @${verifiedMemberId}`}
            title={`在 Pixiv 開啟 ${displayName}`}
          >
            <span className="artist-sticky-nav__name">{displayName}</span>
            <span className="artist-sticky-nav__id">@{verifiedMemberId}</span>
          </a>
        ) : (
          <span className="artist-sticky-nav__artist-link is-static" aria-label={`目前繪師：${displayName}`}>
            <span className="artist-sticky-nav__name">{displayName}</span>
            {verifiedMemberId && <span className="artist-sticky-nav__id">@{verifiedMemberId}</span>}
          </span>
        )}
        {hasArtist && fanboxUrl && (
          <a
            href={fanboxUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="artist-sticky-nav__platform-link"
            aria-label={`在 FANBOX 開啟 ${displayName}`}
            title={`在 FANBOX 開啟 ${displayName}`}
          >
            <span>FANBOX</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        {hasArtist && onClearArtist && (
          <button
            type="button"
            className="artist-sticky-nav__clear"
            onClick={onClearArtist}
            aria-label={`清除繪師篩選：${displayName}`}
            title="清除繪師篩選"
          >
            <FilterX className="h-5 w-5" aria-hidden="true" />
            <span>清除繪師篩選</span>
          </button>
        )}
      </div>
    </nav>
  );
};
