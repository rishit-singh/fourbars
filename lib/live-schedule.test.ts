import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLivePlaybackSchedule, LIVE_SCHEDULE_HORIZON } from "./live-schedule";
import {
  getPlayback,
  getPlaybackComposition,
  getPlaybackElapsed,
  pauseAudio,
  playNotes,
  resumeAudio,
  seekAudio,
  stopAudio,
  updatePlaybackNotes,
} from "./audio";
import type { Note } from "./types";

const note = (id: string, start: number, changes: Partial<Note> = {}): Note => ({
  id,
  start,
  pitch: 60,
  duration: 0.5,
  velocity: 100,
  ...changes,
});

function clock(
  notes: Note[],
  options: { repeat?: boolean; drums?: boolean; initialPosition?: number } = {},
) {
  let time = 0;
  let tick = () => {};
  let snapshot = { notes, revision: 0 };
  const trigger = vi.fn();
  const finish = vi.fn();
  const cancelTimer = vi.fn();
  const schedule = createLivePlaybackSchedule({
    start: 0.18 - (options.initialPosition ?? 0),
    duration: 8,
    bpm: 120,
    drums: false,
    repeat: true,
    ...options,
    now: () => time,
    getSnapshot: () => snapshot,
    trigger,
    finish,
    every: (callback) => {
      tick = callback;
      return cancelTimer;
    },
  });
  return {
    schedule,
    trigger,
    finish,
    cancelTimer,
    at(value: number) {
      time = value;
      tick();
    },
    edit(notes: Note[]) {
      snapshot = { notes, revision: snapshot.revision + 1 };
    },
  };
}

describe("rolling immutable-note scheduling", () => {
  it("allows a suppressed drum collision to move to a later beat in the same cycle", () => {
    const a = note("a", 2, { pitch: 36 });
    const b = note("b", 2, { pitch: 36 });
    const c = clock([a, b], { drums: true });
    c.at(1);
    expect(c.trigger).toHaveBeenCalledTimes(1);
    c.edit([a, { ...b, start: 6 }]);
    c.at(3);
    expect(c.trigger).toHaveBeenCalledTimes(2);
    expect(c.trigger.mock.calls[1]).toEqual([{ ...b, start: 6 }, 3.18]);
    c.at(3.1);
    expect(c.trigger).toHaveBeenCalledTimes(2);
  });

  it("adds, moves, changes and deletes future notes without shifting the clock", () => {
    const c = clock([note("move", 6), note("delete", 8)]);
    expect(c.trigger).not.toHaveBeenCalled();
    c.at(1);
    c.edit([note("move", 4, { pitch: 64, duration: 2, velocity: 45 }), note("add", 3)]);
    c.at(1.5);
    expect(c.trigger.mock.calls).toEqual([[note("add", 3), 1.68]]);
    c.at(2);
    expect(c.trigger.mock.calls[1]).toEqual([
      note("move", 4, { pitch: 64, duration: 2, velocity: 45 }),
      2.18,
    ]);
    c.at(3);
    c.at(4);
    expect(c.trigger).toHaveBeenCalledTimes(2);
    expect(c.schedule.position()).toBeCloseTo(3.82);
  });

  it("coalesces revisions and never resubmits a committed ID after a move or re-add", () => {
    const c = clock([note("same", 0)]);
    c.edit([note("same", 4)]);
    c.edit([note("same", 6)]);
    c.at(3);
    c.edit([]);
    c.at(4);
    c.edit([note("same", 12)]);
    c.at(6);
    expect(c.trigger).toHaveBeenCalledTimes(1);
    c.at(14);
    expect(c.trigger.mock.calls[1]).toEqual([note("same", 12), 14.18]);
  });

  it("only commits attacks inside the documented raw-clock horizon", () => {
    const c = clock([note("soon", 2), note("later", 3)]);
    c.at(0.97);
    expect(c.trigger).not.toHaveBeenCalled();
    c.at(1);
    const submittedAt = c.trigger.mock.calls[0][1] as number;
    expect(submittedAt - 1).toBeLessThanOrEqual(LIVE_SCHEDULE_HORIZON);
    c.edit([]);
    c.at(1.5);
    // Deleting a committed note cannot recall its attack/release; the later one is gone.
    expect(c.trigger.mock.calls).toEqual([[note("soon", 2), 1.18]]);
  });

  it("keeps stable boundaries and independent current/next-cycle identities", () => {
    const c = clock([note("n", 0)]);
    c.at(7.99);
    c.edit([note("n", 1)]);
    c.at(8.49);
    c.at(16.49);
    expect(c.trigger.mock.calls.map(([, at]) => at)).toEqual([0.18, 8.18, 16.68]);
  });

  it("retains only current/queued cycles across long playback and prunes after a stall", () => {
    const c = clock([note("n", 0)]);
    for (let cycle = 1; cycle <= 150; cycle++) {
      c.at(cycle * 8);
      expect(c.schedule.retainedOccurrenceCount).toBe(2);
      c.at(cycle * 8 + 0.3);
      expect(c.schedule.retainedOccurrenceCount).toBe(1);
    }
    c.at(2000);
    expect(c.schedule.retainedOccurrenceCount).toBe(1);
    expect(c.trigger.mock.calls.at(-1)?.[1]).toBe(2000.18);
    expect(c.trigger).toHaveBeenCalledTimes(152);
  });

  it("skips past edits and missed cycles rather than bursting stale notes", () => {
    const c = clock([note("start", 0)]);
    c.at(83);
    c.edit([note("past", 2), note("future", 6)]);
    c.at(83.05);
    expect(c.trigger.mock.calls).toEqual([
      [note("start", 0), 0.18],
      [note("future", 6), 83.18],
    ]);
  });

  it("keeps empty cycles alive and accepts notes in a later cycle", () => {
    const c = clock([note("delete", 4)]);
    c.edit([]);
    for (const time of [2, 8, 16, 24]) c.at(time);
    expect(c.finish).not.toHaveBeenCalled();
    expect(c.trigger).not.toHaveBeenCalled();
    c.edit([note("new", 4)]);
    c.at(26);
    expect(c.trigger.mock.calls).toEqual([[note("new", 4), 26.18]]);
  });

  it("finishes an admitted loop pass and holds its final position through release", () => {
    const c = clock([note("n", 0)]);
    c.at(8);
    c.schedule.setLoop(false);
    c.at(16.3);
    expect(c.schedule.position()).toBe(8);
    expect(c.finish).not.toHaveBeenCalled();
    c.at(16.6);
    expect(c.finish).toHaveBeenCalledOnce();
    expect(c.trigger).toHaveBeenCalledTimes(2);
    expect(c.schedule.retainedOccurrenceCount).toBe(0);
    c.at(24);
    expect(c.finish).toHaveBeenCalledOnce();
  });

  it("can enable looping during playback without restarting voices", () => {
    const c = clock([note("n", 0)], { repeat: false });
    c.at(3);
    c.schedule.setLoop(true);
    c.at(8);
    expect(c.trigger.mock.calls.map(([, at]) => at)).toEqual([0.18, 8.18]);
  });

  it("catches an overlapping note once on seek, retaining its remaining duration", () => {
    const c = clock([note("held", 2, { duration: 6 })], { initialPosition: 2 });
    expect(c.trigger.mock.calls[0][0]).toEqual(note("held", 2, { duration: expect.closeTo(4) }));
    expect(c.trigger.mock.calls[0][1]).toBeCloseTo(0.18);
    c.edit([note("held", 2, { duration: 10 }), note("behind", 1, { duration: 8 })]);
    c.at(0.1);
    expect(c.trigger).toHaveBeenCalledOnce();
  });

  it("deduplicates drum collisions across revisions and avoids backwards voice attacks", () => {
    const c = clock([note("a", 2, { pitch: 36 })], { drums: true });
    c.at(1);
    c.edit([
      note("b", 2, { pitch: 36 }),
      note("earlier", 1.9, { pitch: 36 }),
      note("hat", 2, { pitch: 42 }),
    ]);
    c.at(1.01);
    expect(c.trigger.mock.calls.map(([n]) => n.id)).toEqual(["a", "hat"]);
    c.at(8.95);
    c.at(9);
    expect(c.trigger.mock.calls.map(([n]) => n.id)).toEqual(["a", "hat", "earlier", "b", "hat"]);
  });

  it("does not catch up sustained drums on seek", () => {
    const c = clock([note("kick", 2, { pitch: 36, duration: 6 })], {
      drums: true,
      initialPosition: 2,
    });
    expect(c.trigger).not.toHaveBeenCalled();
  });

  it("cancels idempotently, clears records, and ignores stale ticks and loop changes", () => {
    const c = clock([note("n", 0)]);
    c.schedule.cancel();
    c.schedule.cancel();
    c.edit([note("new", 4)]);
    c.schedule.setLoop(true);
    c.at(100);
    expect(c.cancelTimer).toHaveBeenCalledOnce();
    expect(c.schedule.retainedOccurrenceCount).toBe(0);
    expect(c.trigger).toHaveBeenCalledOnce();
    expect(c.finish).not.toHaveBeenCalled();
  });
});

const audio = vi.hoisted(() => ({
  start: vi.fn<() => Promise<void>>(),
  trigger: vi.fn(),
  created: vi.fn(),
  disposed: vi.fn(),
}));
vi.mock("tone", () => {
  class Voice {
    volume = { value: 0 };
    constructor() {
      audio.created();
    }
    toDestination() {
      return this;
    }
    connect() {
      return this;
    }
    triggerAttackRelease(...args: unknown[]) {
      audio.trigger(...args);
    }
    dispose() {
      audio.disposed();
    }
  }
  return {
    start: audio.start,
    now: () => Date.now() / 1000 + 0.1,
    immediate: () => Date.now() / 1000,
    getContext: () => ({
      state: "running",
      setTimeout: (fn: () => void, seconds: number) => setTimeout(fn, seconds * 1000),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    }),
    Gain: Voice,
    PolySynth: Voice,
    Synth: Voice,
    MembraneSynth: Voice,
    NoiseSynth: Voice,
    MetalSynth: Voice,
    Frequency: (pitch: number) => ({ toFrequency: () => pitch }),
  };
});

describe("owner-scoped live playback snapshots", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    vi.clearAllMocks();
    audio.start.mockResolvedValue(undefined);
  });
  afterEach(() => {
    stopAudio();
    vi.useRealTimers();
  });

  it("publishes by reference, ignores stale/foreign revisions, and captures tempo/instrument", async () => {
    await playNotes([note("n", 8)], 120, "piano", "editor", true);
    const updated = [note("n", 4, { pitch: 65 })];
    updatePlaybackNotes("editor", updated, 5);
    updatePlaybackNotes("other", [], 100);
    updatePlaybackNotes("editor", [], 4);
    updatePlaybackNotes("editor", [], 5);
    expect(getPlaybackComposition()?.notes).toBe(updated);
    expect(getPlaybackComposition()).toMatchObject({ bpm: 120, instrument: "piano" });
    vi.advanceTimersByTime(2000);
    expect(audio.trigger.mock.calls).toEqual([[65, 0.25, 2.18, 100 / 127]]);
    expect(audio.created).toHaveBeenCalledTimes(2);
    expect(audio.disposed).not.toHaveBeenCalled();
    expect(getPlaybackElapsed()).toBeCloseTo(1.82);
  });

  it("uses edits arriving during asynchronous initialization", async () => {
    let ready!: () => void;
    audio.start.mockReturnValueOnce(new Promise<void>((resolve) => (ready = resolve)));
    const playing = playNotes([note("old", 0)], 120, "piano", "editor", true);
    await vi.waitFor(() => expect(audio.start).toHaveBeenCalledOnce());
    updatePlaybackNotes("editor", [note("new", 0, { pitch: 67 })], 1);
    ready();
    await playing;
    expect(audio.trigger.mock.calls[0][0]).toBe(67);
    expect(audio.trigger).toHaveBeenCalledOnce();
  });

  it("keeps an empty playing/paused/resumed transport and uses later additions", async () => {
    await playNotes([note("old", 8)], 120, "piano", "editor", true);
    updatePlaybackNotes("editor", [], 1);
    vi.advanceTimersByTime(1000);
    expect(getPlayback().status).toBe("playing");
    pauseAudio("editor");
    await resumeAudio("editor");
    expect(getPlayback().status).toBe("playing");
    updatePlaybackNotes("editor", [note("stale", 0)], 0);
    expect(getPlaybackComposition()?.notes).toEqual([]);
    updatePlaybackNotes("editor", [note("new", 4, { pitch: 69 })], 2);
    vi.advanceTimersByTime(1500);
    expect(audio.trigger).toHaveBeenCalledOnce();
    expect(audio.trigger.mock.calls[0][0]).toBe(69);
    expect(getPlayback().status).toBe("playing");
  });

  it("resumes the latest paused notes, not the initial playback snapshot", async () => {
    await playNotes([note("old", 8)], 120, "piano", "editor", true);
    pauseAudio("editor");
    await seekAudio("editor", 2);
    updatePlaybackNotes("editor", [note("held", 2, { duration: 6, pitch: 70 })], 3);
    await resumeAudio("editor");
    expect(audio.trigger.mock.calls).toEqual([
      [70, expect.closeTo(2), expect.closeTo(0.18), 100 / 127],
    ]);
    expect(getPlaybackElapsed()).toBe(2);
  });

  it("seeks an empty edited composition during loading without restoring stale notes", async () => {
    let ready!: () => void;
    audio.start.mockReturnValueOnce(new Promise<void>((resolve) => (ready = resolve)));
    const playing = playNotes([note("old", 0)], 120, "piano", "editor", true);
    await vi.waitFor(() => expect(audio.start).toHaveBeenCalledOnce());
    updatePlaybackNotes("editor", [], 4);
    await seekAudio("editor", 2);
    ready();
    await playing;
    expect(getPlayback().status).toBe("playing");
    expect(getPlaybackElapsed()).toBe(2);
    expect(audio.trigger).not.toHaveBeenCalled();
    expect(audio.created).toHaveBeenCalledTimes(2);
  });

  it("isolates owner replacement and starts a fresh occurrence/revision session", async () => {
    await playNotes([note("same", 0)], 120, "piano", "old", true);
    updatePlaybackNotes("old", [], 100);
    await playNotes([note("same", 0)], 120, "piano", "new", true);
    updatePlaybackNotes("old", [], 101);
    updatePlaybackNotes("new", [note("future", 4)], 1);
    vi.advanceTimersByTime(2000);
    expect(audio.trigger).toHaveBeenCalledTimes(3);
    expect(getPlayback().owner).toBe("new");
    stopAudio("new");
    updatePlaybackNotes("new", [note("late", 8)], 2);
    vi.advanceTimersByTime(10000);
    expect(audio.trigger).toHaveBeenCalledTimes(3);
    expect(getPlaybackComposition()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still disallows initial empty Play", async () => {
    await expect(playNotes([], 120, "piano", "editor")).rejects.toThrow("Add a note first");
    expect(audio.created).not.toHaveBeenCalled();
  });
});
