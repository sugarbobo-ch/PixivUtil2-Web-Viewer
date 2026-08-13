export type NavigationDirection = 'up' | 'down' | 'none';

export interface NavigationTransaction {
  id: number;
  startTop: number;
  targetTop: number;
  direction: NavigationDirection;
  lastCommittedTop: number;
}

export interface NavigationTransactionController {
  begin(input: { currentTop: number; targetTop: number }): NavigationTransaction;
  commit(transaction: NavigationTransaction, requestedTop: number): number | null;
  cancel(transaction: NavigationTransaction): void;
}

const finiteNonNegative = (value: number) => (
  Number.isFinite(value) ? Math.max(0, value) : 0
);

export const createNavigationTransactionController = (): NavigationTransactionController => {
  let nextId = 0;
  let activeId: number | null = null;

  return {
    begin: ({ currentTop, targetTop }) => {
      const start = finiteNonNegative(currentTop);
      const target = finiteNonNegative(targetTop);
      const direction: NavigationDirection = target > start
        ? 'down'
        : target < start
          ? 'up'
          : 'none';
      const transaction: NavigationTransaction = {
        id: ++nextId,
        startTop: start,
        targetTop: target,
        direction,
        lastCommittedTop: start,
      };
      activeId = transaction.id;
      return transaction;
    },

    commit: (transaction, requestedTop) => {
      if (activeId !== transaction.id) return null;

      const requested = finiteNonNegative(requestedTop);
      let nextTop = transaction.lastCommittedTop;
      if (transaction.direction === 'down') {
        nextTop = Math.max(transaction.lastCommittedTop, requested);
      } else if (transaction.direction === 'up') {
        nextTop = Math.min(transaction.lastCommittedTop, requested);
      }

      transaction.lastCommittedTop = nextTop;
      return nextTop;
    },

    cancel: transaction => {
      if (activeId === transaction.id) activeId = null;
    },
  };
};
