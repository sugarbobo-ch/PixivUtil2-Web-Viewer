import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GalleryThumbnail } from './GalleryThumbnail';

const renderThumbnail = (dominantColor?: string) => render(
  <GalleryThumbnail
    src="/api/thumbnail?image_id=1"
    alt="Test image"
    priority={1}
    loadEnabled={false}
    blurEnabled={false}
    demoMode={false}
    dominantColor={dominantColor}
  />,
);

describe('GalleryThumbnail loading placeholder', () => {
  it('shows the precomputed dominant color without covering it with a skeleton', () => {
    const { container } = renderThumbnail('#123456');

    const thumbnail = container.querySelector<HTMLElement>('.gallery-thumbnail');
    expect(thumbnail?.style.getPropertyValue('--gallery-thumbnail-dominant')).toBe('#123456');
    expect(container.querySelector('.gallery-thumbnail__skeleton')).toBeNull();
  });

  it('falls back to the skeleton when no valid dominant color is available', () => {
    const { container } = renderThumbnail();

    expect(container.querySelector('.gallery-thumbnail__skeleton')).not.toBeNull();
  });
});
