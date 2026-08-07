export const localDateKey = (date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
export const choosePuzzle = <T extends { publishDate: string }>(
  puzzles: T[],
  dateKey: string,
): T | undefined =>
  puzzles
    .filter((p) => p.publishDate <= dateKey)
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate))[0];
export const formatDate = (key: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${key}T12:00:00Z`));
