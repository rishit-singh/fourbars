"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getProject, updateProject, deleteProject, publishProject } from "@/lib/projects";
import { publicationSchema, projectInputSchema } from "@/lib/validation";
import { errorMessage } from "@/lib/errors";
import { useEditor } from "@/store/editor";
import type { Quantization } from "@/lib/types";
import { PianoRoll } from "./PianoRoll";
import { Player } from "./Player";
import { exportMidi } from "@/lib/audio";
import { Download, Save, Upload, Trash2, ArrowLeft, Repeat, Eraser, Pencil } from "lucide-react";
import { EditorHelp } from "./editor/EditorHelp";
import "@/app/toolbar.css";

export function Editor({ id }: { id: string }) {
  const router = useRouter();
  const state = useEditor();
  const lifecycle = useRef(0);
  const inFlight = useRef(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const [action, setAction] = useState<"save" | "publish" | "delete">("save");
  const [loop, setLoop] = useState(false);
  const [mode, setMode] = useState<"draw" | "select">("draw");
  const titleInput = useRef<HTMLInputElement>(null);
  const published = state.publicationStatus !== "draft";
  const unpublishedChanges = state.publicationStatus === "changed" || state.dirty;
  useEffect(() => {
    let alive = true;
    const generation = ++lifecycle.current;
    useEditor.getState().reset();
    setReady(false);
    setError("");
    setBusy(false);
    inFlight.current = false;
    setLoop(false);
    getProject(id)
      .then((p) => {
        if (alive) {
          useEditor.getState().load(p);
          setReady(true);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message ?? String(e));
      });
    return () => {
      alive = false;
      lifecycle.current = generation + 1;
      useEditor.getState().reset();
    };
  }, [id]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const navigate = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest("a[href]");
      if (
        link &&
        useEditor.getState().dirty &&
        !window.confirm("Leave without saving your changes?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // The Navigation API can cancel same-document Back/Forward before App Router unmounts.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const traverse = (event: Event) => {
      const e = event as Event & { navigationType?: string };
      if (
        e.navigationType === "traverse" &&
        e.cancelable &&
        useEditor.getState().dirty &&
        !confirm("Leave without saving your changes?")
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    navigation?.addEventListener("navigate", traverse);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
      navigation?.removeEventListener("navigate", traverse);
    };
  }, []);
  async function save(publish = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setAction(publish ? "publish" : "save");
    setBusy(true);
    setError("");
    const snapshot = useEditor.getState();
    const generation = lifecycle.current;
    let draftSaved = false;
    try {
      const input = {
        title: snapshot.title,
        draft: {
          bpm: snapshot.bpm,
          key: snapshot.key,
          instrument: snapshot.instrument,
          notes: snapshot.notes,
        },
      };
      (publish ? publicationSchema : projectInputSchema).parse(input);
      await updateProject(id, input);
      if (generation !== lifecycle.current) return;
      draftSaved = true;
      // Saving a draft never changes its public snapshot. Until refreshed, be conservative.
      useEditor
        .getState()
        .markSaved(
          snapshot.revision,
          snapshot.publicationStatus === "draft"
            ? "draft"
            : snapshot.dirty
              ? "changed"
              : snapshot.publicationStatus,
        );
      if (publish) {
        await publishProject(id);
        if (generation !== lifecycle.current) return;
        useEditor.getState().setPublicationStatus("published");
        toast.success("Your four bars are live");
        if (!useEditor.getState().dirty) router.push(`/m/${id}`);
      } else {
        // Read status only: loading this response would discard edits made during the request.
        const saved = await getProject(id);
        if (generation !== lifecycle.current) return;
        useEditor
          .getState()
          .setPublicationStatus(
            saved.publication_status ?? (saved.published ? "changed" : "draft"),
          );
        toast.success("Draft saved");
      }
    } catch (e) {
      if (generation !== lifecycle.current) return;
      setError(errorMessage(e));
      toast.error(
        draftSaved
          ? publish
            ? "Draft saved, but publishing failed. Your edits are still here."
            : "Draft saved, but publication status could not be refreshed. Try Save again."
          : "Could not save. Your edits are still here.",
      );
    } finally {
      if (generation === lifecycle.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  function saveOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    if (!busy) void save();
  }
  if (error && !ready)
    return (
      <section className="empty">
        <h1>Project unavailable</h1>
        <p role="alert">{error}</p>
        <Link href="/login">Sign in</Link> · <Link href="/">Back to melodies</Link>
      </section>
    );
  if (!ready) return <p role="status">Loading editor…</p>;
  return (
    <section className="editor-workspace">
      <Link href="/" className="back-link">
        <ArrowLeft size={14} /> Melodies
      </Link>
      <div className="editor-heading">
        <div>
          <div className="editor-title-row">
            <input
              ref={titleInput}
              aria-label="Melody title"
              className="title-input"
              maxLength={80}
              disabled={busy}
              value={state.title}
              onChange={(e) => state.setField({ title: e.target.value })}
              onKeyDown={saveOnEnter}
            />
            <button
              type="button"
              className="outline editor-title-edit"
              aria-label="Edit melody title"
              disabled={busy}
              onClick={() => {
                titleInput.current?.focus();
                titleInput.current?.select();
              }}
            >
              <Pencil size={16} />
            </button>
          </div>
          <p role="status">
            {busy
              ? action === "publish"
                ? "Publishing…"
                : action === "delete"
                  ? "Deleting…"
                  : "Saving…"
              : error
                ? "Action failed — try again"
                : state.dirty
                  ? "● Unsaved changes"
                  : "✓ Saved"}
            {published
              ? unpublishedChanges
                ? " · Unpublished changes — public snapshot unchanged"
                : " · Published"
              : " · Private draft"}
          </p>
        </div>
        <div className="actions" role="group" aria-label="Project actions">
          <button
            className="outline"
            disabled={busy || (!state.dirty && !error)}
            onClick={() => save()}
          >
            <Save size={16} /> Save
          </button>
          <button
            className="primary"
            disabled={busy || !state.notes.length || (published && !unpublishedChanges)}
            onClick={() => save(true)}
          >
            <Upload size={16} />{" "}
            {published ? (unpublishedChanges ? "Republish" : "Published") : "Publish"}
          </button>
          <button
            className="outline"
            aria-label="Export MIDI file"
            disabled={busy}
            onClick={() =>
              exportMidi(state.notes, state.bpm, state.title, state.instrument).catch((e) =>
                toast.error(String(e)),
              )
            }
          >
            <Download size={16} /> Export MIDI
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              if (inFlight.current) return;
              if (!confirm("Delete this project and its publication permanently?")) return;
              inFlight.current = true;
              const generation = lifecycle.current;
              setAction("delete");
              setBusy(true);
              try {
                await deleteProject(id);
                if (generation !== lifecycle.current) return;
                useEditor.getState().reset();
                router.push("/");
              } catch (e) {
                if (generation !== lifecycle.current) return;
                setError(errorMessage(e));
              } finally {
                if (generation === lifecycle.current) {
                  inFlight.current = false;
                  setBusy(false);
                }
              }
            }}
          >
            <Trash2 size={16} /> Delete project
          </button>
        </div>
      </div>
      <div className="transport" role="group" aria-label="Playback controls">
        <div className="toolbar-playback">
          <Player notes={state.notes} bpm={state.bpm} instrument={state.instrument} loop={loop} />
          <button
            type="button"
            className={loop ? "primary" : "outline"}
            aria-pressed={loop}
            title="Repeat four bars. Turning Loop off finishes the queued pass; Stop ends playback immediately."
            onClick={() => setLoop(!loop)}
          >
            <Repeat size={16} /> Loop
          </button>
        </div>
        <label>
          Tempo{" "}
          <input
            aria-label="Tempo"
            type="number"
            min={40}
            max={240}
            disabled={busy}
            value={state.bpm || ""}
            onChange={(e) => state.setField({ bpm: Number(e.target.value) })}
            onKeyDown={saveOnEnter}
          />{" "}
          BPM
        </label>
        <span>4 bars · 4/4 · 16 beats</span>
      </div>
      <fieldset disabled={busy} className="editor-fields">
        <div className="controls" role="group" aria-label="Editing controls">
          <div className="roll-mode" role="radiogroup" aria-label="Piano roll mode">
            <label>
              <input
                type="radio"
                name="roll-mode"
                value="draw"
                checked={mode === "draw"}
                onChange={() => setMode("draw")}
              />{" "}
              Draw
            </label>
            <label>
              <input
                type="radio"
                name="roll-mode"
                value="select"
                checked={mode === "select"}
                onChange={() => setMode("select")}
              />{" "}
              Select
            </label>
          </div>
          <label>
            Preset
            <select
              value={state.instrument}
              onChange={(e) => {
                const instrument = e.target.value as typeof state.instrument;
                if (
                  (instrument === "drums") !== (state.instrument === "drums") &&
                  state.notes.length
                ) {
                  if (
                    !confirm(
                      "Switching between drum and pitched rows clears the current notes. Continue?",
                    )
                  )
                    return;
                  state.clear();
                }
                state.setField({ instrument });
              }}
            >
              <option value="piano">Piano</option>
              <option value="bass">Bass</option>
              <option value="drums">Drums</option>
            </select>
          </label>
          <label title="Key is metadata; it does not transpose your notes">
            Key label
            <select value={state.key} onChange={(e) => state.setField({ key: e.target.value })}>
              {["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B", "Am"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Snap
            <select
              value={state.quantization}
              onChange={(e) => state.setQuantization(Number(e.target.value) as Quantization)}
            >
              <option value={1}>1/4 note · 1 beat</option>
              <option value={0.5}>1/8 note · ½ beat</option>
              <option value={0.25}>1/16 note · ¼ beat</option>
            </select>
          </label>
          <div className="toolbar-edit-actions">
            <button
              type="button"
              className="outline"
              disabled={!state.notes.length}
              onClick={() => {
                if (confirm("Clear all notes?")) state.clear();
              }}
            >
              <Eraser size={16} /> Clear notes
            </button>
            <EditorHelp />
          </div>
        </div>
        <PianoRoll mode={mode} />
      </fieldset>
      {published && (
        <p className="editor-note">
          Save keeps your edits private. Republish replaces the version listeners hear.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
