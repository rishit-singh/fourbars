import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotePreview } from "./note-preview";

function audioMock(resume = () => Promise.resolve()) {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => ({
    connect: vi.fn(function (this: unknown) {
      return this;
    }),
    disconnect: vi.fn(),
  });
  const source = () => ({ ...node(), start: vi.fn(), stop: vi.fn(), onended: null });
  const oscillators: (ReturnType<typeof source> & {
    type: string;
    frequency: ReturnType<typeof param>;
  })[] = [];
  const buffers: (ReturnType<typeof source> & { buffer: object })[] = [];
  const filters: (ReturnType<typeof node> & {
    type: string;
    frequency: ReturnType<typeof param>;
  })[] = [];
  const context = {
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    resume,
    close: vi.fn(async () => {}),
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => {
      const value = { ...source(), type: "", frequency: param() };
      oscillators.push(value);
      return value;
    },
    createBufferSource: () => {
      const value = { ...source(), buffer: {} };
      buffers.push(value);
      return value;
    },
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBiquadFilter: () => {
      const value = { ...node(), type: "", frequency: param() };
      filters.push(value);
      return value;
    },
  };
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
  return { oscillators, buffers, filters };
}

afterEach(() => vi.unstubAllGlobals());

describe("instrument audition", () => {
  it("switches pitched timbre and stops the previous voice", async () => {
    const { oscillators } = audioMock();
    const preview = createNotePreview();
    await preview.play(60, "piano");
    await preview.play(60, "bass");
    expect(oscillators.map((voice) => voice.type)).toEqual(["triangle", "sine"]);
    expect(oscillators[0].disconnect).toHaveBeenCalled();
    expect(oscillators[1].frequency.value).toBeCloseTo(261.63, 1);
    preview.dispose();
    expect(oscillators[1].disconnect).toHaveBeenCalled();
  });

  it("auditions a pitch-swept kick and separately filtered snare and hat noise", async () => {
    const { oscillators, buffers, filters } = audioMock();
    const preview = createNotePreview();
    await preview.play(36, "drums");
    await preview.play(38, "drums");
    await preview.play(42, "drums");
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(45, 0.12);
    expect(buffers).toHaveLength(2);
    expect(filters.map((filter) => filter.frequency.value)).toEqual([1000, 7000]);
    expect(buffers[0].stop).toHaveBeenCalledWith(0.15);
    expect(buffers[1].stop).toHaveBeenCalledWith(0.06);
    preview.dispose();
  });

  it("does not start a stale voice after stop during audio initialization", async () => {
    let resolve!: () => void;
    const { oscillators } = audioMock(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const preview = createNotePreview();
    const playing = preview.play(60, "bass");
    preview.stop();
    resolve();
    await playing;
    expect(oscillators).toHaveLength(0);
    preview.dispose();
  });
});
