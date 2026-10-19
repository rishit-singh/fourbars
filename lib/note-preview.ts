import type { Instrument } from "./types";

/** A small, gesture-started audition voice, independent of transport playback. */
export function createNotePreview() {
  let context: AudioContext | undefined;
  let voice: (() => void) | undefined;
  let generation = 0;
  function stop() {
    generation++;
    if (voice) {
      voice();
      voice = undefined;
    }
  }
  return {
    stop,
    async play(pitch: number, instrument: Instrument = "piano") {
      stop();
      const token = generation;
      try {
        context ??= new AudioContext();
        await context.resume();
        if (token !== generation) return;
        const gain = context.createGain();
        const now = context.currentTime;
        let source: OscillatorNode | AudioBufferSourceNode;
        let filter: BiquadFilterNode | undefined;
        let duration = instrument === "bass" ? 0.35 : 0.25;
        if (instrument === "drums" && (pitch === 38 || pitch === 42)) {
          duration = pitch === 42 ? 0.06 : 0.15;
          const noise = context.createBuffer(
            1,
            Math.ceil(context.sampleRate * duration),
            context.sampleRate,
          );
          const samples = noise.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
          const bufferSource = context.createBufferSource();
          bufferSource.buffer = noise;
          source = bufferSource;
          filter = context.createBiquadFilter();
          filter.type = "highpass";
          filter.frequency.value = pitch === 42 ? 7000 : 1000;
          source.connect(filter).connect(gain);
        } else {
          if (instrument === "drums" && pitch !== 36) {
            gain.disconnect();
            return;
          }
          const oscillator = context.createOscillator();
          oscillator.type = instrument === "piano" ? "triangle" : "sine";
          if (instrument === "drums") {
            duration = 0.3;
            oscillator.frequency.setValueAtTime(150, now);
            oscillator.frequency.exponentialRampToValueAtTime(45, now + 0.12);
          } else oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
          source = oscillator;
          source.connect(gain);
        }
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(
          instrument === "drums" && pitch === 42 ? 0.06 : 0.12,
          now + (instrument === "drums" ? 0.001 : 0.008),
        );
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration - 0.01);
        gain.connect(context.destination);
        const disconnect = () => {
          source.disconnect();
          filter?.disconnect();
          gain.disconnect();
        };
        const cleanup = () => {
          source.stop();
          disconnect();
        };
        voice = cleanup;
        source.onended = () => {
          disconnect();
          if (voice === cleanup) voice = undefined;
        };
        source.start();
        source.stop(now + duration);
      } catch {
        // Audio availability must never block editing.
      }
    },
    dispose() {
      stop();
      void context?.close().catch(() => {});
      context = undefined;
    },
  };
}
