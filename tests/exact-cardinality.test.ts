import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExactCardinalityCoordinator,
  type ExactCardinalityState,
} from '../src/authoring/exact-cardinality';

type FakeWorker = {
  onmessage: ((event: MessageEvent<{ count: 0 | 1 | 2 }>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn> & ((message: unknown) => void);
  terminate: ReturnType<typeof vi.fn> & (() => void);
};

const worker = (): FakeWorker => {
  const postMessage = vi.fn() as FakeWorker['postMessage'];
  const terminate = vi.fn() as FakeWorker['terminate'];
  return { onmessage: null, onerror: null, postMessage, terminate };
};

describe('exact cardinality orchestration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces work and marks a new bitmap pending before checking', () => {
    const states: ExactCardinalityState[] = [];
    const created: FakeWorker[] = [];
    const coordinator = createExactCardinalityCoordinator({
      debounceMs: 300,
      createWorker: () => {
        const next = worker();
        created.push(next);
        return next;
      },
      onState: (state) => states.push(state),
    });

    coordinator.update([[1]], [[1]]);
    expect(states).toEqual([{ status: 'pending' }]);
    vi.advanceTimersByTime(299);
    expect(created).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(states).toEqual([{ status: 'pending' }, { status: 'checking' }]);
    expect(created[0].postMessage).toHaveBeenCalledWith({
      rows: [[1]],
      columns: [[1]],
    });
  });

  it('terminates obsolete work and ignores its late result', () => {
    const states: ExactCardinalityState[] = [];
    const created: FakeWorker[] = [];
    const coordinator = createExactCardinalityCoordinator({
      debounceMs: 0,
      createWorker: () => {
        const next = worker();
        created.push(next);
        return next;
      },
      onState: (state) => states.push(state),
    });

    coordinator.update([[1]], [[1]]);
    vi.runOnlyPendingTimers();
    const first = created[0];
    coordinator.update([[0]], [[0]]);
    expect(first.terminate).toHaveBeenCalledTimes(1);
    vi.runOnlyPendingTimers();
    const second = created[1];

    first.onmessage?.({ data: { count: 1 } } as MessageEvent);
    expect(states.at(-1)).toEqual({ status: 'checking' });
    second.onmessage?.({ data: { count: 2 } } as MessageEvent);
    expect(states.at(-1)).toEqual({ status: 'ready', count: 2 });
  });

  it('terminates a worker after a successful result', () => {
    const states: ExactCardinalityState[] = [];
    const created: FakeWorker[] = [];
    const coordinator = createExactCardinalityCoordinator({
      debounceMs: 0,
      createWorker: () => {
        const next = worker();
        created.push(next);
        return next;
      },
      onState: (state) => states.push(state),
    });

    coordinator.update([[1]], [[1]]);
    vi.runOnlyPendingTimers();
    const first = created[0];
    first.onmessage?.({ data: { count: 1 } } as MessageEvent);

    expect(first.terminate).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ status: 'ready', count: 1 });

    coordinator.update([[0]], [[0]]);
    vi.runOnlyPendingTimers();
    expect(created).toHaveLength(2);
    expect(first.terminate).toHaveBeenCalledTimes(1);
  });

  it('terminates a worker after an error and allows a fresh request', () => {
    const states: ExactCardinalityState[] = [];
    const created: FakeWorker[] = [];
    const coordinator = createExactCardinalityCoordinator({
      debounceMs: 0,
      createWorker: () => {
        const next = worker();
        created.push(next);
        return next;
      },
      onState: (state) => states.push(state),
    });

    coordinator.update([[1]], [[1]]);
    vi.runOnlyPendingTimers();
    const first = created[0];
    first.onerror?.({} as ErrorEvent);

    expect(first.terminate).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ status: 'error' });

    coordinator.update([[0]], [[0]]);
    vi.runOnlyPendingTimers();
    expect(created).toHaveLength(2);
    expect(states.at(-1)).toEqual({ status: 'checking' });
  });

  it('recovers from a synchronous dispatch failure', () => {
    const states: ExactCardinalityState[] = [];
    const failed = worker();
    failed.postMessage.mockImplementation(() => {
      throw new Error('clone failed');
    });
    const coordinator = createExactCardinalityCoordinator({
      debounceMs: 0,
      createWorker: () => failed,
      onState: (state) => states.push(state),
    });

    coordinator.update([[1]], [[1]]);
    vi.runOnlyPendingTimers();

    expect(failed.terminate).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ status: 'error' });
  });
});
