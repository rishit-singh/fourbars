export type Instrument = "piano" | "bass" | "drums";
export type Quantization = 1 | 0.5 | 0.25;
export type Note = { id: string; pitch: number; start: number; duration: number; velocity: number };
export type Composition = { bpm: number; key: string; instrument: Instrument; notes: Note[] };
export type Profile = { id: string; username: string; display_name: string };
export type PublicationStatus = "draft" | "published" | "changed";
export type Project = {
  id: string;
  user_id: string;
  title: string;
  bpm: number;
  key: string;
  instrument: Instrument;
  notes: Note[];
  published: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  // Optional for existing local fixtures; repository reads always populate these.
  creator_name?: string;
  like_count?: number;
  liked_by_me?: boolean;
  publication_status?: PublicationStatus;
};
export const TOTAL_BEATS = 16;
export const LOW_PITCH = 48;
export const HIGH_PITCH = 71;
