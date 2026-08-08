import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import React from 'react';
import { allPuzzles } from '../src/puzzles';
describe('seed corpus', () => {
  it('contains a complete playable archive', () => {
    render(<p>{allPuzzles.length} puzzles</p>);
    expect(screen.getByText('14 puzzles')).toBeInTheDocument();
  });

  it('uses revision-qualified identities for the replacement corpus', () => {
    expect(allPuzzles.every((puzzle) => /-r2$/.test(puzzle.id))).toBe(true);
    expect(allPuzzles.some((puzzle) => puzzle.id === 'p-2026-08-08')).toBe(
      false,
    );
  });
});
