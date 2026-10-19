"use client";
import { useEffect, useRef, useState } from "react";
import { createNotePreview } from "@/lib/note-preview";
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
  members: { id: string; start: number; duration: number; row: number }[];
  previewPitch: number;
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
  const [group, setGroup] = useState<string[]>([]);
  const selected = new Set(
    selection && group.includes(selection) ? group : selection ? [selection] : [],
  );
  const preview = useRef<ReturnType<typeof createNotePreview> | null>(null);
  useEffect(() => () => preview.current?.dispose(), []);
  const audition = (pitch: number) => {
    preview.current ??= createNotePreview();
    void preview.current.play(pitch);
  };
  const endDrag = () => {
    drag.current = null;
    preview.current?.stop();
  };
  const drums = instrument === "drums";
  const pitches = drums
    ? [...DRUM_PITCHES]
    : Array.from({ length: HIGH_PITCH - LOW_PITCH + 1 }, (_, i) => HIGH_PITCH - i);
  const rowHeight = drums ? 96 : ROW;
  return (
    <div
      className="roll-scroll"
      tabIndex={0}
      aria-label="Piano roll. Click to add notes. Shift-click to select multiple notes. Press Delete to remove selected notes."
      onKeyDown={(e) => {
        if ((e.key === "Delete" || e.key === "Backspace") && selection) {
          e.preventDefault();
          selected.forEach(remove);
          setGroup([]);
        }
        if (e.key === "Escape") {
          select(null);
          setGroup([]);
          endDrag();
        }
      }}
    >
      <div className="roll-ruler" style={{ width: "100%", minWidth: 64 + BEAT * TOTAL_BEATS }}>
        <span>BAR</span>
        {[1, 2, 3, 4].map((bar) => (
          <b key={bar} style={{ left: `calc(64px + (100% - 64px) * ${(bar - 1) / 4})` }}>
            {bar}
          </b>
        ))}
      </div>
      <div
        className="roll"
        style={{
          width: "100%",
          minWidth: 64 + BEAT * TOTAL_BEATS,
          height: pitches.length * rowHeight,
        }}
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
            width: "calc(100% - 64px)",
            height: pitches.length * rowHeight,
            backgroundSize: `${(100 * step) / TOTAL_BEATS}% ${rowHeight}px`,
          }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest(".note")) return;
            const box = e.currentTarget.getBoundingClientRect();
            const row = clamp(
              Math.floor(
                ((e.clientY - box.top) * (e.currentTarget.offsetHeight / box.height)) / rowHeight,
              ),
              0,
              pitches.length - 1,
            );
            add(
              pitches[row],
              clamp(
                floorSnap(((e.clientX - box.left) / box.width) * TOTAL_BEATS, step),
                0,
                TOTAL_BEATS - step,
              ),
            );
            setGroup([]);
            audition(pitches[row]);
            e.currentTarget.parentElement?.parentElement?.focus({ preventScroll: true });
          }}
        >
          {Array.from({ length: 17 }, (_, i) => (
            <div
              key={i}
              className={`barline ${i % 4 === 0 ? "heavy" : ""}`}
              style={{ left: `${(i / TOTAL_BEATS) * 100}%` }}
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
                aria-pressed={selected.has(n.id)}
                title="Drag note body to move; drag right edge to resize. Select then Delete to remove."
                className={`note ${selected.has(n.id) ? "selected" : ""}`}
                style={{
                  left: `${(n.start / TOTAL_BEATS) * 100}%`,
                  top: row * rowHeight + 3,
                  width: `max(10px, calc(${(n.duration / TOTAL_BEATS) * 100}% - 2px))`,
                  height: rowHeight - 6,
                }}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => {
                  if (!selected.has(n.id)) select(n.id);
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.shiftKey) {
                    const next = selected.has(n.id)
                      ? [...selected].filter((id) => id !== n.id)
                      : [...selected, n.id];
                    setGroup(next);
                    select(next.includes(n.id) ? n.id : (next[0] ?? null));
                    return;
                  }
                  const moving = selected.has(n.id) ? selected : new Set([n.id]);
                  setGroup([...moving]);
                  e.currentTarget.focus({ preventScroll: true });
                  select(n.id);
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const box = grid.current!.getBoundingClientRect();
                  drag.current = {
                    id: n.id,
                    kind: (e.target as HTMLElement).closest(".note-handle") ? "resize" : "move",
                    x: ((e.clientX - box.left) / box.width) * TOTAL_BEATS,
                    y: (e.clientY - box.top) * (grid.current!.offsetHeight / box.height),
                    start: n.start,
                    duration: n.duration,
                    row,
                    members: notes
                      .filter((note) => moving.has(note.id))
                      .map((note) => ({
                        id: note.id,
                        start: note.start,
                        duration: note.duration,
                        row: pitches.indexOf(note.pitch),
                      })),
                    previewPitch: n.pitch,
                  };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || d.id !== n.id) return;
                  const box = grid.current!.getBoundingClientRect();
                  const dx = ((e.clientX - box.left) / box.width) * TOTAL_BEATS - d.x,
                    dy = (e.clientY - box.top) * (grid.current!.offsetHeight / box.height) - d.y;
                  if (d.kind === "resize")
                    update(n.id, {
                      duration: clamp(snap(d.duration + dx, step), step, TOTAL_BEATS - d.start),
                    });
                  else {
                    const delta = clamp(
                      snap(dx, step),
                      -Math.min(...d.members.map((m) => m.start)),
                      TOTAL_BEATS - Math.max(...d.members.map((m) => m.start + m.duration)),
                    );
                    const rows = clamp(
                      Math.round(dy / rowHeight),
                      -Math.min(...d.members.map((m) => m.row)),
                      pitches.length - 1 - Math.max(...d.members.map((m) => m.row)),
                    );
                    d.members.forEach((m) =>
                      update(m.id, { start: m.start + delta, pitch: pitches[m.row + rows] }),
                    );
                    const pitch = pitches[d.row + rows];
                    if (pitch !== d.previewPitch) {
                      d.previewPitch = pitch;
                      audition(pitch);
                    }
                  }
                }}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
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
        Click empty cell to add · Shift-click to select multiple · drag note body to move · drag
        right edge to resize · select then Delete · {notes.length}/512 notes
      </div>
    </div>
  );
}
