import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { analyzeBitmap, type PropagationRound } from './domain/puzzle-analysis';
import type { PuzzleDefinition } from './domain/puzzle';
import seed from '../puzzles/seed.json';
import './styles/author.css';

const SIZE = 15;
const blank = () => Array.from({ length: SIZE }, () => '0'.repeat(SIZE));
const corpus = seed as PuzzleDefinition[];
const initialMeta = (p?: PuzzleDefinition) => ({
  id: p?.id ?? 'candidate-1',
  sequenceNumber: p?.sequenceNumber ?? 1,
  publishDate: p?.publishDate ?? '2026-08-20',
  title: p?.reveal.title ?? '',
  description: p?.reveal.description ?? '',
});
type GestureMode = 'fill' | 'erase';

function Author() {
  const [solution, setSolution] = useState(blank);
  const [meta, setMeta] = useState(initialMeta);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const gesture = useRef<{ pointerId: number; mode: GestureMode } | null>(
    null,
  );
  const analysis = useMemo(() => analyzeBitmap(solution), [solution]);
  const changedFromSource = Boolean(
    sourceId &&
    solution.join('\n') !==
      corpus.find((p) => p.id === sourceId)?.solution.join('\n'),
  );
  const idCollision = corpus.some((p) => p.id === meta.id && p.id !== sourceId);
  const seqCollision = corpus.some(
    (p) =>
      p.sequenceNumber === Number(meta.sequenceNumber) && p.id !== sourceId,
  );
  const dateCollision = corpus.some(
    (p) => p.publishDate === meta.publishDate && p.id !== sourceId,
  );
  const metadataValid = Boolean(
    meta.id &&
    Number.isInteger(Number(meta.sequenceNumber)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(meta.publishDate) &&
    meta.title.trim() &&
    meta.description.trim(),
  );
  const exportBlocked = changedFromSource && meta.id === sourceId;
  const setPixel = (y: number, x: number, filled: boolean) =>
    setSolution((old) =>
      old.map((row, ry) =>
        ry === y
          ? row.slice(0, x) + (filled ? '1' : '0') + row.slice(x + 1)
          : row,
      ),
    );
  const endGesture = (pointerId?: number) => {
    if (pointerId === undefined || gesture.current?.pointerId === pointerId)
      gesture.current = null;
  };
  const applyGesture = (y: number, x: number, pointerId: number) => {
    if (gesture.current?.pointerId === pointerId)
      setPixel(y, x, gesture.current.mode === 'fill');
  };
  useEffect(() => {
    const end = (event: PointerEvent) => endGesture(event.pointerId);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);
  const load = (p?: PuzzleDefinition) => {
    setSolution(p ? [...p.solution] : blank());
    setMeta(initialMeta(p));
    setSourceId(p?.id ?? null);
    setNotice('');
  };
  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      setNotice(
        'Clipboard unavailable; select and copy from the preview instead.',
      );
    }
  };
  const candidate: PuzzleDefinition = {
    schemaVersion: 1 as const,
    id: meta.id,
    sequenceNumber: Number(meta.sequenceNumber),
    publishDate: meta.publishDate,
    width: SIZE,
    height: SIZE,
    solution,
    reveal: { title: meta.title, description: meta.description },
  };
  return (
    <main className="author-shell">
      <header className="author-header">
        <div>
          <p className="eyebrow">Internal development tool</p>
          <h1>Picross authoring lab</h1>
        </div>
        <a href="/">Open game</a>
      </header>
      <section className="author-controls">
        <button onClick={() => load()}>Start blank</button>
        <label>
          Load seed{' '}
          <select
            aria-label="Load seed puzzle"
            value={sourceId ?? ''}
            onChange={(e) => load(corpus.find((p) => p.id === e.target.value))}
          >
            <option value="">Choose a puzzle</option>
            {corpus.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.sequenceNumber} — {p.reveal.title}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setSolution(blank())}>Clear</button>
      </section>
      <div className="author-grid-layout">
        <section>
          <h2>Bitmap editor</h2>
          <p className="muted">
            Click or drag to fill/erase from the starting cell. Right click or
            drag always erases.
          </p>
          <div
            className="author-editor"
            onContextMenu={(e) => e.preventDefault()}
            onPointerMove={(e) => {
              const target = (e.target as HTMLElement).closest(
                'button[data-row][data-column]',
              );
              if (target)
                applyGesture(
                  Number(target.getAttribute('data-row')),
                  Number(target.getAttribute('data-column')),
                  e.pointerId,
                );
            }}
            onPointerUp={(e) => endGesture(e.pointerId)}
            onPointerCancel={(e) => endGesture(e.pointerId)}
            onLostPointerCapture={(e) => endGesture(e.pointerId)}
            onPointerLeave={() => endGesture()}
          >
            {solution.map((row, y) =>
              [...row].map((cell, x) => (
                <button
                  key={`${y}-${x}`}
                  data-row={y}
                  data-column={x}
                  aria-label={`row ${y + 1}, column ${x + 1}, ${cell === '1' ? 'filled' : 'empty'}`}
                  className={cell === '1' ? 'filled' : ''}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    gesture.current = {
                      pointerId: e.pointerId,
                      mode: e.button === 2 || cell === '1' ? 'erase' : 'fill',
                    };
                    applyGesture(y, x, e.pointerId);
                  }}
                  onPointerMove={(e) => applyGesture(y, x, e.pointerId)}
                  onPointerUp={(e) => endGesture(e.pointerId)}
                  onPointerCancel={(e) => endGesture(e.pointerId)}
                  onLostPointerCapture={(e) => endGesture(e.pointerId)}
                />
              )),
            )}
          </div>
          <div className="clues">
            <div>
              <strong>Rows</strong>
              {analysis.rows.map((c, i) => (
                <span key={i}>{c.join(' ')}</span>
              ))}
            </div>
            <div>
              <strong>Columns</strong>
              {analysis.columns.map((c, i) => (
                <span key={i}>{c.join(' ')}</span>
              ))}
            </div>
          </div>
        </section>
        <section>
          <h2>Clean silhouette</h2>
          <div className="silhouette">
            {solution.map((row, y) =>
              [...row].map((cell, x) => (
                <i key={`${y}-${x}`} className={cell === '1' ? 'filled' : ''} />
              )),
            )}
          </div>
          <h2>Analysis</h2>
          <dl className="metrics">
            <dt>Dimensions</dt>
            <dd>15×15</dd>
            <dt>Filled cells</dt>
            <dd>{analysis.metrics.filledCells}</dd>
            <dt>Fill percentage</dt>
            <dd>{analysis.metrics.fillPercentage.toFixed(1)}%</dd>
            <dt>Unique solution</dt>
            <dd>
              {analysis.cardinality.count === 1 ? 'yes' : 'no'} (
              {analysis.cardinality.count === 2
                ? '2+'
                : analysis.cardinality.count}
              )
            </dd>
            <dt>No-guess line solve</dt>
            <dd>{analysis.propagation.solved ? 'yes' : 'no'}</dd>
            <dt>Initial forced cells</dt>
            <dd>{analysis.propagation.initialForcedCells}</dd>
            <dt>Propagation rounds</dt>
            <dd>{analysis.propagation.rounds.length}</dd>
            <dt>Unresolved at stall</dt>
            <dd>{analysis.propagation.unresolvedCells}</dd>
            <dt>Filled components</dt>
            <dd>{analysis.metrics.connectedComponents}</dd>
            <dt>Isolated pixels</dt>
            <dd>{analysis.metrics.isolatedPixels}</dd>
            <dt>Bounding box</dt>
            <dd>
              {analysis.metrics.boundingBox
                ? `${analysis.metrics.boundingBox.width}×${analysis.metrics.boundingBox.height}`
                : 'none'}
            </dd>
            <dt>Margins</dt>
            <dd>
              {Object.values(analysis.metrics.margins).join(' / ')} (T/B/L/R)
            </dd>
          </dl>
          <div className="progression">
            <strong>Propagation progression</strong>
            {analysis.propagation.rounds.map((r: PropagationRound) => (
              <div key={r.round}>
                Round {r.round} — {r.forcedCells} cells forced,{' '}
                {r.resolvedCells} resolved
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="metadata">
        <h2>Candidate metadata</h2>
        <div className="metadata-fields">
          {[
            ['id', 'ID', meta.id],
            ['sequenceNumber', 'Sequence', meta.sequenceNumber],
            ['publishDate', 'Publish date', meta.publishDate],
            ['title', 'Reveal title', meta.title],
            ['description', 'Reveal description', meta.description],
          ].map(([key, label, value]) => (
            <label key={key}>
              {label}
              <input
                value={value}
                onChange={(e) =>
                  setMeta((old) => ({ ...old, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <p className="muted">
          Schema version and dimensions are fixed: schemaVersion 1 · 15×15.
        </p>
        {changedFromSource && (
          <p className="warning">
            The solution changed from {sourceId}. Assign a new puzzle ID before
            exporting.
          </p>
        )}
        {(idCollision || seqCollision || dateCollision) && (
          <p className="warning">
            Corpus warning:{' '}
            {[
              idCollision && 'duplicate ID',
              seqCollision && 'duplicate sequenceNumber',
              dateCollision && 'duplicate publishDate',
            ]
              .filter(Boolean)
              .join(', ')}
            .
          </p>
        )}
        <div className="export-actions">
          <button onClick={() => copy(solution.join('\n'), 'Bitmap copied.')}>
            Copy bitmap
          </button>
          <button
            disabled={!metadataValid || exportBlocked}
            onClick={() =>
              copy(JSON.stringify(candidate, null, 2), 'Puzzle JSON copied.')
            }
          >
            Copy puzzle JSON
          </button>
        </div>
        {!metadataValid && (
          <p className="warning">
            Complete all metadata fields before copying candidate JSON.
          </p>
        )}
        {exportBlocked && (
          <p className="warning">
            Export blocked: assign a new puzzle ID before exporting.
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
      </section>
      <p className="author-note">
        Unique solution ≠ deterministic no-guess line solve ≠ recognizable or
        satisfying puzzle. The machine reports constraints; human blind-play and
        silhouette review remain necessary.
      </p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Author />);
