"use client";
import type { Instrument, Note } from "./types";
import { compositionSchema } from "./validation";
import { createLivePlaybackSchedule } from "./live-schedule";

type Playback = {
  owner: string | null;
  status: "idle" | "loading" | "playing" | "paused";
  position?: number;
  started: number;
  duration: number;
  loop: boolean;
  error?: { owner: string; message: string };
};
const idle: Playback = { owner: null, status: "idle", started: 0, duration: 0, loop: false };
let state = idle;
const listeners = new Set<() => void>();
let generation = 0;
let dispose: (() => void) | undefined;
let schedule: ReturnType<typeof createLivePlaybackSchedule> | undefined;
let composition: { notes: Note[]; bpm: number; instrument: Instrument } | undefined;
let compositionRevision = -Infinity;
function emit(value: Playback) {
  state = value;
  listeners.forEach((fn) => fn());
}
export const subscribePlayback = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const getPlayback = () => state;
export const getServerPlayback = () => idle;
export const getPlaybackElapsed = () => schedule?.position() ?? state.position ?? 0;
export const getPlaybackComposition = (): {
  notes: Note[];
  bpm: number;
  instrument: Instrument;
} | null => composition ?? null;

/**
 * Publish an already-normalized immutable editor snapshot in O(1). Revisions
 * must increase within an owner's playback session. BPM/instrument stay captured.
 * The scheduler reconciles on its next tick; already submitted attacks within
 * 200 ms of the raw audio clock and sounding notes retain their original sound.
 */
export function updatePlaybackNotes(owner: string, notes: Note[], revision: number): void {
  if (
    state.owner !== owner ||
    !composition ||
    !Number.isFinite(revision) ||
    revision <= compositionRevision
  )
    return;
  compositionRevision = revision;
  composition = { ...composition, notes };
}

/** A bounded audio-clock scheduler: at most one future pass is queued, never restarted. */
export function createPlaybackSchedule({
  start,
  duration,
  now,
  repeat,
  initialPosition = 0,
  playCycle,
  finish,
  every,
}: {
  start: number;
  duration: number;
  now: () => number;
  repeat: boolean;
  initialPosition?: number;
  playCycle: (at: number, skipBefore: number) => void;
  finish: () => void;
  every: (callback: () => void) => () => void;
}) {
  let cancelled = false;
  let lastCycle = -1;
  let finalCycle = repeat ? Infinity : 0;
  let cancelTimer = () => {};
  const tick = () => {
    if (cancelled) return;
    const time = now();
    // After a suspended/throttled context, skip missed passes rather than burst stale notes.
    const nextCycle = Math.max(lastCycle + 1, Math.floor(Math.max(0, time - start) / duration));
    if (nextCycle <= finalCycle && start + nextCycle * duration <= time + 0.25) {
      lastCycle = nextCycle;
      playCycle(start + nextCycle * duration, time);
    }
    if (time >= start + (finalCycle + 1) * duration + 0.4) {
      cancelled = true;
      cancelTimer();
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
      cancelled = true;
      cancelTimer();
    },
    setLoop(loop: boolean) {
      if (cancelled) return;
      // Finish the queued pass on Loop off; never tear down/restart live voices.
      finalCycle = loop
        ? Infinity
        : Math.max(lastCycle, Math.floor(Math.max(0, now() - start) / duration));
      tick();
    },
    position() {
      // The audio start is slightly ahead of the clock; don't move backward after a seek.
      const elapsed = Math.max(initialPosition, 0, now() - start);
      return elapsed >= (finalCycle + 1) * duration ? duration : elapsed % duration;
    },
  };
}

export function setPlaybackLoop(owner: string, loop: boolean) {
  if (state.owner !== owner || state.loop === loop) return;
  schedule?.setLoop(loop);
  emit({ ...state, loop });
}

/** Invalidate pending imports as well as scheduled voices, so Stop cannot race Play. */
export function stopAudio(owner?: string) {
  if (owner && state.owner !== owner) return;
  generation++;
  const cleanup = dispose;
  dispose = undefined;
  schedule = undefined;
  composition = undefined;
  compositionRevision = -Infinity;
  cleanup?.();
  emit(idle);
}

export function pauseAudio(owner: string) {
  if (state.owner !== owner || state.status !== "playing") return;
  const paused = { ...state, status: "paused" as const, position: getPlaybackElapsed() };
  const saved = composition;
  const savedRevision = compositionRevision;
  stopAudio(owner);
  composition = saved;
  compositionRevision = savedRevision;
  emit(paused);
}

export async function resumeAudio(owner: string) {
  if (state.owner !== owner || state.status !== "paused" || !composition) return;
  const { notes, bpm, instrument } = composition;
  const position = (state.position ?? 0) >= state.duration ? 0 : state.position;
  await startPlayback(
    notes,
    bpm,
    instrument,
    owner,
    state.loop,
    position ?? 0,
    compositionRevision,
  );
}

export async function seekAudio(owner: string, position: number) {
  if (state.owner !== owner || !composition || !Number.isFinite(position)) return;
  position = Math.max(0, Math.min(state.duration, position));
  if (state.status === "loading") {
    const { notes, bpm, instrument } = composition;
    await startPlayback(notes, bpm, instrument, owner, state.loop, position, compositionRevision);
    return;
  }
  const playing = state.status === "playing";
  if (playing) pauseAudio(owner);
  if (state.status !== "paused") return;
  emit({ ...state, position });
  if (playing && position < state.duration) await resumeAudio(owner);
}

export async function playNotes(
  notes: Note[],
  bpm: number,
  instrument: Instrument,
  owner: string,
  loop = false,
  offset = 0,
) {
  notes = compositionSchema.parse({ notes, bpm, instrument, key: "C" }).notes;
  if (!notes.length) throw new Error("Add a note first");
  await startPlayback(notes, bpm, instrument, owner, loop, offset);
}

/** Resume/seek may start an empty edited composition while keeping transport alive. */
async function startPlayback(
  notes: Note[],
  bpm: number,
  instrument: Instrument,
  owner: string,
  loop: boolean,
  offset: number,
  revision = -Infinity,
) {
  stopAudio();
  const token = generation;
  const duration = (16 * 60) / bpm;
  offset = Number.isFinite(offset) ? Math.max(0, Math.min(duration, offset)) : 0;
  composition = { notes, bpm, instrument };
  compositionRevision = revision;
  emit({ owner, status: "loading", started: 0, duration, loop, position: offset });
  const resources: { dispose: () => unknown }[] = [];
  let ownSchedule: ReturnType<typeof createLivePlaybackSchedule> | undefined;
  const cleanup = () => {
    ownSchedule?.cancel();
    resources
      .splice(0)
      .reverse()
      .forEach((r) => r.dispose());
  };
  try {
    const Tone = await import("tone");
    if (token !== generation) return;
    await Tone.start();
    if (token !== generation) return;
    if (Tone.getContext().state !== "running")
      throw new Error("Audio is blocked. Tap Play again to enable it.");
    // Keep every voice behind one gain node; disposing it silences even future scheduled notes.
    const output = new Tone.Gain(0.6).toDestination();
    resources.push(output);
    const audibleStart = Tone.now() + 0.08;
    const start = audibleStart - offset;
    let trigger: (note: Note, at: number) => void;
    if (instrument === "drums") {
      const kick = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 5,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
      }).connect(output);
      const snare = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.13, sustain: 0, release: 0.02 },
      }).connect(output);
      const hat = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
      }).connect(output);
      snare.volume.value = -12;
      hat.volume.value = -22;
      resources.push(kick, snare, hat);
      trigger = (n, at) => {
        if (n.pitch === 36) kick.triggerAttackRelease("C1", 0.12, at, n.velocity / 127);
        else if (n.pitch === 38) snare.triggerAttackRelease(0.1, at, n.velocity / 127);
        else if (n.pitch === 42) hat.triggerAttackRelease("C5", 0.03, at, n.velocity / 127);
      };
    } else {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: instrument === "bass" ? "sine" : "triangle" },
        envelope:
          instrument === "bass"
            ? { attack: 0.015, decay: 0.18, sustain: 0.65, release: 0.12 }
            : { attack: 0.005, decay: 0.35, sustain: 0.12, release: 0.3 },
      }).connect(output);
      synth.maxPolyphony = 64;
      resources.push(synth);
      trigger = (n, at) =>
        synth.triggerAttackRelease(
          Tone.Frequency(n.pitch, "midi").toFrequency(),
          (n.duration * 60) / bpm,
          at,
          n.velocity / 127,
        );
    }
    ownSchedule = createLivePlaybackSchedule({
      start,
      duration,
      bpm,
      drums: instrument === "drums",
      now: () => Tone.immediate(),
      repeat: state.loop,
      initialPosition: offset,
      getSnapshot: () => ({ notes: composition?.notes ?? [], revision: compositionRevision }),
      trigger: (note, at) => {
        if (token === generation) trigger(note, at);
      },
      finish: () => {
        if (token === generation) stopAudio(owner);
      },
      every: (callback) => {
        const context = Tone.getContext();
        let active = true;
        let timer: number;
        const tick = () => {
          if (!active) return;
          try {
            callback();
          } catch (error) {
            active = false;
            if (token === generation) {
              stopAudio(owner);
              emit({
                ...idle,
                error: {
                  owner,
                  message:
                    error instanceof Error ? error.message : "Audio unavailable. Try Play again.",
                },
              });
            }
          }
          if (active) timer = context.setTimeout(tick, 0.05);
        };
        timer = context.setTimeout(tick, 0.05);
        return () => {
          active = false;
          context.clearTimeout(timer);
        };
      },
    });
    schedule = ownSchedule;
    dispose = cleanup;
    emit({
      owner,
      status: "playing",
      started: performance.now() + (start - Tone.immediate()) * 1000,
      duration,
      loop: state.loop,
    });
  } catch (e) {
    cleanup();
    if (token === generation) {
      dispose = undefined;
      schedule = undefined;
      composition = undefined;
      compositionRevision = -Infinity;
      emit(idle);
      throw e;
    }
  }
}
export async function exportMidi(
  notes: Note[],
  bpm: number,
  title: string,
  instrument: Instrument = "piano",
) {
  const { buildMidi } = await import("./midi");
  const bytes = buildMidi({ notes, bpm, instrument, key: "C" }, title);
  const blob = new Blob([new Uint8Array(bytes)], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9-_]/gi, "-") || "fourbars"}.mid`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
