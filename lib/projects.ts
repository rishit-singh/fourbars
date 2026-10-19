"use client";
import { z } from "zod";
import { getSupabase } from "./supabase";
import { compositionSchema, projectInputSchema } from "./validation";
import type { Composition, Profile, Project } from "./types";

export async function requireUser() {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) throw new Error("Sign in to manage your projects");
  return data.user;
}
export async function createProject() {
  const user = await requireUser();
  const { data, error } = await getSupabase()
    .from("projects")
    .insert({ user_id: user.id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
const socialFields = {
  creator_name: z.string(),
  like_count: z.coerce.number().int().nonnegative(),
  liked_by_me: z.boolean(),
  publication_status: z.enum(["draft", "published", "changed"]),
};
const rowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  published_at: z.string().nullable(),
  published: z.boolean(),
  ...socialFields,
  ...compositionSchema.shape,
});
const publicSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  title: z.string(),
  published_at: z.string(),
  composition: compositionSchema,
  ...socialFields,
});
function publicProject(value: unknown): Project {
  const p = publicSchema.parse(value);
  return {
    id: p.id,
    user_id: p.user_id,
    title: p.title,
    ...p.composition,
    published: true,
    published_at: p.published_at,
    created_at: p.published_at,
    updated_at: p.published_at,
    creator_name: p.creator_name,
    like_count: p.like_count,
    liked_by_me: p.liked_by_me,
    publication_status: p.publication_status,
  };
}
export async function getProject(id: string): Promise<Project> {
  const user = await requireUser();
  const { data, error } = await getSupabase()
    .from("project_details")
    .select("*")
    .eq("id", z.uuid().parse(id))
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Project not found");
  return rowSchema.parse(data);
}
export async function getPublished(id: string): Promise<Project> {
  const { data, error } = await getSupabase()
    .from("publication_details")
    .select("*")
    .eq("id", z.uuid().parse(id))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Melody not found");
  return publicProject(data);
}
export async function updateProject(id: string, input: { title: string; draft: Composition }) {
  const parsed = projectInputSchema.parse(input);
  const user = await requireUser();
  const { data, error } = await getSupabase()
    .from("projects")
    .update({ title: parsed.title, ...parsed.draft })
    .eq("id", z.uuid().parse(id))
    .eq("user_id", user.id)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}
export async function publishProject(id: string) {
  await requireUser();
  const { error } = await getSupabase().rpc("publish_project", { project_id: z.uuid().parse(id) });
  if (error) throw error;
}
export async function unpublishProject(id: string) {
  await requireUser();
  const { error } = await getSupabase().rpc("unpublish_project", {
    project_id: z.uuid().parse(id),
  });
  if (error) throw error;
}
export async function deleteProject(id: string) {
  const user = await requireUser();
  const { error } = await getSupabase()
    .from("projects")
    .delete()
    .eq("id", z.uuid().parse(id))
    .eq("user_id", user.id)
    .select("id")
    .single();
  if (error) throw error;
}
export type Cursor = { time: string; id: string };
export async function listProjects(
  mine: boolean,
  cursor?: Cursor,
  filter: "all" | "drafts" | "published" = "all",
): Promise<{ items: Project[]; next?: Cursor }> {
  const column = mine ? "updated_at" : "published_at";
  let query = getSupabase()
    .from(mine ? "project_details" : "publication_details")
    .select("*")
    .order(column, { ascending: false })
    .order("id", { ascending: false })
    .limit(13);
  if (mine) query = query.eq("user_id", (await requireUser()).id);
  if (mine && filter !== "all") query = query.eq("published", filter === "published");
  if (cursor) {
    // Only validated timestamps/UUIDs can enter PostgREST's filter syntax.
    const time = z.iso.datetime({ offset: true }).parse(cursor.time);
    const id = z.uuid().parse(cursor.id);
    query = query.or(`${column}.lt.${time},and(${column}.eq.${time},id.lt.${id})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const items = rows.slice(0, 12).map((p) => (mine ? rowSchema.parse(p) : publicProject(p)));
  const last = items.at(-1);
  return {
    items,
    next:
      rows.length > 12 && last
        ? { id: last.id, time: mine ? last.updated_at : last.published_at! }
        : undefined,
  };
}

const profileSchema = z.object({
  id: z.uuid(),
  username: z.string().regex(/^[a-z0-9_]{3,24}$/),
  display_name: z.string().trim().min(1).max(60),
});

export async function getMyProfile(): Promise<Profile | null> {
  const user = await requireUser();
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("id,username,display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? profileSchema.parse(data) : null;
}

export async function saveMyProfile(username: string, displayName: string): Promise<Profile> {
  const user = await requireUser();
  const profile = profileSchema.parse({
    id: user.id,
    username: username.trim().toLowerCase(),
    display_name: displayName,
  });
  const { data, error } = await getSupabase()
    .from("profiles")
    .upsert(profile, { onConflict: "id" })
    .select("id,username,display_name")
    .single();
  if (error) throw error;
  return profileSchema.parse(data);
}

export async function setProjectLike(id: string, liked: boolean): Promise<void> {
  const user = await requireUser();
  const publicationId = z.uuid().parse(id);
  const query = getSupabase().from("publication_likes");
  const { error } = liked
    ? await query.upsert(
        { publication_id: publicationId, user_id: user.id },
        { onConflict: "publication_id,user_id", ignoreDuplicates: true },
      )
    : await query.delete().eq("publication_id", publicationId).eq("user_id", user.id);
  if (error) throw error;
}
