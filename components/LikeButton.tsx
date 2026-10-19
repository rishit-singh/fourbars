"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { setProjectLike } from "@/lib/projects";
import { errorMessage } from "@/lib/errors";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui/button";

type LikeState = Pick<Project, "liked_by_me" | "like_count">;
export function LikeButton({
  project,
  signedIn,
  returnTo,
  onChange,
}: {
  project: Project;
  signedIn: boolean;
  returnTo: string;
  onChange: (value: LikeState) => void;
}) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const count = project.like_count ?? 0;
  if (!signedIn)
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link
          href={`/login?next=${encodeURIComponent(returnTo)}`}
          aria-label={`Sign in to like ${project.title}; ${count} likes`}
        >
          <Heart data-icon="inline-start" /> <span>{count}</span>
          <span>Sign in to like</span>
        </Link>
      </Button>
    );

  async function toggle() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    const previous = { liked_by_me: project.liked_by_me, like_count: count };
    const liked = !project.liked_by_me;
    onChange({ liked_by_me: liked, like_count: Math.max(0, count + (liked ? 1 : -1)) });
    try {
      await setProjectLike(project.id, liked);
    } catch (error) {
      if (alive.current) {
        onChange(previous);
        toast.error(errorMessage(error));
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setPending(false);
    }
  }
  return (
    <Button
      variant={project.liked_by_me ? "secondary" : "ghost"}
      size="sm"
      disabled={pending}
      aria-pressed={!!project.liked_by_me}
      aria-label={`${project.liked_by_me ? "Unlike" : "Like"} ${project.title}; ${count} likes`}
      onClick={toggle}
    >
      <Heart data-icon="inline-start" fill={project.liked_by_me ? "currentColor" : "none"} />
      <span>{count}</span>
      <span>{project.liked_by_me ? "Liked" : "Like"}</span>
    </Button>
  );
}
