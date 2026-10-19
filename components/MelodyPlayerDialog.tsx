"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
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
  destination = "public",
}: {
  melody: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destination?: "editor" | "public";
}) {
  const pageLabel = destination === "editor" ? "Open in editor" : "Open full page";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col justify-center overflow-y-auto rounded-none p-6 sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-lg">
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
            <Button asChild variant="ghost" size="icon-sm" className="self-end">
              <Link
                href={`/${destination === "editor" ? "editor" : "m"}/${melody.id}`}
                aria-label={pageLabel}
                title={pageLabel}
              >
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
