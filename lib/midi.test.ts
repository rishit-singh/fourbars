import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { buildMidi } from "./midi";
describe("MIDI round trip", () => {
  it.each(["piano", "bass"] as const)("exports the %s General MIDI program", (instrument) => {
    const midi = new Midi(
      buildMidi(
        {
          bpm: 120,
          key: "C",
          instrument,
          notes: [{ id: "n", pitch: 60, start: 0, duration: 1, velocity: 100 }],
        },
        "Instrument",
      ),
    );
    expect(midi.tracks[0].channel).toBe(0);
    expect(midi.tracks[0].instrument.number).toBe(instrument === "bass" ? 33 : 0);
    expect(midi.tracks[0].instrument.name).toBe(
      instrument === "bass" ? "electric bass (finger)" : "acoustic grand piano",
    );
  });
  it.each([60, 120, 240])("preserves timing at %s BPM", (bpm) => {
    const midi = new Midi(
      buildMidi(
        {
          bpm,
          key: "C",
          instrument: "piano",
          notes: [{ id: "n", pitch: 64, start: 4, duration: 2, velocity: 90 }],
        },
        "Idea",
      ),
    );
    expect(midi.tracks[0].notes).toHaveLength(1);
    expect(midi.tracks[0].notes[0].time).toBeCloseTo((4 * 60) / bpm);
    expect(midi.tracks[0].notes[0].duration).toBeCloseTo((2 * 60) / bpm);
    expect(midi.tracks[0].notes[0].midi).toBe(64);
    expect(midi.tracks[0].notes[0].velocity).toBeCloseTo(90 / 127);
  });
  it("exports drum notes on percussion channel 10", () => {
    const midi = new Midi(
      buildMidi(
        {
          bpm: 120,
          key: "C",
          instrument: "drums",
          notes: [{ id: "k", pitch: 36, start: 0, duration: 0.5, velocity: 100 }],
        },
        "Beat",
      ),
    );
    expect(midi.tracks[0].channel).toBe(9);
    expect(midi.tracks[0].notes[0].midi).toBe(36);
  });
});
