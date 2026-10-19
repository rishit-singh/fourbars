import { z } from "zod";

export const noteSchema = z
  .object({
    id: z.string().min(1).max(100),
    pitch: z.number().int().min(0).max(127),
    start: z.number().min(0).lt(16),
    duration: z.number().positive().max(16),
    velocity: z.number().int().min(1).max(127),
  })
  .refine((n) => n.start + n.duration <= 16, "Notes must end within four bars");
export const compositionSchema = z.object({
  bpm: z.number().int().min(40).max(240),
  key: z.string().min(1).max(8),
  instrument: z.enum(["piano", "bass", "drums"]),
  notes: z
    .array(noteSchema)
    .max(512)
    .refine(
      (notes) => new Set(notes.map((n) => n.id)).size === notes.length,
      "Note IDs must be unique",
    ),
});
export const projectInputSchema = z.object({
  title: z.string().trim().min(1, "Give your melody a title").max(80),
  draft: compositionSchema,
});
export const publicationSchema = projectInputSchema.refine(
  (p) => p.draft.notes.length > 0,
  "Add at least one note before publishing",
);
