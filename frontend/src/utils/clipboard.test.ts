import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard, getParentPath } from './clipboard';

describe('clipboard helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gets the parent folder for relative and Windows paths', () => {
    expect(getParentPath('artist/image.jpg')).toBe('artist');
    expect(getParentPath('C:\\media\\artist\\image.jpg')).toBe('C:\\media\\artist');
    expect(getParentPath('image.jpg')).toBe('');
  });

  it('uses the browser clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await copyTextToClipboard('artist/image.jpg');

    expect(writeText).toHaveBeenCalledWith('artist/image.jpg');
    if (previousClipboard) {
      Object.defineProperty(navigator, 'clipboard', previousClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});
