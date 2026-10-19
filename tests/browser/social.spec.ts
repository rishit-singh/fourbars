import { test, expect } from "@playwright/test";
import { fixtureOrigin, fixtureProject, signInFixture, user, userId, projectId } from "./helpers";

test("likes recover from failures, profile names refresh, and project filters query the server", async ({
  page,
  context,
}) => {
  await signInFixture(context);
  let liked = false;
  let failLike = true;
  let profile: { id: string; username: string; display_name: string } | null = null;
  const project = fixtureProject();
  const publication = {
    ...project,
    published_at: "2026-10-18T00:00:00Z",
    composition: {
      bpm: project.bpm,
      key: project.key,
      instrument: project.instrument,
      notes: project.notes,
    },
    publication_status: "published",
  };
  const requestedFilters: (string | null)[] = [];
  await page.route(`${fixtureOrigin}/**`, async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: user });
    if (url.pathname.endsWith("/publication_details"))
      return route.fulfill({
        json: [
          {
            ...publication,
            liked_by_me: liked,
            like_count: liked ? 1 : 0,
            creator_name: profile?.display_name ?? "Anonymous",
          },
        ],
      });
    if (url.pathname.endsWith("/publication_likes")) {
      if (failLike) {
        failLike = false;
        return route.fulfill({ status: 503, json: { message: "Like could not be saved" } });
      }
      liked = request.method() === "POST";
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.pathname.endsWith("/profiles")) {
      if (request.method() === "POST") profile = request.postDataJSON();
      return route.fulfill({ json: profile });
    }
    if (url.pathname.endsWith("/project_details")) {
      const filter = url.searchParams.get("published");
      requestedFilters.push(filter);
      const draft = { ...project, id: projectId, title: "Private draft" };
      const published = {
        ...project,
        id: "44444444-4444-4444-8444-444444444444",
        title: "Live sketch",
        published: true,
        published_at: publication.published_at,
        publication_status: "changed",
      };
      return route.fulfill({
        json:
          filter === "eq.false" ? [draft] : filter === "eq.true" ? [published] : [draft, published],
      });
    }
    return route.fulfill({ json: null });
  });
  await page.goto("/");
  const card = page.locator("article.card").first();
  await card.getByRole("button", { name: "Like First sketch; 0 likes", exact: true }).click();
  await expect(page.getByText("Like could not be saved", { exact: true })).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Like First sketch; 0 likes", exact: true }),
  ).toBeEnabled();
  await card.getByRole("button", { name: "Like First sketch; 0 likes", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Unlike First sketch; 1 likes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => liked).toBe(true);
  await card.getByRole("button", { name: "Unlike First sketch; 1 likes", exact: true }).click();
  await expect.poll(() => liked).toBe(false);

  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill("melody_maker");
  await page.getByLabel("Display name", { exact: true }).fill("Melody Maker");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toContainText("Melody Maker");
  expect(profile).toEqual({ id: userId, username: "melody_maker", display_name: "Melody Maker" });

  await page.getByRole("tab", { name: "My Projects", exact: true }).click();
  await expect(page.locator("article.card")).toHaveCount(2);
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await expect(page.locator("article.card")).toHaveCount(1);
  await expect(page.locator("article.card")).toContainText("Private draft");
  await page.getByRole("button", { name: "Published", exact: true }).click();
  await expect(page.locator("article.card")).toContainText("Unpublished changes");
  expect(requestedFilters).toContain("eq.false");
  expect(requestedFilters).toContain("eq.true");
});
