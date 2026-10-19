import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Real Postgres/RLS in WASM. Only Supabase's auth.users and auth.uid() are shimmed.
const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const notes = [{ id: "note", pitch: 60, start: 0, duration: 1, velocity: 100 }];
async function asUser(id?: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
  await db.exec(`set role ${id ? "authenticated" : "anon"}`);
}
beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    insert into auth.users values ('${a}'), ('${b}');
  `);
  const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  await db.exec(schema);
  await db.exec(schema); // Applying the bootstrap again must be safe.
}, 30_000);
afterAll(async () => {
  await db.close();
});

describe("SQL authorization and publication snapshots", () => {
  let id: string;
  it("creates and validates owner drafts, with a server timestamp", async () => {
    await asUser(a);
    const result = await db.query<{ id: string; updated_at: string }>(
      "insert into public.projects (user_id,title,notes) values ($1,'Original',$2) returning id,updated_at",
      [a, JSON.stringify(notes)],
    );
    id = result.rows[0].id;
    expect(result.rows[0].updated_at).toBeTruthy();
    await expect(
      db.query("insert into public.projects (user_id) values ($1)", [b]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.query("update public.projects set notes=$1 where id=$2", [
        JSON.stringify([{ ...notes[0], start: 15.5 }]),
        id,
      ]),
    ).rejects.toThrow(/Invalid/);
    await expect(
      db.query("update public.projects set published=true where id=$1", [id]),
    ).rejects.toThrow(/permission denied/);
  });
  it("denies another user reads, writes, publishing and deleting", async () => {
    await asUser(b);
    expect((await db.query("select * from public.projects where id=$1", [id])).rows).toHaveLength(
      0,
    );
    expect(
      (await db.query("update public.projects set title='Stolen' where id=$1 returning id", [id]))
        .rows,
    ).toHaveLength(0);
    expect(
      (await db.query("delete from public.projects where id=$1 returning id", [id])).rows,
    ).toHaveLength(0);
    await expect(db.query("select public.publish_project($1)", [id])).rejects.toThrow(/not found/);
    await expect(db.query("select public.unpublish_project($1)", [id])).rejects.toThrow(
      /not found/,
    );
  });
  it("publishes atomically and keeps subsequent title/note edits private", async () => {
    await asUser(a);
    await db.query("select public.publish_project($1)", [id]);
    await db.query("update public.projects set title='Private revision', notes=$1 where id=$2", [
      JSON.stringify([{ ...notes[0], pitch: 67 }]),
      id,
    ]);
    await asUser();
    const result = await db.query<{ title: string; composition: { notes: { pitch: number }[] } }>(
      "select * from public.publications where id=$1",
      [id],
    );
    expect(result.rows[0].title).toBe("Original");
    expect(result.rows[0].composition.notes[0].pitch).toBe(60);
    await expect(db.query("select * from public.projects where id=$1", [id])).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query("select public.publish_project($1)", [id])).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query("update public.publications set title='Changed' where id=$1", [id]),
    ).rejects.toThrow(/permission denied/);
  });
  it("republishes explicitly, increments version, then unpublishes", async () => {
    await asUser(a);
    await db.query("select public.publish_project($1)", [id]);
    const result = await db.query<{ title: string; version: number }>(
      "select title,version from public.publications where id=$1",
      [id],
    );
    expect(result.rows[0]).toEqual({ title: "Private revision", version: 2 });
    await db.query("select public.unpublish_project($1)", [id]);
    expect((await db.query("select * from public.projects where id=$1", [id])).rows).toHaveLength(
      1,
    );
    await asUser();
    expect(
      (await db.query("select * from public.publications where id=$1", [id])).rows,
    ).toHaveLength(0);
  });
  it("rejects empty publications and cascades owner deletion", async () => {
    await asUser(a);
    await db.query("update public.projects set notes='[]' where id=$1", [id]);
    await expect(db.query("select public.publish_project($1)", [id])).rejects.toThrow(
      /Add valid notes/,
    );
    await db.query("update public.projects set notes=$1 where id=$2", [JSON.stringify(notes), id]);
    await db.query("select public.publish_project($1)", [id]);
    await db.query("delete from public.projects where id=$1", [id]);
    await asUser();
    expect(
      (await db.query("select * from public.publications where id=$1", [id])).rows,
    ).toHaveLength(0);
  });
});

describe("public profiles, private likes, and accurate publication status", () => {
  async function createDraft() {
    await asUser(a);
    const result = await db.query<{ id: string }>(
      "insert into public.projects (user_id,title,notes) values ($1,'Snapshot',$2) returning id",
      [a, JSON.stringify(notes)],
    );
    return result.rows[0].id;
  }

  it("exposes only safe profile fields and enforces ownership and unique normalized usernames", async () => {
    await asUser(a);
    await db.query(
      "insert into public.profiles (id,username,display_name) values ($1,'alice','Alice')",
      [a],
    );
    await expect(
      db.query("insert into public.profiles values ($1,'bob','Bob')", [b]),
    ).rejects.toThrow(/row-level security/);
    await asUser(b);
    await expect(
      db.query("insert into public.profiles values ($1,'alice','Bob')", [b]),
    ).rejects.toThrow(/unique/);
    for (const username of ["A_B", "ab", "has space", "x".repeat(25), "bob@example.com"]) {
      await expect(
        db.query("insert into public.profiles values ($1,$2,'Bob')", [b, username]),
      ).rejects.toThrow(/check constraint/);
    }
    await expect(
      db.query("insert into public.profiles values ($1,'bob','   ')", [b]),
    ).rejects.toThrow(/check constraint/);
    await db.query("insert into public.profiles values ($1,'bob','Bob')", [b]);
    expect(
      (
        await db.query(
          "update public.profiles set display_name='Stolen' where id=$1 returning id",
          [a],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(db.query("update public.profiles set id=$1 where id=$2", [a, b])).rejects.toThrow(
      /row-level security/,
    );
    await db.query(
      "insert into public.profiles values ($1,'bob','Bobby') on conflict (id) do update set id=excluded.id,username=excluded.username,display_name=excluded.display_name",
      [b],
    );
    await asUser();
    expect((await db.query("select * from public.profiles order by username")).rows).toEqual([
      { id: a, username: "alice", display_name: "Alice" },
      { id: b, username: "bob", display_name: "Bobby" },
    ]);
    await expect(
      db.query("insert into public.profiles values ($1,'guest','Guest')", [a]),
    ).rejects.toThrow(/permission denied/);
  });

  it("derives status from saved music and title, including exact reversions", async () => {
    const id = await createDraft();
    async function status() {
      return (
        await db.query<{ publication_status: string }>(
          "select publication_status from public.project_details where id=$1",
          [id],
        )
      ).rows[0].publication_status;
    }
    expect(await status()).toBe("draft");
    await db.query("select public.publish_project($1)", [id]);
    expect(await status()).toBe("published");
    await db.query("update public.projects set title='Private title' where id=$1", [id]);
    expect(await status()).toBe("changed");
    expect(
      (
        await db.query<{ title: string }>(
          "select title from public.publication_details where id=$1",
          [id],
        )
      ).rows[0].title,
    ).toBe("Snapshot");
    await db.query("update public.projects set title='Snapshot' where id=$1", [id]);
    expect(await status()).toBe("published");
    for (const change of ["bpm=130", "key='D'", "instrument='bass'", "notes='[]'"]) {
      await db.query(`update public.projects set ${change} where id=$1`, [id]);
      expect(await status()).toBe("changed");
      await db.query(
        "update public.projects set bpm=120,key='C',instrument='piano',notes=$1 where id=$2",
        [JSON.stringify(notes), id],
      );
      expect(await status()).toBe("published");
    }
    await db.query("update public.projects set title='New publication' where id=$1", [id]);
    await db.query("select public.publish_project($1)", [id]);
    expect(await status()).toBe("published");
    await asUser(b);
    expect(
      (await db.query("select * from public.project_details where id=$1", [id])).rows,
    ).toHaveLength(0);
    await asUser();
    await expect(db.query("select * from public.project_details")).rejects.toThrow(
      /permission denied/,
    );
    await asUser(a);
    await db.query("select public.unpublish_project($1)", [id]);
    expect(await status()).toBe("draft");
    await db.query("delete from public.projects where id=$1", [id]);
  });

  it("keeps liker identities private while exposing safe counts and viewer-specific state", async () => {
    const id = await createDraft();
    await expect(
      db.query("insert into public.publication_likes values ($1,$2)", [id, a]),
    ).rejects.toThrow(/foreign key/);
    await db.query("select public.publish_project($1)", [id]);
    await expect(
      db.query("insert into public.publication_likes values ($1,$2)", [id, b]),
    ).rejects.toThrow(/row-level security/);
    await db.query("insert into public.publication_likes values ($1,$2)", [id, a]);
    await expect(
      db.query("insert into public.publication_likes values ($1,$2)", [id, a]),
    ).rejects.toThrow(/unique/);
    // The repository's idempotent upsert uses ON CONFLICT DO NOTHING.
    await db.query("insert into public.publication_likes values ($1,$2) on conflict do nothing", [
      id,
      a,
    ]);
    await asUser(b);
    expect(
      (await db.query("select * from public.publication_likes where publication_id=$1", [id])).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("delete from public.publication_likes where publication_id=$1 returning *", [
          id,
        ])
      ).rows,
    ).toHaveLength(0);
    await db.query("insert into public.publication_likes values ($1,$2)", [id, b]);
    expect(
      (
        await db.query(
          "select creator_name,like_count,liked_by_me from public.publication_details where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ creator_name: "Alice", like_count: 2, liked_by_me: true });
    await asUser();
    expect((await db.query("select * from public.publication_likes")).rows).toHaveLength(0);
    expect(
      (
        await db.query(
          "select like_count,liked_by_me from public.publication_details where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ like_count: 2, liked_by_me: false });
    await expect(
      db.query("insert into public.publication_likes values ($1,$2)", [id, b]),
    ).rejects.toThrow(/permission denied/);
    await asUser(b);
    await db.query("delete from public.publication_likes where publication_id=$1 and user_id=$2", [
      id,
      b,
    ]);
    expect(
      (
        await db.query(
          "select like_count,liked_by_me from public.publication_details where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ like_count: 1, liked_by_me: false });
    await asUser(a);
    await db.query("update public.projects set title='Changed' where id=$1", [id]);
    await db.query("select public.publish_project($1)", [id]);
    expect(
      (
        await db.query<{ like_count: number }>(
          "select like_count from public.publication_details where id=$1",
          [id],
        )
      ).rows[0].like_count,
    ).toBe(1);
    await db.query("select public.unpublish_project($1)", [id]);
    expect(
      (await db.query("select * from public.publication_likes where publication_id=$1", [id])).rows,
    ).toHaveLength(0);
    expect(
      (await db.query<{ count: number }>("select public.publication_like_count($1) as count", [id]))
        .rows[0].count,
    ).toBe(0);
    await db.query("select public.publish_project($1)", [id]);
    await db.query("insert into public.publication_likes values ($1,$2)", [id, a]);
    await db.query("delete from public.projects where id=$1", [id]);
    expect(
      (await db.query("select * from public.publication_likes where publication_id=$1", [id])).rows,
    ).toHaveLength(0);
  });

  it("can reapply the upgrade without replacing saved profiles, likes, or snapshots", async () => {
    const id = await createDraft();
    await db.query("select public.publish_project($1)", [id]);
    await db.query("insert into public.publication_likes values ($1,$2)", [id, a]);
    await db.query("update public.projects set title='Still private' where id=$1", [id]);
    await db.exec("reset role");
    await db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    await asUser(a);
    expect(
      (
        await db.query(
          "select title,like_count,creator_name from public.publication_details where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ title: "Snapshot", like_count: 1, creator_name: "Alice" });
    expect(
      (
        await db.query<{ publication_status: string }>(
          "select publication_status from public.project_details where id=$1",
          [id],
        )
      ).rows[0].publication_status,
    ).toBe("changed");
    await db.query("delete from public.projects where id=$1", [id]);
  });
});
