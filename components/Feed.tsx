"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Music2, Play, Plus } from "lucide-react";
import { listProjects, type Cursor } from "@/lib/projects";
import { getSupabase } from "@/lib/supabase";
import { stopAudio } from "@/lib/audio";
import { errorMessage } from "@/lib/errors";
import type { Project } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionError } from "./ActionError";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { LikeButton } from "./LikeButton";
import { MelodyPlayerDialog } from "./MelodyPlayerDialog";

type ProjectFilter = "all" | "drafts" | "published";
const filters = [
  ["all", "All"],
  ["drafts", "Drafts"],
  ["published", "Published"],
] as const;
const statusLabels = {
  draft: "Private draft",
  published: "Published",
  changed: "Unpublished changes",
};

export function Feed() {
  const [mine, setMine] = useState(false);
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [items, setItems] = useState<Project[]>([]);
  const [cursor, setCursor] = useState<Cursor>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [userId, setUserId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const request = useRef(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "mine") setMine(true);
    const refresh = () => setRetry((value) => value + 1);
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
      /* The data request below displays missing configuration. */
    }
  }, []);

  useEffect(() => {
    const token = ++request.current;
    setLoading(true);
    setError("");
    setItems([]);
    setCursor(undefined);
    setSelected(null);
    stopAudio();
    listProjects(mine, undefined, mine ? filter : "all")
      .then((result) => {
        if (token === request.current) {
          setItems(result.items);
          setCursor(result.next);
        }
      })
      .catch((error) => {
        if (token === request.current) setError(errorMessage(error));
      })
      .finally(() => {
        if (token === request.current) setLoading(false);
      });
    return () => {
      request.current = token + 1;
    };
  }, [mine, filter, retry, userId]);

  async function loadMore() {
    if (!cursor || loading) return;
    const token = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await listProjects(mine, cursor, mine ? filter : "all");
      if (token === request.current) {
        setItems((old) => [
          ...old,
          ...result.items.filter((project) => !old.some((existing) => existing.id === project.id)),
        ]);
        setCursor(result.next);
      }
    } catch (error) {
      if (token === request.current) setError(errorMessage(error));
    } finally {
      if (token === request.current) setLoading(false);
    }
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <span className="eyebrow">MAKE FOUR BARS. SHARE AN IDEA.</span>
          <h1>Melodies</h1>
          <p>Little ideas, worth sharing.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          Create
        </Button>
      </div>
      <div className="tabs" role="tablist" aria-label="Melody feed">
        <button
          role="tab"
          aria-selected={!mine}
          className={!mine ? "active" : ""}
          onClick={() => setMine(false)}
        >
          Community
        </button>
        <button
          role="tab"
          aria-selected={mine}
          className={mine ? "active" : ""}
          onClick={() => setMine(true)}
        >
          My Projects
        </button>
      </div>
      {mine && (
        <div className="project-filters" role="group" aria-label="Filter your projects">
          {filters.map(([value, label]) => (
            <Button
              key={value}
              variant={filter === value ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <ActionError
          title="Could not load melodies"
          message={error}
          onRetry={
            mine && !userId
              ? undefined
              : () => (cursor ? void loadMore() : setRetry((value) => value + 1))
          }
        >
          {mine && !userId && (
            <Button asChild>
              <Link href="/login?next=%2F%3Fview%3Dmine">Sign in</Link>
            </Button>
          )}
        </ActionError>
      )}
      {loading && !items.length && (
        <div className="cards" aria-label="Loading melodies" role="status">
          {[1, 2, 3].map((item) => (
            <div className="card" key={item}>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-4 h-3 w-1/2" />
              <Skeleton className="mt-6 h-20 w-full" />
            </div>
          ))}
        </div>
      )}
      {!loading && !error && !items.length && (
        <div className="empty">
          <Music2 size={30} />
          <h2>
            {mine
              ? filter === "drafts"
                ? "No private drafts"
                : filter === "published"
                  ? "No published melodies"
                  : "No projects yet"
              : "No melodies yet"}
          </h2>
          <p>
            {mine
              ? "Create a sketch and publish it when you’re ready."
              : "Share the first four bars."}
          </p>
          <Button onClick={() => setCreateOpen(true)}>Create a melody</Button>
        </div>
      )}
      <div className="cards">
        {items.map((project) => {
          const status = project.publication_status ?? (project.published ? "published" : "draft");
          const date = mine ? project.updated_at : project.published_at!;
          const canEdit = mine || project.user_id === userId;
          return (
            <article key={project.id} className="card">
              <div className="card-main">
                <button
                  className="player"
                  disabled={!project.notes.length}
                  aria-label={`Play ${project.title}`}
                  onClick={() => {
                    stopAudio();
                    setSelected(project);
                  }}
                >
                  <Play size={17} />
                </button>
                <div className="card-info">
                  <Link href={mine ? `/editor/${project.id}` : `/m/${project.id}`}>
                    <strong>{project.title}</strong>
                  </Link>
                  <small>
                    {project.instrument} · {project.key} · {project.bpm} BPM
                  </small>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={canEdit ? `/editor/${project.id}` : `/m/${project.id}`}>
                    {canEdit ? "Edit" : "Open"}
                  </Link>
                </Button>
              </div>
              <div className="mini-roll" aria-hidden="true">
                {project.notes.slice(0, 100).map((note) => (
                  <i
                    key={note.id}
                    style={{
                      left: `${(note.start / 16) * 100}%`,
                      width: `${(note.duration / 16) * 100}%`,
                      top: `${Math.min(95, Math.max(0, ((71 - note.pitch) / 36) * 100))}%`,
                    }}
                  />
                ))}
              </div>
              <div className="card-meta">
                <span>{project.creator_name || "Anonymous musician"}</span>
                <time dateTime={date}>{new Date(date).toLocaleDateString()}</time>
              </div>
              <div className="card-actions">
                {mine ? (
                  <Badge variant={status === "published" ? "secondary" : "outline"}>
                    {statusLabels[status]}
                  </Badge>
                ) : (
                  <LikeButton
                    key={`${project.id}:${userId ?? "anon"}`}
                    project={project}
                    signedIn={!!userId}
                    returnTo="/"
                    onChange={(value) =>
                      setItems((old) =>
                        old.map((item) => (item.id === project.id ? { ...item, ...value } : item)),
                      )
                    }
                  />
                )}
                {mine && status !== "draft" && (
                  <Link className="text-link" href={`/m/${project.id}`}>
                    View published version
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {cursor && (
        <div className="pager">
          <Button variant="outline" disabled={loading} onClick={loadMore}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} signedIn={!!userId} />
      <MelodyPlayerDialog
        melody={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </section>
  );
}
