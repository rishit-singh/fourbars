"use client";
import type { Project } from "@/lib/types";
import { Player } from "./Player";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function MelodyPlayerDialog({
  melody,
  open,
  onOpenChange,
}: {
  melody: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{melody?.title ?? "Melody"}</DialogTitle>
          <DialogDescription>
            {melody
              ? `${melody.creator_name || "Anonymous musician"} · ${melody.instrument} · ${melody.key} · ${melody.bpm} BPM`
              : "Listen to four bars."}
          </DialogDescription>
        </DialogHeader>
        {melody && (
          <>
            <div
              className="mini-roll large"
              aria-label={`${melody.notes.length} notes in this melody`}
            >
              {melody.notes.map((note) => (
                <i
                  key={note.id}
                  aria-hidden="true"
                  style={{
                    left: `${(note.start / 16) * 100}%`,
                    width: `${(note.duration / 16) * 100}%`,
                    top: `${Math.min(95, Math.max(0, ((71 - note.pitch) / 36) * 100))}%`,
                  }}
                />
              ))}
            </div>
            <Player
              key={melody.id}
              notes={melody.notes}
              bpm={melody.bpm}
              instrument={melody.instrument}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
