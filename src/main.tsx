import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { columnClues, rowClues } from './domain/clues';
import { localDateKey, formatDate } from './domain/dates';
import {
  applyCell,
  initialGame,
  redo,
  undo,
  type GameState,
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
  const [dragging, setDragging] = useState(false);
  const lastCell = useRef('');
  const state = selected
    ? (data.puzzles[selected.id] ?? empty(selected))
    : null;
  const completed = selected && state ? isSolved(selected, state.board) : false;
  const stats = useMemo(
    () => deriveStatistics(data.completions),
    [data.completions],
  );
  useEffect(() => {
    if (!state?.startedAt || state.completedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state?.startedAt, state?.completedAt]);
  useEffect(() => {
    if (!selected || !state || completed || !state.startedAt) return;
    const next = {
      ...data,
      puzzles: {
        ...data.puzzles,
        [selected.id]: {
          ...state,
          elapsedMs:
            state.elapsedMs + Math.max(0, now - (state.startedAt ?? now)),
        },
      },
    };
    if (now % 1000 < 100) {
      setData(next);
      saveData(next);
    }
  }, [now]);
  useEffect(() => {
    if (!selected || !state || !completed || state.completedAt) return;
    const record = {
      puzzleId: selected.id,
      date: selected.publishDate,
      elapsedMs:
        state.elapsedMs +
        (state.startedAt ? Math.max(0, Date.now() - state.startedAt) : 0),
    };
    const nextState = {
      ...state,
      completedAt: Date.now(),
      elapsedMs: record.elapsedMs,
    };
    const next = {
      ...data,
      puzzles: { ...data.puzzles, [selected.id]: nextState },
      completions: data.completions.some((c) => c.puzzleId === selected.id)
        ? data.completions
        : [...data.completions, record],
    };
    setData(next);
    saveData(next);
    setNotice('Puzzle complete! Your time and streak have been saved.');
  }, [completed, selected]);
  const update = (nextState: GameState) => {
    if (!selected) return;
    const next = {
      ...data,
      puzzles: { ...data.puzzles, [selected.id]: nextState },
    };
    setData(next);
    saveData(next);
  };
  const paint = (y: number, x: number) => {
    if (!state || !selected) return;
    const key = `${y}:${x}`;
    if (key === lastCell.current) return;
    lastCell.current = key;
    update(applyCell(state, y, x));
  };
  const share = async () => {
    if (!selected) return;
    const text = `Daily Picross #${selected.sequenceNumber}\n${selected.width}×${selected.height} — solved in ${formatDuration(state?.elapsedMs ?? 0)}\nCurrent streak: ${stats.currentStreak}`;
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
  if (!selected)
    return (
      <main className="shell">
        <Header
          theme={data.theme}
          onTheme={() => {
            const next = {
              ...data,
              theme: cycleTheme(data.theme),
            };
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
          const next = {
            ...data,
            theme: cycleTheme(data.theme),
          };
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
            <div className="timer" aria-label="Solve time">
              {formatDuration(
                (state?.elapsedMs ?? 0) +
                  (state?.startedAt && !state.completedAt
                    ? Math.max(0, now - state.startedAt)
                    : 0),
              )}
            </div>
          </section>
          <Game
            puzzle={selected}
            state={state!}
            onPaint={paint}
            onTool={(tool) => update({ ...state!, tool })}
            onUndo={() => update(undo(state!))}
            onRedo={() => update(redo(state!))}
            onReset={() => {
              if (
                window.confirm(
                  'Reset this puzzle? Your progress will be cleared.',
                )
              )
                update(empty(selected));
            }}
            dragging={dragging}
            setDragging={setDragging}
            lastCell={lastCell}
          />
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
                  Solve time:{' '}
                  <strong>{formatDuration(state?.elapsedMs ?? 0)}</strong>
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
function Game({
  puzzle,
  state,
  onPaint,
  onTool,
  onUndo,
  onRedo,
  onReset,
  dragging,
  setDragging,
  lastCell,
}: {
  puzzle: PuzzleDefinition;
  state: GameState;
  onPaint: (y: number, x: number) => void;
  onTool: (t: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  lastCell: React.MutableRefObject<string>;
}) {
  const rows = rowClues(puzzle.solution);
  const cols = columnClues(puzzle.solution);
  const pointer = (y: number, x: number) => onPaint(y, x);
  const move = (
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
    <section className="game">
      <div className="toolbar" aria-label="Drawing tools">
        {(['fill', 'cross', 'erase'] as Tool[]).map((t) => (
          <button
            key={t}
            className={state.tool === t ? 'selected' : ''}
            aria-pressed={state.tool === t}
            onClick={() => onTool(t)}
          >
            {t === 'fill' ? 'Fill' : t === 'cross' ? 'Cross' : 'Erase'}
          </button>
        ))}
        <span className="spacer" />
        <button onClick={onUndo} disabled={!state.history.length}>
          Undo
        </button>
        <button onClick={onRedo} disabled={!state.future.length}>
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
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setDragging(true);
                    lastCell.current = '';
                    pointer(y, x);
                  }}
                  onPointerEnter={() => dragging && pointer(y, x)}
                  onPointerUp={() => setDragging(false)}
                  onContextMenu={(event) => event.preventDefault()}
                  onKeyDown={(event) => {
                    move(event, y, x);
                    if (event.key === ' ' || event.key === 'Enter') {
                      event.preventDefault();
                      pointer(y, x);
                    }
                    if (event.key.toLowerCase() === 'x') onTool('cross');
                    if (event.key === 'Backspace' || event.key === 'Delete')
                      onTool('erase');
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
        Fill the picture, or use Cross to mark cells you know are empty. Crosses
        are optional.
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
