import { countSolutions } from '../domain/puzzle-analysis';

type CardinalityRequest = { rows: number[][]; columns: number[][] };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<CardinalityRequest>) => void) | null;
  postMessage(message: unknown): void;
};

worker.onmessage = ({ data }: MessageEvent<CardinalityRequest>) => {
  worker.postMessage(countSolutions(data.rows, data.columns));
};
