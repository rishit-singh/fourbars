import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMyProfile,
  getProject,
  getPublished,
  listProjects,
  saveMyProfile,
  setProjectLike,
  updateProject,
} from "./projects";

const mocks = vi.hoisted(() => ({ getSupabase: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: mocks.getSupabase }));

const id = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const time = "2026-10-18T12:00:00Z";
const composition = { bpm: 120, key: "C", instrument: "piano", notes: [] };
const social = {
  creator_name: "Alice",
  like_count: 3,
  liked_by_me: true,
  publication_status: "changed",
};
const draft = {
  id,
  user_id: userId,
  title: "Draft",
  ...composition,
  ...social,
  published: true,
  created_at: time,
  updated_at: time,
  published_at: time,
};
const publication = {
  id,
  user_id: userId,
  title: "Public",
  composition,
  ...social,
  publication_status: "published",
  published_at: time,
};

function client(data: unknown = null, error: unknown = null) {
  const result = { data, error };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  const supabase = {
    from: vi.fn().mockReturnValue(chain),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) },
  };
  mocks.getSupabase.mockReturnValue(supabase);
  return { ...supabase, chain };
}

beforeEach(() => vi.clearAllMocks());

describe("project read models", () => {
  it("reads owner status and social metadata without per-project requests", async () => {
    const db = client(draft);
    expect(await getProject(id)).toMatchObject({ ...social, title: "Draft" });
    expect(db.from).toHaveBeenCalledExactlyOnceWith("project_details");
    expect(db.chain.eq).toHaveBeenCalledWith("user_id", userId);
  });

  it("reads the public snapshot and flattens music fields", async () => {
    const db = client(publication);
    expect(await getPublished(id)).toMatchObject({
      ...composition,
      title: "Public",
      ...social,
      publication_status: "published",
    });
    expect(db.from).toHaveBeenCalledExactlyOnceWith("publication_details");
    expect(db.auth.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ["drafts", false],
    ["published", true],
  ] as const)("filters %s on the server before pagination", async (filter, published) => {
    const db = client(Array.from({ length: 13 }, () => draft));
    const result = await listProjects(true, { time, id }, filter);
    expect(db.chain.eq).toHaveBeenCalledWith("published", published);
    expect(db.chain.limit).toHaveBeenCalledWith(13);
    expect(db.chain.or).toHaveBeenCalledWith(
      `updated_at.lt.${time},and(updated_at.eq.${time},id.lt.${id})`,
    );
    expect(result.items).toHaveLength(12);
    expect(result.next).toEqual({ time, id });
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("defaults to all owner projects and ignores owner filters for public feeds", async () => {
    const db = client([]);
    await listProjects(true);
    expect(db.chain.eq).not.toHaveBeenCalledWith("published", expect.anything());
    db.chain.eq.mockClear();
    await listProjects(false, undefined, "drafts");
    expect(db.chain.eq).not.toHaveBeenCalled();
    expect(db.from).toHaveBeenLastCalledWith("publication_details");
  });

  it("saves only draft columns, never a public snapshot or status", async () => {
    const db = client({ id });
    await updateProject(id, { title: "Private", draft: { ...composition, instrument: "piano" } });
    expect(db.from).toHaveBeenCalledExactlyOnceWith("projects");
    expect(db.chain.update).toHaveBeenCalledExactlyOnceWith({ title: "Private", ...composition });
  });
});

describe("profiles and likes", () => {
  it("returns null for an authenticated user who has not created a profile", async () => {
    const db = client();
    expect(await getMyProfile()).toBeNull();
    expect(db.chain.select).toHaveBeenCalledWith("id,username,display_name");
    expect(db.chain.eq).toHaveBeenCalledWith("id", userId);
  });

  it("normalizes usernames and display names before profile upsert", async () => {
    const profile = { id: userId, username: "alice_123", display_name: "Alice" };
    const db = client(profile);
    expect(await saveMyProfile(" ALICE_123 ", " Alice ")).toEqual(profile);
    expect(db.chain.upsert).toHaveBeenCalledWith(profile, { onConflict: "id" });
    await expect(saveMyProfile("bad@email.com", "Alice")).rejects.toThrow();
  });

  it("adds likes idempotently with the authenticated identity", async () => {
    const db = client();
    await setProjectLike(id, true);
    expect(db.from).toHaveBeenCalledExactlyOnceWith("publication_likes");
    expect(db.chain.upsert).toHaveBeenCalledWith(
      { publication_id: id, user_id: userId },
      { onConflict: "publication_id,user_id", ignoreDuplicates: true },
    );
  });

  it("removes only the current user's like and propagates failures", async () => {
    const db = client();
    await setProjectLike(id, false);
    expect(db.chain.delete).toHaveBeenCalledOnce();
    expect(db.chain.eq).toHaveBeenCalledWith("publication_id", id);
    expect(db.chain.eq).toHaveBeenCalledWith("user_id", userId);
    const failure = new Error("Like failed");
    client(null, failure);
    await expect(setProjectLike(id, true)).rejects.toBe(failure);
  });

  it("requires authentication for mutations and private profile reads", async () => {
    const db = client();
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(setProjectLike(id, true)).rejects.toThrow(/Sign in/);
    await expect(getMyProfile()).rejects.toThrow(/Sign in/);
    await expect(saveMyProfile("alice", "Alice")).rejects.toThrow(/Sign in/);
    expect(db.from).not.toHaveBeenCalled();
  });
});
