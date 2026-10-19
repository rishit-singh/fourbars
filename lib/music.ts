import { HIGH_PITCH, LOW_PITCH, TOTAL_BEATS, type Note, type Quantization } from "./types";
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** Snap musical beats, independent of screen coordinates or tempo. */
export const snap = (x: number, step: Quantization = 0.5) => Math.round(x / step) * step;
/** Place a click in its containing snap cell; unlike dragging, never round forward. */
export const floorSnap = (x: number, step: Quantization = 0.5) => Math.floor(x / step) * step;
export const DRUM_PITCHES = [42, 38, 36] as const;
/** Normalize a note without allowing its end beyond the four-bar boundary. */
export function normalizedNote(note: Note, step: Quantization = 0.5, drums = false): Note {
  const start = clamp(snap(note.start, step), 0, TOTAL_BEATS - step);
  const pitch = drums
    ? DRUM_PITCHES.reduce((a, b) => (Math.abs(b - note.pitch) < Math.abs(a - note.pitch) ? b : a))
    : Math.round(clamp(note.pitch, LOW_PITCH, HIGH_PITCH));
  return {
    ...note,
    pitch,
    start,
    duration: clamp(snap(note.duration, step), step, TOTAL_BEATS - start),
    velocity: Math.round(clamp(note.velocity, 1, 127)),
  };
}
export function secondsForBeats(beats: number, bpm: number) {
  return (beats * 60) / bpm;
}
