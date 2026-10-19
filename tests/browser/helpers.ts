import type { BrowserContext } from "@playwright/test";

export const fixtureOrigin = "https://fourbars-fixture.supabase.co";
export const userId = "11111111-1111-4111-8111-111111111111";
export const projectId = "33333333-3333-4333-8333-333333333333";
export const user = {
  id: userId,
  email: "test@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
};

export function fixtureSession() {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: expires })).toString("base64url")}.fixture`,
    refresh_token: "fixture",
    expires_at: expires,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
}

export async function signInFixture(context: BrowserContext) {
  await context.addCookies([
    {
      name: "sb-fourbars-fixture-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(fixtureSession())).toString("base64url")}`,
      domain: "localhost",
      path: "/",
    },
  ]);
}

export function fixtureProject() {
  return {
    id: projectId,
    user_id: userId,
    title: "First sketch",
    bpm: 120,
    key: "C",
    instrument: "piano",
    notes: [{ id: "note", pitch: 60, start: 0, duration: 0.5, velocity: 100 }],
    published: false,
    published_at: null as string | null,
    created_at: "2026-10-18T00:00:00Z",
    updated_at: "2026-10-18T00:00:00Z",
    creator_name: "Anonymous",
    like_count: 0,
    liked_by_me: false,
    publication_status: "draft",
  };
}
