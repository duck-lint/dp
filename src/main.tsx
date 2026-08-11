import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { columnClues, lineSatisfied, rowClues } from './domain/clues';
import { deriveAchievements } from './domain/achievements';
import { choosePuzzle, localDateKey, formatDate } from './domain/dates';
import {
  applyCell,
  checkpointTimer,
  GAME_DURATION_MS,
  initialGame,
  redo,
  remainingAt,
  undo,
  type GameState,
  type MarkCommand,
  type Tool,
  WRONG_MARK_PENALTY_MS,
} from './domain/game-state';
import { formatDuration } from './domain/format';
import {
  isSolved,
  type CellState,
  type PuzzleDefinition,
} from './domain/puzzle';
import { deriveStatistics } from './domain/statistics';
import {
  emptySaved,
  loadData,
  saveData,
  type SavedData,
} from './persistence/storage';
import { allPuzzles } from './puzzles';
import './styles/app.css';

const today = localDateKey();
const current = choosePuzzle(allPuzzles, today);
const empty = (p: PuzzleDefinition): GameState =>
  initialGame(p.width, p.height);
const cycleTheme = (theme: SavedData['theme']): SavedData['theme'] =>
  theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';

function App() {
  const [data, setData] = useState<SavedData>(() => loadData(allPuzzles));
  const [selected, setSelected] = useState<PuzzleDefinition | undefined>(
    current,
  );
  const [view, setView] = useState<'game' | 'archive'>('game');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [completionPhase, setCompletionPhase] = useState<
    'hidden' | 'delayed' | 'open'
  >('hidden');
  const [pendingCompletionId, setPendingCompletionId] = useState<string | null>(
    null,
  );
  const [resultEntering, setResultEntering] = useState(false);
  const [penaltyFeedback, setPenaltyFeedback] = useState<number | null>(null);
  const completionTimer = useRef<number | null>(null);
  const completionCloseRef = useRef<HTMLButtonElement>(null);
  const resultLinkRef = useRef<HTMLButtonElement>(null);
  const state = selected
    ? (data.puzzles[selected.id] ?? empty(selected))
    : null;
  const previousPuzzleId = useRef(selected?.id);
  const previousPenalty = useRef(state?.penaltyMs ?? 0);
  const completed = Boolean(
    selected && state && isSolved(selected, state.board),
  );
  const remainingMs = state ? remainingAt(state, now) : GAME_DURATION_MS;
  const timedOut = Boolean(
    state?.failedAt || (state?.startedAt && remainingMs === 0),
  );
  const stats = useMemo(
    () => deriveStatistics(data.completions),
    [data.completions],
  );
  const achievements = useMemo(
    () =>
      deriveAchievements(
        data.completions,
        stats.currentStreak,
        stats.bestStreak,
      ),
    [data.completions, stats.currentStreak, stats.bestStreak],
  );

  useEffect(() => {
    const penaltyMs = state?.penaltyMs ?? 0;
    if (previousPuzzleId.current !== selected?.id) {
      previousPuzzleId.current = selected?.id;
      previousPenalty.current = penaltyMs;
      setPenaltyFeedback(null);
      return;
    }
    if (penaltyMs <= previousPenalty.current) {
      previousPenalty.current = penaltyMs;
      return;
    }
    previousPenalty.current = penaltyMs;
    setPenaltyFeedback(penaltyMs);
    const id = window.setTimeout(() => setPenaltyFeedback(null), 1500);
    return () => window.clearTimeout(id);
  }, [selected?.id, state?.penaltyMs]);

  // The celebration is a transient presentation event, not a projection of
  // persistent completion. Navigation and puzzle changes cancel it entirely.
  useEffect(() => {
    return () => {
      if (completionTimer.current !== null) {
        window.clearTimeout(completionTimer.current);
        completionTimer.current = null;
      }
      setPendingCompletionId(null);
      setCompletionPhase('hidden');
      setResultEntering(false);
    };
  }, [selected?.id, view]);

  useEffect(() => {
    if (!selected || view !== 'game' || pendingCompletionId !== selected.id)
      return;
    setCompletionPhase('delayed');
    completionTimer.current = window.setTimeout(() => {
      setCompletionPhase('open');
      setPendingCompletionId(null);
      window.requestAnimationFrame(() => setResultEntering(true));
    }, 1800);
    return () => {
      if (completionTimer.current !== null) {
        window.clearTimeout(completionTimer.current);
        completionTimer.current = null;
      }
    };
  }, [pendingCompletionId, selected?.id, view]);

  useEffect(() => {
    if (completionPhase !== 'open') return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCompletionPhase('hidden');
        setResultEntering(false);
      }
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [completionPhase]);

  useEffect(() => {
    if (!state?.startedAt || state.completedAt || state.failedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state?.startedAt, state?.completedAt, state?.failedAt]);

  useEffect(() => {
    if (
      !selected ||
      !state ||
      state.completedAt ||
      state.failedAt ||
      !state.startedAt
    )
      return;
    if (remainingMs !== 0 && now - state.startedAt < 900) return;
    const nextState = checkpointTimer(state, now);
    if (nextState !== state) {
      const next = {
        ...data,
        puzzles: { ...data.puzzles, [selected.id]: nextState },
      };
      setData(next);
      saveData(next);
    }
  }, [now, remainingMs, selected?.id]);

  useLayoutEffect(() => {
    if (!selected || !state || !completed || state.completedAt || timedOut)
      return;
    const finalState = checkpointTimer(state, Date.now());
    const record = {
      puzzleId: selected.id,
      date: selected.publishDate,
      elapsedMs: GAME_DURATION_MS - finalState.remainingMs,
    };
    const nextState = { ...finalState, completedAt: Date.now() };
    const next = {
      ...data,
      puzzles: { ...data.puzzles, [selected.id]: nextState },
      completions: data.completions.some((c) => c.puzzleId === selected.id)
        ? data.completions
        : [...data.completions, record],
    };
    setData(next);
    saveData(next);
    setPendingCompletionId(selected.id);
    setCompletionPhase('delayed');
    setNotice('Puzzle complete! Your result and streak have been saved.');
  }, [completed, selected?.id, timedOut]);

  useEffect(() => {
    if (completionPhase !== 'open' || !resultEntering) return;
    completionCloseRef.current?.focus();
  }, [completionPhase, resultEntering]);

  const closeCompletion = () => {
    setCompletionPhase('hidden');
    setResultEntering(false);
    window.requestAnimationFrame(() => resultLinkRef.current?.focus());
  };

  useEffect(() => {
    if (
      !selected ||
      !state ||
      !state.startedAt ||
      state.completedAt ||
      state.failedAt ||
      remainingMs !== 0
    )
      return;
    const nextState = {
      ...checkpointTimer(state, Date.now()),
      failedAt: Date.now(),
      remainingMs: 0,
    };
    const next = {
      ...data,
      puzzles: { ...data.puzzles, [selected.id]: nextState },
    };
    setData(next);
    saveData(next);
    setNotice('Time expired. The board is locked until you retry.');
  }, [remainingMs, selected?.id, state?.failedAt]);

  const update = (transform: (current: GameState) => GameState) => {
    if (!selected) return;
    setData((previous) => {
      const currentState = previous.puzzles[selected.id] ?? empty(selected);
      const nextState = transform(currentState);
      const next = {
        ...previous,
        puzzles: { ...previous.puzzles, [selected.id]: nextState },
      };
      saveData(next);
      return next;
    });
  };
  const paint = (
    y: number,
    x: number,
    tool: MarkCommand,
    clearOnly?: 'filled' | 'crossed',
  ) => {
    if (!selected) return;
    update((currentState) =>
      applyCell(
        currentState,
        y,
        x,
        tool,
        selected.solution,
        Date.now(),
        clearOnly,
      ),
    );
  };
  const share = async () => {
    if (!selected || !state) return;
    const text = `Daily Picross #${selected.sequenceNumber}\n${selected.width}×${selected.height} — solved with ${formatDuration(state.remainingMs)} remaining\nCurrent streak: ${stats.currentStreak}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setNotice('Share text copied to clipboard.');
      }
    } catch {
      setNotice('Sharing was cancelled or unavailable.');
    }
  };
  const reset = () => {
    if (
      !selected ||
      !window.confirm('Reset this puzzle? Your progress will be cleared.')
    )
      return;
    update(() => empty(selected));
    setPendingCompletionId(null);
    setCompletionPhase('hidden');
    setResultEntering(false);
    setNotice('Puzzle reset to 35:00.');
  };
  const resetAllProgress = () => {
    if (
      !window.confirm(
        'Reset all progress? This will remove saved progress, solved history, and streak data from this browser.',
      )
    )
      return;
    const next = emptySaved();
    next.theme = data.theme;
    setData(next);
    saveData(next);
    setPendingCompletionId(null);
    setCompletionPhase('hidden');
    setResultEntering(false);
    setView('game');
    setNotice('All local progress has been reset.');
  };
  const replayCurrent = () => {
    if (!selected) return;
    setData((previous) => {
      const next = {
        ...previous,
        puzzles: { ...previous.puzzles, [selected.id]: empty(selected) },
        completions: previous.completions.filter(
          (completion) => completion.puzzleId !== selected.id,
        ),
      };
      saveData(next);
      return next;
    });
    setPendingCompletionId(null);
    setCompletionPhase('hidden');
    setResultEntering(false);
    setNotice('Current puzzle replay reset.');
  };

  if (!selected)
    return (
      <main className="shell">
        <Header
          theme={data.theme}
          onTheme={() => {
            const next = { ...data, theme: cycleTheme(data.theme) };
            setData(next);
            saveData(next);
          }}
          onArchive={() => setView('archive')}
        />
        <section className="empty">
          <h1>No puzzle published for this date</h1>
          <p>Check the archive for the published puzzle set.</p>
          <button onClick={() => setView('archive')}>Open archive</button>
        </section>
        {view === 'archive' && (
          <Archive
            puzzles={allPuzzles}
            selected={selected}
            onSelect={setSelected}
            onClose={() => setView('game')}
            data={data}
            onResetAll={resetAllProgress}
          />
        )}
      </main>
    );

  return (
    <main className="shell" data-theme={data.theme}>
      <Header
        theme={data.theme}
        onTheme={() => {
          const next = { ...data, theme: cycleTheme(data.theme) };
          setData(next);
          saveData(next);
        }}
        onArchive={() => setView('archive')}
      />
      {view === 'archive' ? (
        <Archive
          puzzles={allPuzzles}
          selected={selected}
          onSelect={(p) => {
            setSelected(p);
            setView('game');
          }}
          onClose={() => setView('game')}
          data={data}
          onResetAll={resetAllProgress}
        />
      ) : (
        <>
          <section className="intro">
            <div>
              <p className="eyebrow">
                Daily Picross #{selected.sequenceNumber}
              </p>
              <h1>{formatDate(selected.publishDate)}</h1>
              <p className="muted">
                {selected.width}×{selected.height} ·{' '}
                {selected.publishDate === today ? 'Today' : 'Archive puzzle'}
              </p>
            </div>
            <div
              className={`timer ${timedOut ? 'timer-expired' : ''}`}
              aria-label="Time remaining"
            >
              {formatDuration(remainingMs)}
            </div>
          </section>
          <Game
            puzzle={selected}
            state={state!}
            revealArt={completed}
            onPaint={paint}
            onUndo={() => update((s) => undo(s))}
            onRedo={() => update((s) => redo(s))}
            onReset={reset}
            onReplay={replayCurrent}
          />
          {penaltyFeedback !== null && !completed && !timedOut && (
            <PenaltyBadge key={penaltyFeedback} />
          )}
          {completed && completionPhase === 'open' && (
            <section
              className={`completion ${resultEntering ? 'is-visible' : ''}`}
              role="dialog"
              aria-labelledby="complete-title"
              aria-modal="true"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeCompletion();
                  return;
                }
                if (event.key !== 'Tab') return;
                const focusable = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                  ),
                );
                if (!focusable.length) {
                  event.preventDefault();
                  return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }}
            >
              <div>
                <button
                  ref={completionCloseRef}
                  className="completion-close"
                  aria-label="Close completion result"
                  onClick={closeCompletion}
                >
                  ×
                </button>
                <p className="eyebrow">Solved</p>
                <h2 id="complete-title">{selected.reveal.title}</h2>
                <p>{selected.reveal.description}</p>
                <p>
                  Solved with{' '}
                  <strong>
                    {formatDuration(state?.remainingMs ?? 0)} remaining
                  </strong>
                </p>
                <p>
                  Current streak: <strong>{stats.currentStreak}</strong> · Best:{' '}
                  <strong>{stats.bestStreak}</strong>
                </p>
                <button onClick={share}>Share result</button>
                <button
                  className="secondary"
                  onClick={() => setView('archive')}
                >
                  View archive
                </button>
              </div>
            </section>
          )}
          {completed &&
            completionPhase === 'hidden' &&
            pendingCompletionId !== selected.id && (
              <div className="result-link-wrap">
                <button
                  ref={resultLinkRef}
                  className="secondary"
                  onClick={() => {
                    setCompletionPhase('open');
                    setResultEntering(true);
                  }}
                >
                  View result
                </button>
              </div>
            )}
          {timedOut && !completed && (
            <section className="result-state" role="alert">
              <p className="eyebrow">Time expired</p>
              <h2>That puzzle got away.</h2>
              <p>Your board is preserved, but no further edits are accepted.</p>
              <button onClick={reset}>Retry puzzle</button>
              <button className="secondary" onClick={() => setView('archive')}>
                Open archive
              </button>
            </section>
          )}
          <section className="stats" aria-label="Progress statistics">
            <strong>{stats.total}</strong>
            <span>completed</span>
            <strong>{stats.currentStreak}</strong>
            <span>current streak</span>
            <strong>{stats.bestStreak}</strong>
            <span>best streak</span>
            <strong>
              {stats.total ? formatDuration(stats.averageMs) : '—'}
            </strong>
            <span>average time</span>
            <strong>
              {stats.total && stats.fastestMs !== null
                ? formatDuration(stats.fastestMs)
                : '—'}
            </strong>
            <span>best time</span>
            <small className="stats-help">
              Streaks count consecutive published puzzle dates completed;
              solving an archive puzzle can repair a gap.
            </small>
          </section>
          <Achievements achievements={achievements} />
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Header({
  onArchive,
  onTheme,
  theme,
}: {
  onArchive: () => void;
  onTheme: () => void;
  theme: SavedData['theme'];
}) {
  return (
    <header>
      <a className="brand" href=".">
        Daily <span>Picross</span>
      </a>
      <div className="header-actions">
        <button
          className="header-button"
          onClick={onTheme}
          aria-label="Change color theme"
        >
          {theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}
        </button>
        <button className="header-button" onClick={onArchive}>
          Archive
        </button>
      </div>
    </header>
  );
}

function PenaltyBadge() {
  return (
    <div className="penalty" role="status" aria-live="assertive">
      <span>Time penalty</span>
      <strong>-{formatDuration(WRONG_MARK_PENALTY_MS)}</strong>
    </div>
  );
}

function Achievements({
  achievements,
}: {
  achievements: ReturnType<typeof deriveAchievements>;
}) {
  return (
    <section className="achievements" aria-label="Achievements">
      <div className="achievements-head">
        <div>
          <p className="eyebrow">Progress</p>
          <h2>Achievements</h2>
        </div>
        <span className="muted">
          {achievements.filter((achievement) => achievement.unlocked).length}/
          {achievements.length}
        </span>
      </div>
      <div className="achievement-list">
        {achievements.map((achievement) => (
          <div
            className={`achievement ${achievement.unlocked ? 'unlocked' : 'locked'}`}
            key={achievement.id}
          >
            <span className="achievement-mark" aria-hidden="true">
              {achievement.unlocked ? '✓' : '·'}
            </span>
            <div>
              <strong>{achievement.name}</strong>
              <small>{achievement.description}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type Drag = {
  y: number;
  x: number;
  tool: Tool;
  clearOnly?: 'filled' | 'crossed';
  axis: 'row' | 'column' | null;
  visited: Set<string>;
};

function Game({
  puzzle,
  state,
  revealArt,
  onPaint,
  onUndo,
  onRedo,
  onReset,
  onReplay,
}: {
  puzzle: PuzzleDefinition;
  state: GameState;
  revealArt: boolean;
  onPaint: (
    y: number,
    x: number,
    tool: MarkCommand,
    clearOnly?: 'filled' | 'crossed',
  ) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onReplay: () => void;
}) {
  const rows = rowClues(puzzle.solution);
  const cols = columnClues(puzzle.solution);
  const [touchTool, setTouchTool] = useState<Tool>('fill');
  const [activeCell, setActiveCell] = useState<{ y: number; x: number } | null>(
    null,
  );
  const drag = useRef<Drag | null>(null);
  const asLine = (line: CellState[]): string[] =>
    line.map((cell) => (cell === 'filled' ? '1' : '0'));
  useEffect(() => {
    const cancel = () => {
      drag.current = null;
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, []);
  const apply = (y: number, x: number, tool: Tool) => {
    const key = `${y}:${x}`;
    const d = drag.current;
    if (!d || d.visited.has(key)) return;
    d.visited.add(key);
    onPaint(y, x, d.clearOnly ? 'erase' : tool, d.clearOnly);
  };
  const begin = (event: React.PointerEvent, y: number, x: number) => {
    if (state.completedAt || state.failedAt) return;
    event.preventDefault();
    const tool: Tool =
      event.pointerType === 'touch' || event.pointerType === 'pen'
        ? touchTool
        : event.button === 2
          ? 'cross'
          : 'fill';
    drag.current = {
      y,
      x,
      tool,
      clearOnly:
        state.board[y][x] === (tool === 'fill' ? 'filled' : 'crossed')
          ? tool === 'fill'
            ? 'filled'
            : 'crossed'
          : undefined,
      axis: null,
      visited: new Set(),
    };
    apply(y, x, tool);
  };
  const enter = (y: number, x: number) => {
    const d = drag.current;
    if (!d) return;
    if (!d.axis && (y !== d.y || x !== d.x))
      d.axis = Math.abs(x - d.x) >= Math.abs(y - d.y) ? 'row' : 'column';
    const target =
      d.axis === 'row'
        ? { y: d.y, x }
        : d.axis === 'column'
          ? { y, x: d.x }
          : { y, x };
    apply(target.y, target.x, d.tool);
  };
  const end = () => {
    drag.current = null;
  };
  const focusMove = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    y: number,
    x: number,
  ) => {
    if (
      !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
    )
      return;
    event.preventDefault();
    const delta =
      event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowUp'
            ? -puzzle.width
            : puzzle.width;
    const index = Math.max(
      0,
      Math.min(puzzle.width * puzzle.height - 1, y * puzzle.width + x + delta),
    );
    (
      event.currentTarget.parentElement?.querySelectorAll('button')[index] as
        HTMLElement | undefined
    )?.focus();
  };
  return (
    <section className={`game ${revealArt ? 'reveal-art' : ''}`}>
      <div className="toolbar" aria-label="Puzzle controls">
        <div className="touch-tools" aria-label="Touch marking tool">
          <button
            className={touchTool === 'fill' ? 'selected' : ''}
            aria-pressed={touchTool === 'fill'}
            onClick={() => setTouchTool('fill')}
          >
            ■ <span>Fill</span>
          </button>
          <button
            className={touchTool === 'cross' ? 'selected' : ''}
            aria-pressed={touchTool === 'cross'}
            onClick={() => setTouchTool('cross')}
          >
            × <span>Cross</span>
          </button>
        </div>
        <span className="spacer" />
        <button
          onClick={onUndo}
          disabled={
            !state.history.length ||
            Boolean(state.failedAt || state.completedAt)
          }
        >
          Undo
        </button>
        <button
          onClick={onRedo}
          disabled={
            !state.future.length || Boolean(state.failedAt || state.completedAt)
          }
        >
          Redo
        </button>
        <button onClick={onReset}>Reset</button>
        {import.meta.env.DEV && (
          <button className="dev-only" onClick={onReplay}>
            Replay current
          </button>
        )}
      </div>
      <div
        className="grid-wrap"
        onPointerLeave={() => {
          end();
          setActiveCell(null);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onContextMenuCapture={(event) => event.preventDefault()}
        onAuxClickCapture={(event) => {
          if (event.button === 2) event.preventDefault();
        }}
      >
        <div
          className="picross"
          style={
            {
              '--cols': puzzle.width,
              '--max-col-depth': Math.max(...cols.map((clue) => clue.length)),
              '--row-clue-units': Math.max(
                ...rows.map((clue) =>
                  Math.max(1, clue.join(' ').length * 0.62),
                ),
              ),
            } as React.CSSProperties
          }
        >
          <div className="corner" />
          <div className="col-clues">
            {cols.map((clue, x) => (
              <div
                key={x}
                className={`clue-line ${lineSatisfied(asLine(state.board.map((row) => row[x])), clue) ? 'satisfied' : ''} ${activeCell?.x === x ? 'active-col' : ''}`}
                data-col={x}
                data-testid={`col-clue-${x}`}
              >
                {clue.map((number, i) => (
                  <span key={i}>{number}</span>
                ))}
              </div>
            ))}
          </div>
          {rows.map((clue, y) => (
            <React.Fragment key={y}>
              <div
                className={`row-clues ${lineSatisfied(asLine(state.board[y]), clue) ? 'satisfied' : ''} ${activeCell?.y === y ? 'active-row' : ''}`}
                data-row={y}
                data-testid={`row-clue-${y}`}
              >
                <span>{clue.join(' ')}</span>
              </div>
              {state.board[y].map((cell, x) => (
                <button
                  key={x}
                  className={`cell ${cell} ${activeCell?.y === y ? 'active-row' : ''} ${activeCell?.x === x ? 'active-col' : ''} ${(x + 1) % 5 === 0 ? 'major-x' : ''} ${(y + 1) % 5 === 0 ? 'major-y' : ''}`}
                  aria-label={`Row ${y + 1}, column ${x + 1}, ${cell}`}
                  data-testid={`cell-${y}-${x}`}
                  data-col={x}
                  data-row={y}
                  onPointerDown={(event) => begin(event, y, x)}
                  onPointerEnter={() => {
                    setActiveCell(y, x);
                    enter(y, x);
                  }}
                  onFocus={() => setActiveCell(y, x)}
                  onBlur={(event) => {
                    if (
                      !event.currentTarget.parentElement?.contains(
                        event.relatedTarget as Node | null,
                      )
                    )
                      setActiveCell(null);
                  }}
                  onPointerUp={end}
                  onPointerCancel={end}
                  onContextMenu={(event) => event.preventDefault()}
                  onKeyDown={(event) => {
                    focusMove(event, y, x);
                    if (event.key === ' ' || event.key === 'Enter') {
                      event.preventDefault();
                      onPaint(y, x, 'fill');
                    }
                    if (event.key.toLowerCase() === 'x') onPaint(y, x, 'cross');
                    if (event.key === 'Backspace' || event.key === 'Delete')
                      onPaint(y, x, 'erase');
                    if (event.key.toLowerCase() === 'z' && !event.shiftKey)
                      onUndo();
                    if (
                      (event.key.toLowerCase() === 'z' && event.shiftKey) ||
                      event.key.toLowerCase() === 'y'
                    )
                      onRedo();
                  }}
                >
                  {cell === 'crossed' ? '×' : ''}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p className="hint">
        <span className="fine-pointer-hint">
          Left click fills · right click crosses · drag to paint a run
        </span>
        <span className="coarse-pointer-hint">
          Choose Fill or Cross, then tap or drag across the grid
        </span>
        . Crosses are optional.
      </p>
    </section>
  );
}

function Archive({
  puzzles,
  selected,
  onSelect,
  onClose,
  data,
  onResetAll,
}: {
  puzzles: PuzzleDefinition[];
  selected: PuzzleDefinition | undefined;
  onSelect: (p: PuzzleDefinition) => void;
  onClose: () => void;
  data: SavedData;
  onResetAll: () => void;
}) {
  return (
    <section className="archive">
      <div className="archive-head">
        <div>
          <p className="eyebrow">Puzzle library</p>
          <h1>Archive</h1>
        </div>
        <button onClick={onClose}>Back to game</button>
      </div>
      {puzzles
        .filter((p) => p.publishDate <= today)
        .map((p) => (
          <button
            className={`archive-row ${selected?.id === p.id ? 'active' : ''}`}
            key={p.id}
            onClick={() => onSelect(p)}
          >
            <span>
              <strong>#{p.sequenceNumber}</strong> {formatDate(p.publishDate)}
            </span>
            <span>
              {p.width}×{p.height}
            </span>
            <span>
              {data.completions.find((c) => c.puzzleId === p.id)
                ? 'Solved'
                : 'Unsolved'}
            </span>
          </button>
        ))}
      <p className="muted">
        Future puzzles are kept off the board until their publication date.
      </p>
      <div className="archive-actions">
        <button className="secondary" onClick={onResetAll}>
          Reset all progress
        </button>
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
