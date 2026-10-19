"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserRound } from "lucide-react";
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
  const [savedUsername, setSavedUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<"username" | "name" | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getMyProfile()
      .then((profile) => {
        if (active) setSavedUsername(profile?.username ?? "");
      })
      .catch(() => {
        // The dialog provides actionable errors when opened.
      });
    return () => {
      active = false;
    };
  }, []);

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
          setSavedUsername(profile?.username ?? "");
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
      setSavedUsername(normalized);
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
        <Button
          variant="ghost"
          size="sm"
          className="profile-trigger"
          aria-label={savedUsername ? `Profile: @${savedUsername}` : "Profile"}
        >
          <UserRound data-icon="inline-start" aria-hidden="true" />
          <span className="truncate">{savedUsername ? `@${savedUsername}` : "Profile"}</span>
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
          className="profile-form"
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
          <p id="profile-username-help">
            Your unique @handle and profile link. Use 3–24 lowercase letters, numbers, or
            underscores.
          </p>
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
              aria-describedby="profile-display-name-help"
            />
          </label>
          <p id="profile-display-name-help">
            The name shown alongside your music. It can include spaces and doesn’t need to be
            unique.
          </p>
          {error && (
            <p id="profile-error" role="alert">
              {error}
              {loadFailed && " Close this dialog and try again."}
            </p>
          )}
          <div className="profile-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || loadFailed}>
              {busy ? "Please wait…" : "Save profile"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
