"use client";
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
}: {
  notes: Note[];
  bpm: number;
  instrument: Instrument;
  loop?: boolean;
}) {
  const id = useId();
  const playback = useSyncExternalStore(subscribePlayback, getPlayback, getServerPlayback);
  const active = playback.owner === id;
  const [elapsed, setElapsed] = useState(0);
  const position = !active ? 0 : playback.status === "playing" ? elapsed : (playback.position ?? 0);
  const label = !active
    ? "Play melody"
    : playback.status === "loading"
      ? "Cancel playback"
      : playback.status === "paused"
        ? "Resume playback"
        : "Pause playback";
  useEffect(() => () => stopAudio(id), [id]);
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
    <div className="player-wrap">
      <button
        className="player"
        disabled={!active && !notes.length}
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
              setElapsed(0);
              await playNotes(notes, bpm, instrument, id, loop);
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
      {active && (
        <button
          className="player"
          aria-label="Stop playback"
          title="Stop playback"
          onClick={() => stopAudio(id)}
        >
          <Square size={17} />
        </button>
      )}
      {active && (
        <div className="playback-progress">
          <input
            type="range"
            aria-label="Playback position"
            aria-valuetext={`${position.toFixed(1)} of ${playback.duration.toFixed(1)} seconds`}
            min={0}
            max={playback.duration}
            step={0.01}
            value={position}
            onChange={async (event) => {
              const value = Number(event.target.value);
              setElapsed(value);
              try {
                await seekAudio(id, value);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Audio unavailable. Try Play again.");
              }
            }}
          />
          <small>
            {position.toFixed(1)} / {playback.duration.toFixed(1)}s
          </small>
        </div>
      )}
    </div>
  );
}
