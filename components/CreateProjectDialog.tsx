"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProject } from "@/lib/projects";
import { errorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionError } from "./ActionError";

export function CreateProjectDialog({
  open,
  onOpenChange,
  signedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedIn: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const starting = useRef(false);
  const router = useRouter();
  async function create() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setError("");
    try {
      const id = await createProject();
      onOpenChange(false);
      router.push(`/editor/${id}`);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      starting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setError("");
          onOpenChange(value);
        }
      }}
    >
      <DialogContent showCloseButton={!busy} aria-busy={busy}>
        <DialogHeader>
          <DialogTitle>New melody</DialogTitle>
          <DialogDescription>
            {signedIn
              ? "Start with an empty four-bar piano roll. Your project stays private until you publish it."
              : "Sign in to create a melody and save your notes."}
          </DialogDescription>
        </DialogHeader>
        {error && <ActionError title="Could not create a project" message={error} />}
        {signedIn ? (
          <Button disabled={busy} onClick={create}>
            {busy ? "Creating…" : "Create melody"}
          </Button>
        ) : (
          <Button asChild>
            <Link href="/login?next=%2Feditor%2Fnew">Sign in to create</Link>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
