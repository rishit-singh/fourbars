import { describe, expect, it } from "vitest";
import { compositionSchema, projectInputSchema, publicationSchema } from "./validation";
const draft = {
  bpm: 120,
  key: "C",
  instrument: "piano",
  notes: [{ id: "a", pitch: 60, start: 15, duration: 1, velocity: 100 }],
};
describe("project contracts", () => {
  it("trims valid titles", () =>
    expect(projectInputSchema.parse({ title: "  Idea  ", draft }).title).toBe("Idea"));
  it.each(["", "  ", "a".repeat(81)])("rejects invalid title %s", (title) =>
    expect(projectInputSchema.safeParse({ title, draft }).success).toBe(false),
  );
  it.each([0, 39, 241, 120.5, NaN, Infinity])("rejects BPM %s", (bpm) =>
    expect(compositionSchema.safeParse({ ...draft, bpm }).success).toBe(false),
  );
  it("accepts a blank draft but rejects blank publishing", () => {
    const input = { title: "Blank", draft: { ...draft, notes: [] } };
    expect(projectInputSchema.safeParse(input).success).toBe(true);
    expect(publicationSchema.safeParse(input).success).toBe(false);
  });
  it.each([
    { start: -1 },
    { start: 16 },
    { duration: 2 },
    { duration: 0 },
    { pitch: 128 },
    { velocity: 0 },
  ])("rejects invalid note %j", (patch) => {
    expect(
      compositionSchema.safeParse({ ...draft, notes: [{ ...draft.notes[0], ...patch }] }).success,
    ).toBe(false);
  });
  it("rejects duplicate IDs and excessive note counts", () => {
    expect(
      compositionSchema.safeParse({ ...draft, notes: [draft.notes[0], draft.notes[0]] }).success,
    ).toBe(false);
    expect(
      compositionSchema.safeParse({
        ...draft,
        notes: Array.from({ length: 513 }, (_, i) => ({ ...draft.notes[0], id: String(i) })),
      }).success,
    ).toBe(false);
  });
});
