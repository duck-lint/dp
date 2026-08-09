import { useEffect, useMemo, useState } from 'react';
import type { ExactCardinalityState } from './exact-cardinality';
import { createExactCardinalityCoordinator } from './exact-cardinality';

const createBrowserWorker = () =>
  new Worker(new URL('./cardinality.worker.ts', import.meta.url), {
    type: 'module',
  });

export const useExactCardinality = (
  rows: number[][],
  columns: number[][],
): ExactCardinalityState => {
  const [state, setState] = useState<ExactCardinalityState>({
    status: 'pending',
  });
  const coordinator = useMemo(
    () =>
      createExactCardinalityCoordinator({
        createWorker: createBrowserWorker,
        onState: setState,
      }),
    [],
  );

  useEffect(() => {
    coordinator.update(rows, columns);
  }, [columns, coordinator, rows]);

  useEffect(() => () => coordinator.dispose(), [coordinator]);

  return state;
};
