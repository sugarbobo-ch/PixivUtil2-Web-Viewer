import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { ArtistStickyNav } from './ArtistStickyNav';

const fetchArtistSourceLinks = vi.fn();

vi.mock('../utils/sourceLinks', () => ({
  fetchArtistSourceLinks: (...args: unknown[]) => fetchArtistSourceLinks(...args),
}));

describe('ArtistStickyNav source links', () => {
  beforeEach(() => {
    fetchArtistSourceLinks.mockReset();
    fetchArtistSourceLinks.mockResolvedValue({
      verified_member_id: 12345,
      pixiv: {
        platform: 'pixiv',
        url: 'https://www.pixiv.net/users/12345',
        source_id: '12345',
        verified: true,
      },
      fanbox: {
        platform: 'fanbox',
        url: 'https://creator.fanbox.cc/',
        source_id: '12345',
        verified: true,
      },
    });
  });

  it('keeps the artist-name button on Pixiv even for a FANBOX folder', async () => {
    render(
      <I18nProvider initialLanguage="zh-TW">
        <ArtistStickyNav artist={{
          folder_id: 'folder:fanbox',
          member_id: 12345,
          name: 'FANBOX Example (12345)',
          artwork_count: 1,
          source_kind: 'fanbox',
          identity_status: 'inferred',
        }} />
      </I18nProvider>,
    );

    await waitFor(() => expect(fetchArtistSourceLinks).toHaveBeenCalledWith('folder:fanbox'));
    const artistLink = await screen.findByRole('link', { name: /Pixiv/ });
    expect(artistLink.getAttribute('href')).toBe('https://www.pixiv.net/users/12345');
    expect(screen.getByRole('link', { name: /FANBOX/ }).getAttribute('href'))
      .toBe('https://creator.fanbox.cc/');
  });

  it('keeps the artist text static when Pixiv ID is unavailable', async () => {
    fetchArtistSourceLinks.mockResolvedValueOnce({
      verified_member_id: null,
      pixiv: null,
      fanbox: {
        platform: 'fanbox',
        url: 'https://creator.fanbox.cc/',
        source_id: 'creator',
        verified: true,
      },
    });

    render(
      <I18nProvider initialLanguage="zh-TW">
        <ArtistStickyNav artist={{
          folder_id: 'folder:fanbox-only',
          member_id: 912345678,
          name: 'Synthetic Test Creator',
          artwork_count: 1,
          source_kind: 'fanbox',
          identity_status: 'unknown',
        }} />
      </I18nProvider>,
    );

    await waitFor(() => expect(fetchArtistSourceLinks).toHaveBeenCalledWith('folder:fanbox-only'));
    const artistText = screen.getByText('Synthetic Test Creator');
    expect(artistText.closest('a')).toBeNull();
    expect(screen.queryByText('@912345678')).toBeNull();
    expect(screen.queryByRole('link', { name: /Pixiv/ })).toBeNull();
    expect(screen.getByRole('link', { name: /FANBOX/ }).getAttribute('href'))
      .toBe('https://creator.fanbox.cc/');
  });

  it('keeps the all-artists label as plain text', () => {
    render(
      <I18nProvider initialLanguage="zh-TW">
        <ArtistStickyNav artist={null} />
      </I18nProvider>,
    );

    const allArtistsText = screen.getByText('全部繪師');
    expect(allArtistsText.closest('a')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
