import { beforeEach, describe, expect, it } from "vitest";
import { useEditor } from "./editor";
import type { Project, PublicationStatus, Quantization } from "@/lib/types";
const project = (publication_status: PublicationStatus): Project => ({
  id: "project",
  user_id: "owner",
  title: "Published title",
  bpm: 120,
  key: "C",
  instrument: "piano",
  notes: [],
  published: publication_status !== "draft",
  publication_status,
  created_at: "",
  updated_at: "",
  published_at: null,
});
beforeEach(() => useEditor.getState().reset());
describe("editor save revisions", () => {
  it("does not mark newer edits saved when an old save completes", () => {
    useEditor.getState().setField({ title: "First" });
    const capturedRevision = useEditor.getState().revision;
    useEditor.getState().setField({ title: "Second" });
    useEditor.getState().markSaved(capturedRevision);
    expect(useEditor.getState().dirty).toBe(true);
    useEditor.getState().markSaved(useEditor.getState().revision);
    expect(useEditor.getState().dirty).toBe(false);
  });
  it("keeps overlapping notes independent and normalizes moves/resizes", () => {
    useEditor.getState().addNote(60, 0);
    useEditor.getState().addNote(60, 0);
    const id = useEditor.getState().notes[0].id;
    useEditor.getState().updateNote(id, { start: 15.5, duration: 8 });
    expect(useEditor.getState().notes).toMatchObject([
      { start: 15.5, duration: 0.5 },
      { start: 0, duration: 0.5 },
    ]);
    useEditor.getState().removeNote(id);
    expect(useEditor.getState().notes).toHaveLength(1);
  });
  it.each([1, 0.5, 0.25] as Quantization[])(
    "floors new notes into their %s-beat cell, while moves use nearest snapping",
    (step) => {
      useEditor.getState().setQuantization(step);
      useEditor.getState().addNote(60, step * 0.9);
      expect(useEditor.getState().notes[0]).toMatchObject({ start: 0, duration: step });
      const id = useEditor.getState().notes[0].id;
      useEditor.getState().updateNote(id, { start: step * 0.9 });
      expect(useEditor.getState().notes[0].start).toBe(step);
      useEditor.getState().addNote(60, 16.5);
      expect(useEditor.getState().notes[1]).toMatchObject({ start: 16 - step, duration: step });
    },
  );

  it.each(["draft", "published", "changed"] as PublicationStatus[])(
    "loads authoritative %s status independently of saved/dirty state",
    (status) => {
      useEditor.getState().load(project(status));
      expect(useEditor.getState()).toMatchObject({ dirty: false, publicationStatus: status });
    },
  );

  it("tracks title-only changes through saving and republishing without clearing newer edits", () => {
    useEditor.getState().load(project("published"));
    useEditor.getState().setField({ title: "New title" });
    const revision = useEditor.getState().revision;
    useEditor.getState().markSaved(revision, "changed");
    expect(useEditor.getState()).toMatchObject({ dirty: false, publicationStatus: "changed" });
    // User edits while the publish RPC is pending.
    useEditor.getState().setField({ title: "Even newer title" });
    useEditor.getState().setPublicationStatus("published");
    expect(useEditor.getState()).toMatchObject({
      dirty: true,
      title: "Even newer title",
      publicationStatus: "published",
    });
  });

  it("refreshes status after a draft save without replacing later edits", () => {
    useEditor.getState().load(project("published"));
    useEditor.getState().setField({ title: "Saved title" });
    const revision = useEditor.getState().revision;
    useEditor.getState().setField({ title: "Still unsaved title" });
    useEditor.getState().markSaved(revision, "changed");
    useEditor.getState().setPublicationStatus("changed");
    expect(useEditor.getState()).toMatchObject({
      title: "Still unsaved title",
      dirty: true,
      publicationStatus: "changed",
    });
    // If the server says a saved reversion matches the publication, use that true status.
    useEditor.getState().setPublicationStatus("published");
    expect(useEditor.getState().dirty).toBe(true);
  });

  it("does not let an older save completion regress a newer saved revision or its status", () => {
    useEditor.getState().setField({ title: "First" });
    const old = useEditor.getState().revision;
    useEditor.getState().setField({ title: "Second" });
    useEditor.getState().markSaved(useEditor.getState().revision, "published");
    useEditor.getState().markSaved(old, "changed");
    expect(useEditor.getState()).toMatchObject({ dirty: false, publicationStatus: "published" });
  });

  it("does not make unchanged controls or a stationary note drag dirty", () => {
    useEditor.getState().setField({ title: useEditor.getState().title });
    useEditor.getState().clear();
    expect(useEditor.getState().revision).toBe(0);
    useEditor.getState().addNote(60, 0);
    useEditor.getState().markSaved(useEditor.getState().revision, "published");
    const revision = useEditor.getState().revision;
    useEditor.getState().updateNote(useEditor.getState().notes[0].id, { start: 0.1 });
    useEditor.getState().removeNote("missing");
    expect(useEditor.getState()).toMatchObject({ dirty: false, revision });
  });
});
