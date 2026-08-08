import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { columnClues, rowClues } from './domain/clues';
import { localDateKey, formatDate } from './domain/dates';
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
} from './domain/game-state';
import { formatDuration } from './domain/format';
import { isSolved, type PuzzleDefinition } from './domain/puzzle';
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
const current = allPuzzles.find((p) => p.publishDate === today);
const empty = (p: PuzzleDefinition): GameState =>
  initialGame(p.width, p.height);
const cycleTheme = (theme: SavedData['theme']): SavedData['theme'] =>
  theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';

function App() {
  const [data, setData] = useState<SavedData>(() => loadData());
  const [selected, setSelected] = useState<PuzzleDefinition | undefined>(
    current,
  );
  const [view, setView] = useState<'game' | 'archive'>('game');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [revealArt, setRevealArt] = useState(false);
  const state = selected
    ? (data.puzzles[selected.id] ?? empty(selected))
    : null;
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

  useEffect(() => {
    setRevealArt(false);
    if (completed) {
      const id = window.setTimeout(() => setRevealArt(true), 450);
      return () => window.clearTimeout(id);
    }
  }, [completed, selected?.id]);

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

  useEffect(() => {
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
    setNotice('Puzzle complete! Your result and streak have been saved.');
  }, [completed, selected?.id, timedOut]);

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
    setRevealArt(false);
    setNotice('Puzzle reset to 35:00.');
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
            revealArt={revealArt}
            onPaint={paint}
            onUndo={() => update((s) => undo(s))}
            onRedo={() => update((s) => redo(s))}
            onReset={reset}
          />
          {state?.penaltyMs !== undefined &&
            state.penaltyMs > 0 &&
            !completed &&
            !timedOut && <PenaltyBadge key={state.penaltyMs} />}
          {completed && (
            <section
              className="completion"
              role="dialog"
              aria-labelledby="complete-title"
            >
              <div>
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
          <section className="stats">
            <strong>{stats.total}</strong>
            <span>completed</span>
            <strong>{stats.currentStreak}</strong>
            <span>current streak</span>
            <strong>{stats.bestStreak}</strong>
            <span>best streak</span>
            <small>
              Streaks count consecutive published puzzle dates completed;
              solving an archive puzzle can repair a gap.
            </small>
          </section>
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
    <div className="penalty" role="status">
      -3:00
    </div>
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
}) {
  const rows = rowClues(puzzle.solution);
  const cols = columnClues(puzzle.solution);
  const [touchTool, setTouchTool] = useState<Tool>('fill');
  const drag = useRef<Drag | null>(null);
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
      </div>
      <div className="grid-wrap">
        <div
          className="picross"
          style={{ '--cols': puzzle.width } as React.CSSProperties}
        >
          <div className="corner" />
          <div className="col-clues">
            {cols.map((clue, x) => (
              <div key={x} className="clue-line">
                {clue.map((number, i) => (
                  <span key={i}>{number}</span>
                ))}
              </div>
            ))}
          </div>
          {rows.map((clue, y) => (
            <React.Fragment key={y}>
              <div className="row-clues">
                <span>{clue.join(' ')}</span>
              </div>
              {state.board[y].map((cell, x) => (
                <button
                  key={x}
                  className={`cell ${cell} ${(x + 1) % 5 === 0 ? 'major-x' : ''} ${(y + 1) % 5 === 0 ? 'major-y' : ''}`}
                  aria-label={`Row ${y + 1}, column ${x + 1}, ${cell}`}
                  data-testid={`cell-${y}-${x}`}
                  onPointerDown={(event) => begin(event, y, x)}
                  onPointerEnter={() => enter(y, x)}
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
}: {
  puzzles: PuzzleDefinition[];
  selected: PuzzleDefinition | undefined;
  onSelect: (p: PuzzleDefinition) => void;
  onClose: () => void;
  data: SavedData;
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
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
