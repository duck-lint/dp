import type {
  CardinalityResult,
  SolutionCount,
} from '../domain/puzzle-analysis';

export type ExactCardinalityStatus = 'pending' | 'checking' | 'ready' | 'error';

export type ExactCardinalityState = {
  status: ExactCardinalityStatus;
  count?: SolutionCount;
};

type WorkerLike = {
  onmessage: ((event: MessageEvent<CardinalityResult>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
};

type CoordinatorOptions = {
  createWorker: () => WorkerLike;
  debounceMs?: number;
  onState: (state: ExactCardinalityState) => void;
};

export type ExactCardinalityCoordinator = {
  update(rows: number[][], columns: number[][]): void;
  dispose(): void;
};

/** Debounces exact work and makes obsolete worker results unpublishable. */
export const createExactCardinalityCoordinator = ({
  createWorker,
  debounceMs = 350,
  onState,
}: CoordinatorOptions): ExactCardinalityCoordinator => {
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeWorker: WorkerLike | undefined;
  let disposed = false;

  const cancelActive = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    activeWorker?.terminate();
    activeWorker = undefined;
  };

  const update = (rows: number[][], columns: number[][]) => {
    if (disposed) return;
    const requestGeneration = ++generation;
    cancelActive();
    onState({ status: 'pending' });
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || requestGeneration !== generation) return;
      let worker: WorkerLike;
      try {
        worker = createWorker();
      } catch {
        onState({ status: 'error' });
        return;
      }
      activeWorker = worker;
      onState({ status: 'checking' });
      worker.onmessage = ({ data }) => {
        if (disposed || requestGeneration !== generation) return;
        activeWorker = undefined;
        onState({ status: 'ready', count: data.count });
      };
      worker.onerror = () => {
        if (disposed || requestGeneration !== generation) return;
        activeWorker = undefined;
        onState({ status: 'error' });
      };
      worker.postMessage({ rows, columns });
    }, debounceMs);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    generation++;
    cancelActive();
  };

  return { update, dispose };
};
