import { test, expect } from "@playwright/test";

test("anonymous feed uses keyset paging and one active player", async ({ page }) => {
  const rows = Array.from({ length: 13 }, (_, i) => ({
    id: `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`,
    user_id: "11111111-1111-4111-8111-111111111111",
    title: `Melody ${i + 1}`,
    published_at: "2026-10-18T00:00:00Z",
    creator_name: "Test musician",
    like_count: 2,
    liked_by_me: false,
    publication_status: "published",
    composition: {
      bpm: 40,
      key: "C",
      instrument: "piano",
      notes: [{ id: "n", pitch: 60, start: 0, duration: 1, velocity: 100 }],
    },
  }));
  const queries: URL[] = [];
  await page.route("https://fourbars-fixture.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/publication_details")) {
      queries.push(url);
      if (url.searchParams.has("id")) return route.fulfill({ json: rows[0] });
      return route.fulfill({ json: url.searchParams.has("or") ? rows.slice(12) : rows });
    }
    return route.fulfill({ status: 401, json: { message: "Not signed in" } });
  });
  await page.goto("/");
  await expect(page.locator("article.card")).toHaveCount(12);
  await expect(page.getByRole("tab", { name: "My Projects" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Profile", exact: true })).toHaveCount(0);
  expect(queries[0].searchParams.get("limit")).toBe("13");
  expect(queries[0].searchParams.get("order")).toBe("published_at.desc,id.desc");
  const cards = page.locator("article.card");
  await cards.nth(0).getByRole("button", { name: "Play Melody 1", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Play melody", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("slider", { name: "Playback position" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Stop playback" })).toHaveCount(0);
  await cards.nth(1).getByRole("button", { name: "Play Melody 2", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Play melody", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("slider", { name: "Playback position" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop playback" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(cards).toHaveCount(13);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(queries.some((url) => url.searchParams.get("or")?.includes("id.lt."))).toBe(true);
  await cards.nth(0).getByRole("link", { name: "Open", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Melody 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop playback" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit draft" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Sign in to like/ })).toBeVisible();
});
