import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "./types";

const audio = vi.hoisted(() => ({
  start: vi.fn<() => Promise<void>>(),
  timers: new Map<number, () => void>(),
  nextTimer: 0,
  triggers: vi.fn(),
  disposed: vi.fn(),
}));

vi.mock("tone", () => {
  class Voice {
    maxPolyphony = 64;
    connect() {
      return this;
    }
    toDestination() {
      return this;
    }
    dispose() {
      audio.disposed();
    }
    triggerAttackRelease(...args: unknown[]) {
      audio.triggers(...args);
    }
  }
  return {
    start: audio.start,
    now: () => 0,
    immediate: () => 0,
    Gain: Voice,
    PolySynth: Voice,
    Synth: Voice,
    Frequency: (pitch: number) => ({ toFrequency: () => pitch }),
    getContext: () => ({
      state: "running",
      setTimeout: (callback: () => void) => {
        const id = ++audio.nextTimer;
        audio.timers.set(id, callback);
        return id;
      },
      clearTimeout: (id: number) => audio.timers.delete(id),
    }),
  };
});

import {
  getPlayback,
  getPlaybackComposition,
  pauseAudio,
  playNotes,
  resumeAudio,
  stopAudio,
  updatePlaybackNotes,
} from "./audio";

const note = (pitch: number): Note => ({ id: "note", pitch, start: 8, duration: 1, velocity: 100 });

describe("live editor session lifecycle", () => {
  beforeEach(() => {
    stopAudio();
    vi.clearAllMocks();
    audio.start.mockResolvedValue(undefined);
    audio.timers.clear();
  });
  afterEach(() => stopAudio());

  it("uses edits received during initialization without restarting the session", async () => {
    let finish!: () => void;
    audio.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = playNotes([note(60)], 120, "piano", "editor", true);
    await vi.waitFor(() => expect(audio.start).toHaveBeenCalledOnce());
    updatePlaybackNotes("editor", [note(64)], 1);
    finish();
    await pending;
    expect(getPlayback().status).toBe("playing");
    expect(getPlaybackComposition()?.notes[0].pitch).toBe(64);
    expect(audio.start).toHaveBeenCalledOnce();
    expect(audio.disposed).not.toHaveBeenCalled();
  });

  it("rejects other owners and preserves an empty live composition through pause/resume", async () => {
    await playNotes([note(60)], 120, "piano", "editor", true);
    updatePlaybackNotes("other-player", [note(72)], 999);
    expect(getPlaybackComposition()?.notes[0].pitch).toBe(60);
    updatePlaybackNotes("editor", [], 1);
    expect(getPlayback().status).toBe("playing");
    expect(getPlaybackComposition()?.notes).toEqual([]);
    pauseAudio("editor");
    await resumeAudio("editor");
    expect(getPlayback().status).toBe("playing");
    expect(getPlaybackComposition()?.notes).toEqual([]);
    updatePlaybackNotes("editor", [note(67)], 2);
    expect(getPlaybackComposition()?.notes[0].pitch).toBe(67);
    stopAudio("editor");
    expect(getPlaybackComposition()).toBeNull();
    expect(audio.timers.size).toBe(0);
  });
});
