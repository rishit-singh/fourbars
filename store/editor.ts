"use client";
import { create } from "zustand";
import { floorSnap, normalizedNote } from "@/lib/music";
import type { Instrument, Note, Project, PublicationStatus, Quantization } from "@/lib/types";
type State = {
  title: string;
  bpm: number;
  key: string;
  instrument: Instrument;
  notes: Note[];
  dirty: boolean;
  revision: number;
  savedRevision: number;
  publicationStatus: PublicationStatus;
  selection: string | null;
  quantization: Quantization;
  load: (project: Project) => void;
  setField: (patch: Partial<Pick<State, "title" | "bpm" | "key" | "instrument">>) => void;
  setQuantization: (step: Quantization) => void;
  select: (id: string | null) => void;
  addNote: (pitch: number, start: number) => void;
  updateNote: (id: string, patch: Partial<Note>) => void;
  removeNote: (id: string) => void;
  clear: () => void;
  markSaved: (revision: number, publicationStatus?: PublicationStatus) => void;
  setPublicationStatus: (publicationStatus: PublicationStatus) => void;
  reset: () => void;
};
const initial = {
  title: "Untitled melody",
  bpm: 120,
  key: "C",
  instrument: "piano" as Instrument,
  notes: [] as Note[],
  dirty: false,
  revision: 0,
  savedRevision: 0,
  publicationStatus: "draft" as PublicationStatus,
  selection: null,
  quantization: 0.5 as Quantization,
};
export const useEditor = create<State>((set) => ({
  ...initial,
  load: (p) =>
    set({
      ...initial,
      title: p.title,
      bpm: p.bpm,
      key: p.key,
      instrument: p.instrument,
      notes: p.notes,
      publicationStatus: p.publication_status ?? (p.published ? "published" : "draft"),
    }),
  reset: () => set(initial),
  setField: (patch) =>
    set((s) => {
      if (Object.entries(patch).every(([key, value]) => s[key as keyof typeof patch] === value))
        return s;
      return { ...patch, dirty: true, revision: s.revision + 1 };
    }),
  setQuantization: (quantization) => set({ quantization }),
  select: (selection) => set({ selection }),
  addNote: (pitch, start) =>
    set((s) => {
      if (s.notes.length >= 512) return s;
      const id = crypto.randomUUID();
      return {
        notes: [
          ...s.notes,
          normalizedNote(
            {
              id,
              pitch,
              start: floorSnap(start, s.quantization),
              duration: s.quantization,
              velocity: 100,
            },
            s.quantization,
            s.instrument === "drums",
          ),
        ],
        selection: id,
        dirty: true,
        revision: s.revision + 1,
      };
    }),
  updateNote: (id, patch) =>
    set((s) => {
      const note = s.notes.find((n) => n.id === id);
      if (!note) return s;
      const next = normalizedNote({ ...note, ...patch }, s.quantization, s.instrument === "drums");
      if (Object.keys(next).every((key) => next[key as keyof Note] === note[key as keyof Note]))
        return s;
      return {
        notes: s.notes.map((n) => (n.id === id ? next : n)),
        dirty: true,
        revision: s.revision + 1,
      };
    }),
  removeNote: (id) =>
    set((s) =>
      !s.notes.some((n) => n.id === id)
        ? s
        : {
            notes: s.notes.filter((n) => n.id !== id),
            selection: null,
            dirty: true,
            revision: s.revision + 1,
          },
    ),
  clear: () =>
    set((s) =>
      s.notes.length ? { notes: [], selection: null, dirty: true, revision: s.revision + 1 } : s,
    ),
  markSaved: (revision, publicationStatus) =>
    set((s) => {
      if (revision < s.savedRevision || revision > s.revision) return s;
      return {
        savedRevision: revision,
        dirty: s.revision !== revision,
        publicationStatus: publicationStatus ?? s.publicationStatus,
      };
    }),
  setPublicationStatus: (publicationStatus) => set({ publicationStatus }),
}));
