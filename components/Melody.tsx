"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getPublished, unpublishProject } from "@/lib/projects";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import type { Project } from "@/lib/types";
import { Player } from "./Player";
import { exportMidi } from "@/lib/audio";
import { LikeButton } from "./LikeButton";
import { ConfirmDialog } from "./ConfirmDialog";
import { ActionError } from "./ActionError";
export function Melody({ id }: { id: string }) {
  const [p, setP] = useState<Project | null>(null),
    [userId, setUserId] = useState<string>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const router = useRouter();
  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener("fourbars:profile-updated", refresh);
    return () => window.removeEventListener("fourbars:profile-updated", refresh);
  }, []);
  useEffect(() => {
    try {
      const {
        data: { subscription },
      } = getSupabase().auth.onAuthStateChange((_, session) => setUserId(session?.user.id));
      return () => subscription.unsubscribe();
    } catch {
      /* The publication request renders the configuration error. */
    }
  }, []);
  useEffect(() => {
    let alive = true;
    setP(null);
    setError("");
    getPublished(id)
      .then((p) => {
        if (!alive) return;
        setP(p);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [id, userId, attempt]);
  if (error)
    return (
      <ActionError
        title="Melody unavailable"
        message={
          error === "Melody not found"
            ? "This melody is unavailable or hasn’t been published."
            : error
        }
        onRetry={() => setAttempt((value) => value + 1)}
      >
        <Link href="/">Back to melodies</Link>
      </ActionError>
    );
  if (!p) return <p role="status">Loading melody…</p>;
  return (
    <section className="detail">
      <Link href="/" className="back-link">
        ← Melodies
      </Link>
      <span className="eyebrow">FOUR BARS, ONE IDEA</span>
      <h1>{p.title}</h1>
      <p>
        {p.creator_name || "Anonymous musician"} · {p.instrument} · {p.key} · {p.bpm} BPM
      </p>
      <div className="detail-player">
        <div className="mini-roll large" aria-hidden="true">
          {p.notes.map((n) => (
            <i
              key={n.id}
              style={{
                left: `${(n.start / 16) * 100}%`,
                width: `${(n.duration / 16) * 100}%`,
                top: `${Math.min(95, Math.max(0, ((71 - n.pitch) / 36) * 100))}%`,
              }}
            />
          ))}
        </div>
        <Player notes={p.notes} bpm={p.bpm} instrument={p.instrument} />
      </div>
      <div className="actions">
        <LikeButton
          key={`${p.id}:${userId ?? "anon"}`}
          project={p}
          signedIn={!!userId}
          returnTo={`/m/${id}`}
          onChange={(value) => setP((current) => (current ? { ...current, ...value } : current))}
        />
        {userId === p.user_id && (
          <>
            <Link href={`/editor/${p.id}`} className="primary">
              Edit draft
            </Link>
            <button
              className="outline"
              onClick={() =>
                exportMidi(p.notes, p.bpm, p.title, p.instrument).catch((e) =>
                  toast.error(String(e)),
                )
              }
            >
              Export MIDI
            </button>
            <button
              className="outline"
              disabled={busy}
              onClick={async () => {
                setConfirmUnpublish(true);
              }}
            >
              Unpublish
            </button>
          </>
        )}
        <button
          className="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              toast.success("Link copied");
            } catch {
              toast.error("Could not copy. Copy the address from your browser.");
            }
          }}
        >
          Copy link
        </button>
      </div>
      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title="Unpublish this melody?"
        description="It will leave the community feed. Your private project and notes will stay saved. Likes on this publication will be removed."
        confirmLabel="Unpublish"
        pending={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await unpublishProject(id);
            toast.success("Melody unpublished");
            router.push(`/editor/${id}`);
          } catch (error) {
            toast.error(errorMessage(error));
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
