import { test, expect } from "@playwright/test";
const id = "33333333-3333-4333-8333-333333333333";
const userId = "11111111-1111-4111-8111-111111111111";

test("editor interactions, playback, failed save, publish and help (mock HTTP)", async ({
  page,
  context,
}) => {
  const user = {
    id: userId,
    email: "test@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
  };
  const token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
  const session = {
    access_token: token,
    refresh_token: "fixture",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  await context.addCookies([
    {
      name: "sb-fourbars-fixture-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      domain: "localhost",
      path: "/",
    },
  ]);
  let project = {
    id,
    user_id: userId,
    title: "Test sketch",
    bpm: 120,
    key: "C",
    instrument: "piano",
    notes: [] as { pitch: number; start: number; duration: number }[],
    published: false,
    published_at: null as string | null,
    created_at: "2026-10-18T00:00:00Z",
    updated_at: "2026-10-18T00:00:00Z",
    creator_name: "Test musician",
    like_count: 0,
    liked_by_me: false,
    publication_status: "draft",
  };
  let publication: object | null = null;
  let failSave = false;
  await page.route("https://fourbars-fixture.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: user });
    if (url.pathname.endsWith("/profiles")) return route.fulfill({ json: null });
    if (url.pathname.endsWith("/project_details")) return route.fulfill({ json: project });
    if (url.pathname.endsWith("/projects")) {
      if (request.method() === "PATCH") {
        if (failSave) return route.fulfill({ status: 503, json: { message: "Save unavailable" } });
        project = { ...project, ...request.postDataJSON() };
        project.publication_status = project.published ? "changed" : "draft";
        return route.fulfill({ json: { id } });
      }
      return route.fulfill({ json: project });
    }
    if (url.pathname.endsWith("/publish_project")) {
      project.published = true;
      project.published_at = "2026-10-18T01:00:00Z";
      project.publication_status = "published";
      publication = {
        id,
        user_id: userId,
        title: project.title,
        published_at: project.published_at,
        creator_name: "Test musician",
        like_count: 0,
        liked_by_me: false,
        publication_status: "published",
        composition: {
          bpm: project.bpm,
          key: project.key,
          instrument: project.instrument,
          notes: project.notes,
        },
      };
      return route.fulfill({ body: "null", contentType: "application/json" });
    }
    if (url.pathname.endsWith("/publication_details")) return route.fulfill({ json: publication });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 1660, height: 1000 });
  await page.goto(`/editor/${id}`);
  await expect(page.getByRole("textbox", { name: "Melody title", exact: true })).toHaveValue(
    "Test sketch",
  );
  const grid = page.locator(".roll-grid");
  const beatWidth = (await grid.boundingBox())!.width / 16;
  const rollWidth = await page
    .locator(".roll")
    .evaluate((element) => element.getBoundingClientRect().width);
  const containerWidth = await page
    .locator(".roll-scroll")
    .evaluate((element) => element.clientWidth);
  expect(Math.abs(rollWidth - containerWidth)).toBeLessThan(3);
  // Clicking just before the subdivision boundary must stay in that subdivision.
  await grid.click({ position: { x: beatWidth * 0.47, y: 11 * 24 + 10 } });
  const first = page.locator(".note").first();
  await expect(first).toHaveAttribute("aria-label", "Note 60, beat 1, duration 0.5");
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 8 + beatWidth * 2, box.y + 8 - 48, { steps: 5 });
  await page.mouse.up();
  await expect(first).toHaveAttribute("aria-label", "Note 62, beat 3, duration 0.5");
  const handle = (await first.locator(".note-handle").boundingBox())!;
  await page.mouse.move(handle.x + 3, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + 3 + beatWidth, handle.y + 5, { steps: 4 });
  await page.mouse.up();
  await expect(first).toHaveAttribute("aria-label", "Note 62, beat 3, duration 1.5");
  await page.getByRole("button", { name: "Play melody", exact: true }).click();
  const position = page.getByRole("slider", { name: "Playback position" });
  await expect(position).toBeVisible();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "Pause playback" }).click();
  await expect(page.getByRole("button", { name: "Resume playback" })).toBeVisible();
  const pausedAt = await position.inputValue();
  await page.waitForTimeout(250);
  await expect(position).toHaveValue(pausedAt);
  await position.fill("4");
  await expect(position).toHaveValue("4");
  await page.getByRole("button", { name: "Resume playback" }).click();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(4.1);
  await position.fill("2");
  await expect(page.getByRole("button", { name: "Pause playback" })).toBeVisible();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(2.1);
  expect(Number(await position.inputValue())).toBeLessThan(4);
  await page.getByRole("button", { name: "Stop playback" }).click();
  await expect(position).toHaveCount(0);
  await page.getByRole("combobox", { name: "Preset", exact: true }).selectOption("bass");
  await expect(page.getByRole("combobox", { name: "Preset", exact: true })).toHaveValue("bass");
  failSave = true;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".error")).toHaveText("Save unavailable");
  await expect(first).toBeVisible();
  failSave = false;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(project.notes[0]).toMatchObject({ pitch: 62, start: 2, duration: 1.5 });
  expect(project.instrument).toBe("bass");
  await grid.click({ position: { x: beatWidth * 6, y: 10 * 24 + 10 } });
  await page.getByRole("radio", { name: "Select", exact: true }).click();
  const gridBox = (await grid.boundingBox())!;
  await page.mouse.move(gridBox.x + beatWidth, gridBox.y + 8 * 24);
  await page.mouse.down();
  await page.mouse.move(gridBox.x + beatWidth * 7, gridBox.y + 12 * 24, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.note[aria-pressed="true"]')).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect(page.locator(".note")).toHaveCount(0);
  await page.getByRole("radio", { name: "Draw", exact: true }).click();
  await page.getByRole("combobox", { name: "Preset", exact: true }).selectOption("drums");
  await grid.click({ position: { x: 10, y: 2 * 96 + 10 } });
  await expect(page.locator(".note")).toHaveAttribute(
    "aria-label",
    "Note 36, beat 1, duration 0.5",
  );
  await page.getByRole("button", { name: "Play melody", exact: true }).click();
  await expect(position).toBeVisible();
  await page.getByRole("button", { name: "Stop playback" }).click();
  await page.getByRole("button", { name: /help/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(`/m/${id}`);
  expect(project.instrument).toBe("drums");
  await expect(page.getByRole("heading", { name: "Test sketch" })).toBeVisible();
  await page.getByRole("link", { name: "Edit draft" }).click();
  await expect(page.getByRole("button", { name: "Published", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Melody title", exact: true }).fill("Private revision");
  await expect(page.getByRole("button", { name: "Republish", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Unpublished changes");
  expect(publication).toMatchObject({ title: "Test sketch" });
});
