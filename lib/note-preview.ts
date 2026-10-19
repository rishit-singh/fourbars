/** A small, gesture-started audition voice, independent of transport playback. */
export function createNotePreview() {
  let context: AudioContext | undefined;
  let voice: OscillatorNode | undefined;
  let generation = 0;
  function stop() {
    generation++;
    if (voice) {
      voice.stop();
      voice.disconnect();
      voice = undefined;
    }
  }
  return {
    stop,
    async play(pitch: number) {
      stop();
      const token = generation;
      try {
        context ??= new AudioContext();
        await context.resume();
        if (token !== generation) return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        oscillator.type = "triangle";
        oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        oscillator.connect(gain).connect(context.destination);
        voice = oscillator;
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          if (voice === oscillator) voice = undefined;
        };
        oscillator.start();
        oscillator.stop(now + 0.25);
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
