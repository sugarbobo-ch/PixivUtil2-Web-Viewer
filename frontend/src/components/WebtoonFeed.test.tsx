import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImageItem } from '../types';
import { WebtoonFeed } from './WebtoonFeed';

const createImage = (imageId: number): ImageItem => ({
  image_id: imageId,
  member_id: 100 + imageId,
  title: `Image ${imageId}`,
  save_name: `artist/image-${imageId}.jpg`,
  created_date: '2026-08-10',
  last_update_date: '2026-08-10',
});

describe('WebtoonFeed toolbar regression', () => {
  it('keeps the current / total page indicator while the toolbar collapses', async () => {
    const main = document.createElement('main');
    document.body.appendChild(main);

    render(
      <WebtoonFeed
        images={[createImage(1)]}
        demoMode
        thumbnailSize={320}
        imageScale={80}
        imageGap={24}
        showInfo={false}
        showPageNumber
        showThumbnails={false}
        totalImages={4}
        currentPage={2}
        totalPages={4}
      />,
      { container: main },
    );

    expect(screen.getByText('1 / 4')).toBeTruthy();
    expect(screen.getByDisplayValue('2')).toBeTruthy();
    expect(screen.getByText('/ 4')).toBeTruthy();

    fireEvent.scroll(main);
    await waitFor(() => {
      const controls = document.querySelector('.webtoon-quick-toolbar__controls');
      expect(controls?.classList.contains('is-scrolling')).toBe(true);
    });

    const revealButton = document.querySelector<HTMLButtonElement>('.webtoon-quick-toolbar__reveal');
    expect(revealButton).toBeTruthy();
    if (!revealButton) throw new Error('collapsed toolbar reveal button was not rendered');
    fireEvent.click(revealButton);
    expect(document.querySelector('.webtoon-quick-toolbar__controls')?.classList.contains('is-scrolling')).toBe(false);

    main.remove();
  });
});
