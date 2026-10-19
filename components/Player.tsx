"use client";
import "@/app/player.css";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Play, Pause, Square, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  playNotes,
  stopAudio,
  subscribePlayback,
  getPlayback,
  getServerPlayback,
  getPlaybackElapsed,
  setPlaybackLoop,
  pauseAudio,
  resumeAudio,
  seekAudio,
} from "@/lib/audio";
import type { Instrument, Note } from "@/lib/types";
export function Player({
  notes,
  bpm,
  instrument,
  loop = false,
  owner,
}: {
  notes: Note[];
  bpm: number;
  instrument: Instrument;
  loop?: boolean;
  owner?: string;
}) {
  const generatedId = useId();
  const id = owner ?? generatedId;
  const playback = useSyncExternalStore(subscribePlayback, getPlayback, getServerPlayback);
  const active = playback.owner === id;
  const [elapsed, setElapsed] = useState(0);
  const [cue, setCue] = useState({ position: 0, bpm, instrument });
  const available = notes.length > 0 && Number.isFinite(bpm) && bpm >= 40 && bpm <= 240;
  const duration = active ? playback.duration : available ? (16 * 60) / bpm : 0;
  const cuePosition = cue.bpm === bpm && cue.instrument === instrument ? cue.position : 0;
  const position = Math.min(
    duration,
    !active ? cuePosition : playback.status === "playing" ? elapsed : (playback.position ?? 0),
  );
  const label = !active
    ? "Play melody"
    : playback.status === "loading"
      ? "Cancel playback"
      : playback.status === "paused"
        ? "Resume playback"
        : "Pause playback";
  // A paused or scheduled performance owns its original voice and tempo.
  // Discard it when either changes so Play uses the current editor settings.
  useEffect(() => () => stopAudio(id), [id, instrument, bpm]);
  useEffect(() => setPlaybackLoop(id, loop), [id, loop]);
  useEffect(() => {
    if (playback.error?.owner === id) toast.error(playback.error.message);
  }, [id, playback.error]);
  useEffect(() => {
    if (!active || playback.status !== "playing") return;
    const timer = setInterval(() => setElapsed(getPlaybackElapsed()), 100);
    return () => clearInterval(timer);
  }, [active, playback]);
  return (
    <div className="player-controls">
      <button
        className="player"
        type="button"
        disabled={!active && !available}
        aria-label={label}
        title={label}
        onClick={async () => {
          try {
            if (active && playback.status === "loading") stopAudio(id);
            else if (active && playback.status === "playing") {
              pauseAudio(id);
              setElapsed(getPlaybackElapsed());
            } else if (active && playback.status === "paused") {
              setElapsed(playback.position ?? 0);
              await resumeAudio(id);
            } else {
              const offset = position >= duration ? 0 : position;
              setCue({ position: 0, bpm, instrument });
              setElapsed(offset);
              await playNotes(notes, bpm, instrument, id, loop, offset);
            }
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Audio unavailable. Try Play again.");
          }
        }}
      >
        {active ? (
          playback.status === "loading" ? (
            <LoaderCircle size={17} />
          ) : playback.status === "playing" ? (
            <Pause size={17} />
          ) : (
            <Play size={17} />
          )
        ) : (
          <Play size={17} />
        )}
      </button>
      <button
        type="button"
        className="player"
        aria-label="Stop playback"
        title="Stop playback"
        disabled={!active && position === 0}
        onClick={() => {
          stopAudio(id);
          setCue({ position: 0, bpm, instrument });
          setElapsed(0);
        }}
      >
        <Square size={17} />
      </button>
      <div className="player-timeline">
        <input
          type="range"
          aria-label="Playback position"
          aria-valuetext={`${position.toFixed(1)} of ${duration.toFixed(1)} seconds`}
          disabled={!active && !available}
          min={0}
          max={duration}
          step={0.01}
          value={position}
          onChange={async (event) => {
            const value = Number(event.target.value);
            if (!active) {
              setCue({ position: value, bpm, instrument });
              return;
            }
            setElapsed(value);
            try {
              await seekAudio(id, value);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Audio unavailable. Try Play again.");
            }
          }}
        />
        <small>
          {position.toFixed(1)} / {duration.toFixed(1)}s
        </small>
      </div>
    </div>
  );
}
