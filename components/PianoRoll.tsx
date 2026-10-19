"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  getPlayback,
  getPlaybackComposition,
  getPlaybackElapsed,
  getServerPlayback,
  subscribePlayback,
} from "@/lib/audio";
import { createNotePreview } from "@/lib/note-preview";
import { useEditor } from "@/store/editor";
import { HIGH_PITCH, LOW_PITCH, TOTAL_BEATS, type Instrument, type Note } from "@/lib/types";
import { clamp, floorSnap, snap, DRUM_PITCHES } from "@/lib/music";
import "@/app/piano-playback.css";
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
type Marquee = { x: number; y: number; endX: number; endY: number; base: string[] };
function PlaybackOverlay({
  notes,
  bpm,
  instrument,
  pitches,
  rowHeight,
}: {
  notes: Note[];
  bpm: number;
  instrument: Instrument;
  pitches: number[];
  rowHeight: number;
}) {
  const playback = useSyncExternalStore(subscribePlayback, getPlayback, getServerPlayback);
  const composition = getPlaybackComposition();
  const matches = useMemo(() => {
    if (
      !composition ||
      composition.bpm !== bpm ||
      composition.instrument !== instrument ||
      composition.notes.length !== notes.length
    )
      return false;
    // Validation clones the source array. Match actual note content, not array identity.
    const byId = new Map(composition.notes.map((note) => [note.id, note]));
    return notes.every((note) => {
      const source = byId.get(note.id);
      return (
        source &&
        source.pitch === note.pitch &&
        source.start === note.start &&
        source.duration === note.duration &&
        source.velocity === note.velocity
      );
    });
  }, [composition, notes, bpm, instrument]);
  const [sample, setSample] = useState(() => ({ playback, elapsed: getPlaybackElapsed() }));
  useEffect(() => {
    if (!matches || playback.status !== "playing") return;
    let frame: number;
    const tick = () => {
      setSample({ playback, elapsed: getPlaybackElapsed() });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [matches, playback]);
  if (!matches || (playback.status !== "playing" && playback.status !== "paused")) return null;
  // The scheduler supplies loop-relative audio time, including paused seeks.
  const elapsed = sample.playback === playback ? sample.elapsed : getPlaybackElapsed();
  const beat = clamp(elapsed / (60 / bpm), 0, TOTAL_BEATS);
  return (
    <div className="roll-playback-overlay" aria-hidden="true">
      {playback.status === "playing" &&
        notes.map((note) => {
          if (beat < note.start || beat >= note.start + note.duration) return null;
          const row = pitches.indexOf(note.pitch);
          if (row < 0) return null;
          return (
            <div
              key={note.id}
              className="roll-sounding-note"
              style={{
                left: `${(note.start / TOTAL_BEATS) * 100}%`,
                top: row * rowHeight + 3,
                width: `max(10px, calc(${(note.duration / TOTAL_BEATS) * 100}% - 2px))`,
                height: rowHeight - 6,
              }}
            />
          );
        })}
      <div
        className="roll-playhead"
        data-paused={playback.status === "paused"}
        style={{ left: `${(beat / TOTAL_BEATS) * 100}%` }}
      />
    </div>
  );
}
export function PianoRoll({ mode = "draw" }: { mode?: "draw" | "select" }) {
  const notes = useEditor((s) => s.notes),
    add = useEditor((s) => s.addNote),
    update = useEditor((s) => s.updateNote),
    remove = useEditor((s) => s.removeNote);
  const step = useEditor((s) => s.quantization),
    selection = useEditor((s) => s.selection),
    select = useEditor((s) => s.select),
    instrument = useEditor((s) => s.instrument),
    bpm = useEditor((s) => s.bpm);
  const drag = useRef<Drag | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [group, setGroup] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const marqueeRef = useRef<Marquee | null>(null);
  const selected = new Set(
    selection && group.includes(selection) ? group : selection ? [selection] : [],
  );
  const preview = useRef<ReturnType<typeof createNotePreview> | null>(null);
  useEffect(() => () => preview.current?.dispose(), []);
  useEffect(() => {
    preview.current?.stop();
  }, [instrument]);
  const audition = (pitch: number) => {
    preview.current ??= createNotePreview();
    void preview.current.play(pitch, instrument);
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
    <div className="piano-roll-editor" onPointerLeave={() => preview.current?.stop()}>
      <div
        className="roll-scroll"
        tabIndex={0}
        aria-label={`Piano roll. ${mode === "draw" ? "Click to add notes." : "Drag empty space to select notes."} Shift-click toggles selection. Delete removes selected notes. Escape clears selection.`}
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
            marqueeRef.current = null;
            setMarquee(null);
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
              <button
                type="button"
                className={`key ${!drums && BLACK.has(p % 12) ? "black" : ""}`}
                key={p}
                style={{ top: i * rowHeight, height: rowHeight }}
                aria-label={`Audition ${drums ? { 36: "Kick", 38: "Snare", 42: "Hat" }[p] : `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`}`}
                aria-pressed={selectedKey === p}
                title="Hover or click to audition"
                onPointerEnter={(e) => {
                  if (e.pointerType !== "touch") audition(p);
                }}
                onPointerLeave={() => preview.current?.stop()}
                onPointerCancel={() => preview.current?.stop()}
                onBlur={() => preview.current?.stop()}
                onClick={() => {
                  setSelectedKey(p);
                  audition(p);
                }}
              >
                {drums
                  ? { 36: "Kick", 38: "Snare", 42: "Hat" }[p]
                  : `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`}
              </button>
            ))}
          </div>
          <div
            ref={grid}
            className="roll-grid"
            data-mode={mode}
            style={{
              left: 64,
              width: "calc(100% - 64px)",
              height: pitches.length * rowHeight,
              backgroundSize: `${(100 * step) / TOTAL_BEATS}% ${rowHeight}px`,
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              if ((e.target as HTMLElement).closest(".note")) return;
              e.preventDefault();
              const box = e.currentTarget.getBoundingClientRect();
              e.currentTarget.parentElement?.parentElement?.focus({ preventScroll: true });
              if (mode === "select") {
                const x = clamp(((e.clientX - box.left) / box.width) * TOTAL_BEATS, 0, TOTAL_BEATS);
                const y = clamp(
                  (e.clientY - box.top) * (e.currentTarget.offsetHeight / box.height),
                  0,
                  pitches.length * rowHeight,
                );
                const next = { x, y, endX: x, endY: y, base: e.shiftKey ? [...selected] : [] };
                marqueeRef.current = next;
                setMarquee(next);
                setGroup(next.base);
                select(next.base[0] ?? null);
                e.currentTarget.setPointerCapture(e.pointerId);
                return;
              }
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
            onPointerMove={(e) => {
              const start = marqueeRef.current;
              if (!start) return;
              const box = e.currentTarget.getBoundingClientRect();
              const next = {
                ...start,
                endX: clamp(((e.clientX - box.left) / box.width) * TOTAL_BEATS, 0, TOTAL_BEATS),
                endY: clamp(
                  (e.clientY - box.top) * (e.currentTarget.offsetHeight / box.height),
                  0,
                  pitches.length * rowHeight,
                ),
              };
              const hits = notes
                .filter((note) => {
                  const row = pitches.indexOf(note.pitch);
                  return (
                    row >= 0 &&
                    note.start < Math.max(next.x, next.endX) &&
                    note.start + note.duration > Math.min(next.x, next.endX) &&
                    row * rowHeight + 3 < Math.max(next.y, next.endY) &&
                    (row + 1) * rowHeight - 3 > Math.min(next.y, next.endY)
                  );
                })
                .map((note) => note.id);
              const ids = [...new Set([...next.base, ...hits])];
              setGroup(ids);
              select(ids[0] ?? null);
              setMarquee(next);
            }}
            onPointerUp={() => {
              marqueeRef.current = null;
              setMarquee(null);
            }}
            onPointerCancel={() => {
              marqueeRef.current = null;
              setMarquee(null);
            }}
            onLostPointerCapture={() => {
              marqueeRef.current = null;
              setMarquee(null);
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
                      grid.current?.parentElement?.parentElement?.focus({ preventScroll: true });
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
                    audition(n.pitch);
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
            {marquee && (
              <div
                className="roll-marquee"
                aria-hidden="true"
                style={{
                  left: `${(Math.min(marquee.x, marquee.endX) / TOTAL_BEATS) * 100}%`,
                  width: `${(Math.abs(marquee.endX - marquee.x) / TOTAL_BEATS) * 100}%`,
                  top: Math.min(marquee.y, marquee.endY),
                  height: Math.abs(marquee.endY - marquee.y),
                }}
              />
            )}
            <PlaybackOverlay
              notes={notes}
              bpm={bpm}
              instrument={instrument}
              pitches={pitches}
              rowHeight={rowHeight}
            />
          </div>
        </div>
      </div>
      <div className="roll-hint">
        <span>
          {mode === "draw" ? "Draw: click to add" : "Select: drag a box"} · Shift-click to toggle ·
          Drag to move · Edge to resize · Delete · Esc clears
        </span>
        <span className="roll-note-count">{notes.length}/512 notes</span>
      </div>
    </div>
  );
}
