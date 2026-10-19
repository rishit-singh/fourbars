"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getMyProfile, saveMyProfile } from "@/lib/projects";
import { errorMessage } from "@/lib/errors";

export function ProfileDialog() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<"username" | "name" | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy(true);
    setError("");
    setLoadFailed(false);
    setInvalidField(null);
    getMyProfile()
      .then((profile) => {
        if (active) {
          setUsername(profile?.username ?? "");
          setDisplayName(profile?.display_name ?? "");
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setLoadFailed(true);
          setError(errorMessage(e));
          toast.error("Could not load your profile. Close this dialog and try again.");
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loadFailed) return;
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
      setError("Username must be 3–24 characters: lowercase letters, numbers, or underscores.");
      setInvalidField("username");
      return;
    }
    if (!displayName.trim() || displayName.trim().length > 60) {
      setError("Display name must be between 1 and 60 characters.");
      setInvalidField("name");
      return;
    }
    setBusy(true);
    setError("");
    setInvalidField(null);
    try {
      await saveMyProfile(normalized, displayName.trim());
      window.dispatchEvent(new Event("fourbars:profile-updated"));
      toast.success("Profile saved");
      setOpen(false);
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      const text = code === "23505" ? "That username is taken. Choose another." : errorMessage(e);
      if (code === "23505") setInvalidField("username");
      setError(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="profile-dialog">
        <DialogHeader>
          <DialogTitle>Your profile</DialogTitle>
          <DialogDescription>
            Choose how people find and recognize you on Fourbars.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={submit}
          aria-busy={busy}
          aria-describedby={error ? "profile-error" : undefined}
        >
          <label className="flex flex-col gap-1" htmlFor="profile-username">
            Username{" "}
            <input
              id="profile-username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={24}
              pattern="[a-z0-9_]{3,24}"
              disabled={busy || loadFailed}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              aria-invalid={invalidField === "username"}
              aria-describedby="profile-username-help"
            />
          </label>
          <p id="profile-username-help">3–24 lowercase letters, numbers, or underscores.</p>
          <label className="flex flex-col gap-1" htmlFor="profile-display-name">
            Display name{" "}
            <input
              id="profile-display-name"
              autoComplete="nickname"
              required
              maxLength={60}
              disabled={busy || loadFailed}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-invalid={invalidField === "name"}
            />
          </label>
          {error && (
            <p id="profile-error" role="alert">
              {error}
              {loadFailed && " Close this dialog and try again."}
            </p>
          )}
          <Button type="submit" disabled={busy || loadFailed}>
            {busy ? "Please wait…" : "Save profile"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
