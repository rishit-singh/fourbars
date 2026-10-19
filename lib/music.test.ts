import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { floorSnap, normalizedNote, secondsForBeats, snap } from "./music";
import {
  createPlaybackSchedule,
  getPlayback,
  playNotes,
  setPlaybackLoop,
  stopAudio,
} from "./audio";
import type { Note, Quantization } from "./types";
const note: Note = { id: "n", pitch: 60, start: 0, duration: 1, velocity: 100 };
describe("musical beat transforms", () => {
  it.each([1, 0.5, 0.25] as Quantization[])(
    "quantizes to %s beats and clamps both ends",
    (step) => {
      for (const start of [-10, 0.1, 4.3, 15.9, 16, 40]) {
        const n = normalizedNote({ ...note, start, duration: 40 }, step);
        expect(n.start).toBeGreaterThanOrEqual(0);
        expect(n.start % step).toBe(0);
        expect(n.duration).toBeGreaterThan(0);
        expect(n.start + n.duration).toBeLessThanOrEqual(16);
      }
      expect(snap(1.4, step)).toBe(Math.round(1.4 / step) * step);
    },
  );
  it("clamps pitched notes and velocity", () => {
    expect(normalizedNote({ ...note, pitch: 120, velocity: 200 }).pitch).toBe(71);
    expect(normalizedNote({ ...note, pitch: -5, velocity: 0 })).toMatchObject({
      pitch: 48,
      velocity: 1,
    });
  });
  it("uses named drum MIDI pitches without piano clamping", () => {
    for (const pitch of [36, 38, 42])
      expect(normalizedNote({ ...note, pitch }, 0.5, true).pitch).toBe(pitch);
  });
  it("gives negative/zero resize a minimum duration", () => {
    expect(normalizedNote({ ...note, duration: -3 }, 0.25).duration).toBe(0.25);
  });
  it("converts beats to seconds across tempos", () => {
    expect(secondsForBeats(4, 120)).toBe(2);
    expect(secondsForBeats(16, 60)).toBe(16);
  });
  it.each([1, 0.5, 0.25] as Quantization[])(
    "places clicks in the containing %s-beat cell",
    (step) => {
      expect(floorSnap(step * 0.9, step)).toBe(0);
      expect(floorSnap(step * 1.1, step)).toBe(step);
      expect(floorSnap(15.99, step)).toBeLessThanOrEqual(16 - step);
    },
  );
});

describe("audio-clock loop scheduling", () => {
  it("keeps exact boundaries despite callback jitter and ignores callbacks after cancellation", () => {
    let time = 0;
    let tick = () => {};
    const cancel = vi.fn();
    const play = vi.fn();
    const finish = vi.fn();
    const schedule = createPlaybackSchedule({
      start: 0.18,
      duration: 8,
      repeat: true,
      now: () => time,
      playCycle: play,
      finish,
      every: (callback) => {
        tick = callback;
        return cancel;
      },
    });
    for (const at of [7.94, 15.98, 23.99]) {
      time = at;
      tick();
    }
    expect(play.mock.calls.map(([at]) => at)).toEqual([0.18, 8.18, 16.18, 24.18]);
    expect(finish).not.toHaveBeenCalled();
    schedule.cancel();
    time = 40;
    tick();
    expect(play).toHaveBeenCalledTimes(4);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("skips missed passes after a stalled clock instead of bursting stale starts", () => {
    let time = 0;
    let tick = () => {};
    const play = vi.fn();
    const schedule = createPlaybackSchedule({
      start: 0.18,
      duration: 8,
      repeat: true,
      now: () => time,
      playCycle: play,
      finish: vi.fn(),
      every: (callback) => {
        tick = callback;
        return () => {};
      },
    });
    time = 83;
    tick();
    expect(play.mock.calls).toEqual([
      [0.18, 0],
      [80.18, 83],
    ]);
    expect(schedule.position()).toBeCloseTo(2.82);
    schedule.cancel();
  });
});

// Mock only the external Web Audio boundary; exercise the real owner, clock and cancellation code.
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
      audio.created(this);
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
      audio.disposed(this);
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

describe("global playback lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    vi.clearAllMocks();
    audio.start.mockResolvedValue(undefined);
  });
  afterEach(() => {
    stopAudio();
    vi.useRealTimers();
  });

  it("loops beyond 100 passes with one pending scheduler and no voice restarts", async () => {
    await playNotes([note], 120, "piano", "editor", true);
    vi.advanceTimersByTime(8 * 105 * 1000);
    expect(audio.trigger).toHaveBeenCalledTimes(106);
    for (let i = 0; i < audio.trigger.mock.calls.length; i++)
      expect(audio.trigger.mock.calls[i][2]).toBeCloseTo(0.18 + i * 8);
    expect(audio.created).toHaveBeenCalledTimes(2);
    expect(audio.disposed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    stopAudio("editor");
    expect(vi.getTimerCount()).toBe(0);
    expect(audio.disposed).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60000);
    expect(audio.trigger).toHaveBeenCalledTimes(106);
    expect(getPlayback().status).toBe("idle");
  });

  it("plays once by default and cleans up from inside the clock callback", async () => {
    await playNotes([note], 120, "piano", "feed");
    vi.advanceTimersByTime(9000);
    expect(audio.trigger).toHaveBeenCalledOnce();
    expect(getPlayback().status).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
    expect(audio.disposed).toHaveBeenCalledTimes(2);
  });

  it("applies Loop changes live without disposing or starting new voices", async () => {
    await playNotes([note], 120, "piano", "editor");
    vi.advanceTimersByTime(3000);
    setPlaybackLoop("editor", true);
    vi.advanceTimersByTime(7000);
    expect(audio.trigger).toHaveBeenCalledTimes(2);
    expect(audio.created).toHaveBeenCalledTimes(2);
    expect(audio.disposed).not.toHaveBeenCalled();
    setPlaybackLoop("editor", false);
    vi.advanceTimersByTime(7000);
    expect(audio.trigger).toHaveBeenCalledTimes(2);
    expect(getPlayback().status).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("owner-scopes cleanup and cancels the old scheduler when another player starts", async () => {
    await playNotes([note], 120, "piano", "editor", true);
    stopAudio("inactive-card");
    setPlaybackLoop("inactive-card", false);
    expect(getPlayback()).toMatchObject({ owner: "editor", loop: true });
    await playNotes([note], 120, "piano", "feed");
    stopAudio("editor");
    expect(getPlayback().owner).toBe("feed");
    expect(audio.disposed).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30000);
    expect(audio.trigger).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Stop during asynchronous initialization prevents a stale start", async () => {
    let resume!: () => void;
    audio.start.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resume = resolve;
      }),
    );
    const pending = playNotes([note], 120, "piano", "editor", true);
    await vi.waitFor(() => expect(audio.start).toHaveBeenCalledOnce());
    stopAudio("editor");
    resume();
    await pending;
    expect(audio.created).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(getPlayback().status).toBe("idle");
  });

  it("a stale initialization cannot steal a newer player's ownership", async () => {
    let resume!: () => void;
    audio.start.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resume = resolve;
      }),
    );
    const pending = playNotes([note], 120, "piano", "old", true);
    await vi.waitFor(() => expect(audio.start).toHaveBeenCalledOnce());
    await playNotes([note], 120, "piano", "new");
    resume();
    await pending;
    expect(getPlayback().owner).toBe("new");
    expect(audio.created).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("cleans up a scheduling failure on initial Play", async () => {
    audio.trigger.mockImplementationOnce(() => {
      throw new Error("Audio scheduling failed");
    });
    await expect(playNotes([note], 120, "piano", "editor", true)).rejects.toThrow(
      "Audio scheduling failed",
    );
    expect(getPlayback().status).toBe("idle");
    expect(audio.disposed).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a later loop scheduling failure to its owner and cancels future callbacks", async () => {
    await playNotes([note], 120, "piano", "editor", true);
    audio.trigger.mockImplementationOnce(() => {
      throw new Error("Audio scheduling failed");
    });
    vi.advanceTimersByTime(8000);
    expect(getPlayback()).toMatchObject({
      status: "idle",
      error: { owner: "editor", message: "Audio scheduling failed" },
    });
    expect(audio.disposed).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
