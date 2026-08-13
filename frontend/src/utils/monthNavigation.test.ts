import { describe, expect, it } from 'vitest';
import { getCrossPageMonthApproachTop } from './monthNavigation';

describe('cross-page month navigation approach', () => {
  it('starts moving toward later pages before their data is available', () => {
    expect(getCrossPageMonthApproachTop({
      currentPage: 1,
      targetPage: 30,
      scrollHeight: 12_507,
      clientHeight: 597,
    })).toBe(11_910);
  });

  it('starts moving upward for an earlier page and skips same-page jumps', () => {
    expect(getCrossPageMonthApproachTop({
      currentPage: 30,
      targetPage: 1,
      scrollHeight: 4_905,
      clientHeight: 597,
    })).toBe(0);
    expect(getCrossPageMonthApproachTop({
      currentPage: 4,
      targetPage: 4,
      scrollHeight: 4_905,
      clientHeight: 597,
    })).toBeNull();
  });
});
