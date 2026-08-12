import { describe, expect, it } from 'vitest';
import { getFanboxFolderPrefix, stripArtistFolderPrefix } from './artistDisplay';

describe('artist display prefix', () => {
  it('reads the literal prefix before the FANBOX artist token', () => {
    expect(getFanboxFolderPrefix({
      FANBOX: {
        filenameformatfanboxcontent: 'FANBOX %artist% (%member_id%)\\%urlFilename%',
      },
    })).toBe('FANBOX');
  });

  it('accepts the original config casing and formats without a prefix', () => {
    expect(getFanboxFolderPrefix({
      fanbox: {
        filenameFormatFanboxContent: '%artist% (%member_id%)\\%urlFilename%',
      },
    })).toBe('');
  });

  it('strips only a configured prefix at a word boundary', () => {
    expect(stripArtistFolderPrefix('FANBOX comodox (4252792)', 'FANBOX'))
      .toBe('comodox (4252792)');
    expect(stripArtistFolderPrefix('FANBOXer (4252792)', 'FANBOX'))
      .toBe('FANBOXer (4252792)');
  });
});
