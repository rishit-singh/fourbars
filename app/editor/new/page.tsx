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
        if (!active) return;
        const message = errorMessage(error);
        if (/sign in/i.test(message)) {
          router.replace("/login?next=%2Feditor%2Fnew");
        } else {
          setError(message);
        }
      });
    return () => {
      active = false;
    };
  }, [router, attempt]);
  if (!error) return <p role="status">Opening editor…</p>;
  return (
    <ActionError
      title="Could not create a melody"
      message={error}
      onRetry={() => {
        creation.current = null;
        setError("");
        setAttempt((value) => value + 1);
      }}
    >
      <Button variant="outline" asChild>
        <Link href="/">Back to melodies</Link>
      </Button>
    </ActionError>
  );
}
