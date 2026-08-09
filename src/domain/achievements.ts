import type { GameState } from './game-state';
import type { Completion } from './statistics';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
}

/**
 * Achievements are a view over existing local records, not a second source of
 * persistence or progression authority.
 */
export const deriveAchievements = (
  completions: Completion[],
  puzzles: Record<string, GameState>,
  currentStreak: number,
  bestStreak: number,
): Achievement[] => [
  {
    id: 'first-solve',
    name: 'First Solve',
    description: 'Complete any puzzle.',
    unlocked: completions.length >= 1,
  },
  {
    id: 'streak-3',
    name: 'Streak 3',
    description: 'Reach a three-day streak.',
    unlocked: Math.max(currentStreak, bestStreak) >= 3,
  },
  {
    id: 'streak-7',
    name: 'Streak 7',
    description: 'Reach a seven-day streak.',
    unlocked: Math.max(currentStreak, bestStreak) >= 7,
  },
  {
    id: 'clean-solve',
    name: 'Clean Solve',
    description: 'Complete a puzzle without a wrong-guess penalty.',
    unlocked: completions.some(
      (completion) => (puzzles[completion.puzzleId]?.penaltyMs ?? 0) === 0,
    ),
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Complete five different puzzles.',
    unlocked:
      new Set(completions.map((completion) => completion.puzzleId)).size >= 5,
  },
];
