export interface Completion {
  puzzleId: string;
  date: string;
  elapsedMs: number;
}
export interface Statistics {
  total: number;
  currentStreak: number;
  bestStreak: number;
  averageMs: number;
  fastestMs: number | null;
}
export const deriveStatistics = (records: Completion[]): Statistics => {
  const dates = [...new Set(records.map((r) => r.date))].sort();
  let run = 0,
    best = 0;
  for (let i = 0; i < dates.length; i++) {
    run =
      i &&
      new Date(`${dates[i]}T12:00:00Z`).getTime() -
        new Date(`${dates[i - 1]}T12:00:00Z`).getTime() ===
        86400000
        ? run + 1
        : 1;
    best = Math.max(best, run);
  }
  return {
    total: records.length,
    currentStreak: run,
    bestStreak: best,
    averageMs: records.length
      ? records.reduce((a, r) => a + r.elapsedMs, 0) / records.length
      : 0,
    fastestMs: records.length
      ? Math.min(...records.map((r) => r.elapsedMs))
      : null,
  };
};
