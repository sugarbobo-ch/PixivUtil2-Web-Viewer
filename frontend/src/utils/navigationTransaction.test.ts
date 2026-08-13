import { describe, expect, it } from 'vitest';
import { createNavigationTransactionController } from './navigationTransaction';

describe('navigation transaction', () => {
  it('accepts only monotonic positions for the active transaction', () => {
    const controller = createNavigationTransactionController();
    const transaction = controller.begin({ currentTop: 4308, targetTop: 0 });

    expect(controller.commit(transaction, 3200)).toBe(3200);
    expect(controller.commit(transaction, 3100)).toBe(3100);
    expect(controller.commit(transaction, 3201)).toBe(3100);
    expect(controller.commit(transaction, -20)).toBe(0);
  });

  it('invalidates callbacks from a previous owner when a new jump starts', () => {
    const controller = createNavigationTransactionController();
    const first = controller.begin({ currentTop: 0, targetTop: 12_000 });
    const second = controller.begin({ currentTop: 240, targetTop: 0 });

    expect(controller.commit(first, 600)).toBeNull();
    expect(controller.commit(second, 120)).toBe(120);
  });

  it('does not manufacture movement for an already-aligned target', () => {
    const controller = createNavigationTransactionController();
    const transaction = controller.begin({ currentTop: 500, targetTop: 500 });

    expect(transaction.direction).toBe('none');
    expect(controller.commit(transaction, 500)).toBe(500);
    expect(controller.commit(transaction, 501)).toBe(500);
  });
});
