import { Midi } from "@tonejs/midi";
import { compositionSchema } from "./validation";
import { secondsForBeats } from "./music";
import type { Composition } from "./types";

/** MIDI stores timing in ticks; the library converts our seconds using header tempo. */
export function buildMidi(composition: Composition, title: string) {
  const { notes, bpm, instrument } = compositionSchema.parse(composition);
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const track = midi.addTrack();
  track.name = title;
  track.channel = instrument === "drums" ? 9 : 0;
  track.instrument.number = instrument === "bass" ? 33 : 0;
  for (const note of notes)
    track.addNote({
      midi: note.pitch,
      time: secondsForBeats(note.start, bpm),
      duration: secondsForBeats(note.duration, bpm),
      velocity: note.velocity / 127,
    });
  return midi.toArray();
}
