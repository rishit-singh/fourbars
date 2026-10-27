import type { Note } from "./types";

/** Seconds ahead of the raw audio clock, NOT Tone.now() (which adds lookahead). */
export const LIVE_SCHEDULE_HORIZON = 0.2;

/**
 * Immutable snapshots are reconciled on the clock tick, not on pointer events.
 * Submitted attacks/releases cannot be individually recalled: edits in the next
 * 200 ms may still sound as submitted, and sounding notes retain their envelope.
 * Identity is session/cycle/note ID, deliberately independent of revision/start.
 */
export function createLivePlaybackSchedule({
  start,
  duration,
  bpm,
  drums,
  now,
  repeat,
  initialPosition = 0,
  getSnapshot,
  trigger,
  finish,
  every,
}: {
  start: number;
  duration: number;
  bpm: number;
  drums: boolean;
  now: () => number;
  repeat: boolean;
  initialPosition?: number;
  getSnapshot: () => { notes: readonly Note[]; revision: number };
  trigger: (note: Note, at: number) => void;
  finish: () => void;
  every: (callback: () => void) => () => void;
}) {
  let cancelled = false;
  let finalCycle = repeat ? Infinity : 0;
  let lastCycle = -1;
  let revision: number | undefined;
  let ordered: readonly Note[] = [];
  let firstTick = true;
  let cancelTimer = () => {};
  const occurrences = new Map<number, Set<string>>();
  // Shared monophonic drum voices require increasing attack timestamps, even
  // when a revision introduces a different ID inside the committed horizon.
  const drumThrough = new Map<number, number>();
  const tick = () => {
    if (cancelled) return;
    const time = now();
    const currentCycle = Math.floor(Math.max(0, time - start) / duration);
    for (const cycle of occurrences.keys()) {
      if (cycle < currentCycle) occurrences.delete(cycle);
    }
    const snapshot = getSnapshot();
    if (snapshot.revision !== revision) {
      revision = snapshot.revision;
      ordered = [...snapshot.notes].sort((a, b) => a.start - b.start);
    }
    const end = time + LIVE_SCHEDULE_HORIZON;
    const boundary = Math.max(time, start + initialPosition);
    // Skip missed cycles after a suspended context; never burst stale attacks.
    const throughCycle = Math.min(finalCycle, Math.floor((end - start) / duration));
    for (let cycle = currentCycle; cycle <= throughCycle && !cancelled; cycle++) {
      lastCycle = Math.max(lastCycle, cycle);
      let submitted = occurrences.get(cycle);
      if (!submitted) occurrences.set(cycle, (submitted = new Set()));
      const cycleStart = start + cycle * duration;
      for (const note of ordered) {
        if (cancelled) return;
        let at = cycleStart + (note.start * 60) / bpm;
        if (at > end) break;
        if (submitted.has(note.id)) continue;
        let sounding = note;
        if (at < boundary) {
          // Only seek/resume catches an overlapping pitched note. An ordinary
          // edit behind the playhead must not retrigger a sounding note.
          if (!firstTick || initialPosition <= 0 || cycle !== 0 || drums) continue;
          const remaining = at + (note.duration * 60) / bpm - boundary;
          if (remaining <= 0) continue;
          at = boundary;
          if (at > end) continue;
          sounding = { ...note, duration: (remaining * bpm) / 60 };
        }
        if (drums) {
          if (at <= (drumThrough.get(note.pitch) ?? -Infinity)) continue;
          drumThrough.set(note.pitch, at);
        }
        submitted.add(note.id);
        trigger(sounding, at);
      }
    }
    // Keep seek catch-up pending if the initial audible start is beyond the
    // horizon (e.g. a context configured with unusually large lookahead).
    if (end >= start + initialPosition) firstTick = false;
    if (!cancelled && time >= start + (finalCycle + 1) * duration + 0.4) {
      cancelled = true;
      cancelTimer();
      occurrences.clear();
      drumThrough.clear();
      finish();
    }
  };
  cancelTimer = every(tick);
  try {
    tick();
  } catch (error) {
    cancelled = true;
    cancelTimer();
    throw error;
  }
  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      cancelTimer();
      occurrences.clear();
      drumThrough.clear();
    },
    setLoop(loop: boolean) {
      if (cancelled) return;
      // Preserve a next pass already admitted to the short scheduling window.
      finalCycle = loop
        ? Infinity
        : Math.max(lastCycle, Math.floor(Math.max(0, now() - start) / duration));
      tick();
    },
    position() {
      const elapsed = Math.max(initialPosition, 0, now() - start);
      return elapsed >= (finalCycle + 1) * duration ? duration : elapsed % duration;
    },
    /** Diagnostic count: only current/queued cycles survive, never loop history. */
    get retainedOccurrenceCount() {
      let count = 0;
      for (const submitted of occurrences.values()) count += submitted.size;
      return count;
    },
  };
}
