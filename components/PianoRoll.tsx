"use client";
import { useRef } from "react";
import { useEditor } from "@/store/editor";
import { HIGH_PITCH, LOW_PITCH, TOTAL_BEATS } from "@/lib/types";
import { clamp, floorSnap, snap, DRUM_PITCHES } from "@/lib/music";
const ROW = 24,
  BEAT = 64;
const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
type Drag = {
  id: string;
  kind: "move" | "resize";
  x: number;
  y: number;
  start: number;
  duration: number;
  row: number;
};
export function PianoRoll() {
  const notes = useEditor((s) => s.notes),
    add = useEditor((s) => s.addNote),
    update = useEditor((s) => s.updateNote),
    remove = useEditor((s) => s.removeNote);
  const step = useEditor((s) => s.quantization),
    selection = useEditor((s) => s.selection),
    select = useEditor((s) => s.select),
    instrument = useEditor((s) => s.instrument);
  const drag = useRef<Drag | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const drums = instrument === "drums";
  const pitches = drums
    ? [...DRUM_PITCHES]
    : Array.from({ length: HIGH_PITCH - LOW_PITCH + 1 }, (_, i) => HIGH_PITCH - i);
  const rowHeight = drums ? 96 : ROW;
  return (
    <div
      className="roll-scroll"
      tabIndex={0}
      aria-label="Piano roll. Click to add notes. Select a note and press Delete to remove it."
      onKeyDown={(e) => {
        if ((e.key === "Delete" || e.key === "Backspace") && selection) {
          e.preventDefault();
          remove(selection);
        }
        if (e.key === "Escape") select(null);
      }}
    >
      <div className="roll-ruler" style={{ width: 64 + BEAT * TOTAL_BEATS }}>
        <span>BAR</span>
        {[1, 2, 3, 4].map((bar) => (
          <b key={bar} style={{ left: 64 + (bar - 1) * BEAT * 4 }}>
            {bar}
          </b>
        ))}
      </div>
      <div
        className="roll"
        style={{ width: 64 + BEAT * TOTAL_BEATS, height: pitches.length * rowHeight }}
      >
        <div className="key-column">
          {pitches.map((p, i) => (
            <div
              className={`key ${!drums && BLACK.has(p % 12) ? "black" : ""}`}
              key={p}
              style={{ top: i * rowHeight, height: rowHeight }}
            >
              {drums
                ? { 36: "Kick", 38: "Snare", 42: "Hat" }[p]
                : `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`}
            </div>
          ))}
        </div>
        <div
          ref={grid}
          className="roll-grid"
          style={{
            left: 64,
            width: BEAT * TOTAL_BEATS,
            height: pitches.length * rowHeight,
            backgroundSize: `${BEAT * step}px ${rowHeight}px`,
          }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest(".note")) return;
            const box = e.currentTarget.getBoundingClientRect();
            const scale = e.currentTarget.offsetWidth / box.width;
            const row = clamp(
              Math.floor(
                ((e.clientY - box.top) * (e.currentTarget.offsetHeight / box.height)) / rowHeight,
              ),
              0,
              pitches.length - 1,
            );
            add(
              pitches[row],
              clamp(floorSnap(((e.clientX - box.left) * scale) / BEAT, step), 0, 16 - step),
            );
            e.currentTarget.parentElement?.parentElement?.focus({ preventScroll: true });
          }}
        >
          {Array.from({ length: 17 }, (_, i) => (
            <div
              key={i}
              className={`barline ${i % 4 === 0 ? "heavy" : ""}`}
              style={{ left: i * BEAT }}
            />
          ))}
          {notes.map((n) => {
            const row = pitches.indexOf(n.pitch);
            if (row < 0) return null;
            return (
              <button
                key={n.id}
                type="button"
                aria-label={`Note ${n.pitch}, beat ${n.start + 1}, duration ${n.duration}`}
                aria-pressed={selection === n.id}
                title="Drag note body to move; drag right edge to resize. Select then Delete to remove."
                className={`note ${selection === n.id ? "selected" : ""}`}
                style={{
                  left: n.start * BEAT,
                  top: row * rowHeight + 3,
                  width: Math.max(10, n.duration * BEAT - 2),
                  height: rowHeight - 6,
                }}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => select(n.id)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.focus({ preventScroll: true });
                  select(n.id);
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const box = grid.current!.getBoundingClientRect();
                  drag.current = {
                    id: n.id,
                    kind: (e.target as HTMLElement).closest(".note-handle") ? "resize" : "move",
                    x: (e.clientX - box.left) * (grid.current!.offsetWidth / box.width),
                    y: (e.clientY - box.top) * (grid.current!.offsetHeight / box.height),
                    start: n.start,
                    duration: n.duration,
                    row,
                  };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || d.id !== n.id) return;
                  const box = grid.current!.getBoundingClientRect();
                  const dx = (e.clientX - box.left) * (grid.current!.offsetWidth / box.width) - d.x,
                    dy = (e.clientY - box.top) * (grid.current!.offsetHeight / box.height) - d.y;
                  if (d.kind === "resize")
                    update(n.id, {
                      duration: clamp(snap(d.duration + dx / BEAT, step), step, 16 - d.start),
                    });
                  else
                    update(n.id, {
                      start: clamp(snap(d.start + dx / BEAT, step), 0, 16 - d.duration),
                      pitch:
                        pitches[clamp(d.row + Math.round(dy / rowHeight), 0, pitches.length - 1)],
                    });
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onLostPointerCapture={() => {
                  drag.current = null;
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  remove(n.id);
                }}
              >
                <span className="note-body" aria-hidden="true" />
                <span
                  className="note-handle"
                  aria-hidden="true"
                  title="Drag right edge to resize"
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="roll-hint">
        Click empty cell to add · drag note body to move · drag right edge to resize · select then
        Delete · {notes.length}/512 notes
      </div>
    </div>
  );
}
