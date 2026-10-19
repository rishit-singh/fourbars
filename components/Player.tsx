"use client";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Play, Square, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  playNotes,
  stopAudio,
  subscribePlayback,
  getPlayback,
  getServerPlayback,
  getPlaybackElapsed,
  setPlaybackLoop,
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
        aria-label={active ? "Stop playback" : "Play melody"}
        title={active ? "Stop playback" : "Play melody"}
        onClick={async () => {
          if (active) stopAudio(id);
          else {
            setElapsed(0);
            try {
              await playNotes(notes, bpm, instrument, id, loop);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Audio unavailable. Try Play again.");
            }
          }
        }}
      >
        {active ? (
          playback.status === "loading" ? (
            <LoaderCircle size={17} />
          ) : (
            <Square size={17} />
          )
        ) : (
          <Play size={17} />
        )}
      </button>
      {active && playback.status === "playing" && (
        <div className="playback-progress">
          <progress aria-label="Playback progress" max={playback.duration} value={elapsed} />
          <small>
            {elapsed.toFixed(1)} / {playback.duration.toFixed(1)}s
          </small>
        </div>
      )}
    </div>
  );
}
