"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/projects";
import { errorMessage } from "@/lib/errors";
import { ActionError } from "@/components/ActionError";
import { Button } from "@/components/ui/button";

export default function NewProject() {
  const router = useRouter();
  const creation = useRef<Promise<string> | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    // StrictMode replays effects: reuse the request, but attach a fresh live listener.
    creation.current ??= createProject();
    creation.current
      .then((id) => {
        if (active) router.replace(`/editor/${id}`);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [router, attempt]);
  if (!error) return <p role="status">Creating your private draft…</p>;
  return (
    <ActionError
      title="Could not create a melody"
      message={error}
      onRetry={
        /sign in/i.test(error)
          ? undefined
          : () => {
              creation.current = null;
              setError("");
              setAttempt((value) => value + 1);
            }
      }
    >
      {/sign in/i.test(error) && (
        <Button asChild>
          <Link href="/login?next=%2Feditor%2Fnew">Sign in to create</Link>
        </Button>
      )}
      <Button variant="outline" asChild>
        <Link href="/">Back to melodies</Link>
      </Button>
    </ActionError>
  );
}
