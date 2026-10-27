import { test, expect } from "@playwright/test";
import { fixtureOrigin, fixtureProject, projectId, signInFixture, user } from "./helpers";

test("editor revisions reach a running loop without restarting the transport", async ({
  page,
  context,
}) => {
  await signInFixture(context);
  const project = fixtureProject();
  await page.route(`${fixtureOrigin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/user")) return route.fulfill({ json: user });
    if (path.endsWith("/project_details")) return route.fulfill({ json: project });
    return route.fulfill({ json: null });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/editor/${projectId}`);
  await expect(page.locator(".note")).toHaveCount(1);
  await page.getByRole("button", { name: "Loop", exact: true }).click();
  await page.getByRole("button", { name: "Play melody", exact: true }).click();
  const position = page.getByRole("slider", { name: "Playback position" });
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(0.3);
  const before = Number(await position.inputValue());

  // Removing the last note must leave the transport running, ready for another edit.
  await page.locator(".note").click({ button: "right" });
  await expect(page.locator(".note")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pause playback" })).toBeVisible();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Pause playback" }).click();
  await page.getByRole("button", { name: "Resume playback" }).click();
  await expect(page.getByRole("button", { name: "Pause playback" })).toBeVisible();

  const grid = page.locator(".roll-grid");
  const width = (await grid.boundingBox())!.width;
  await page.getByRole("combobox", { name: "Snap", exact: true }).selectOption("1");
  await grid.click({ position: { x: (width * 10) / 16 + 2, y: 11 * 24 + 10 } });
  await expect(page.locator(".note")).toHaveCount(1);
  // A matching playhead proves the engine's source now includes the edited notes.
  await expect(page.locator(".roll-playhead")).toBeVisible();
  await expect
    .poll(() => page.locator(".roll-sounding-note").count(), { timeout: 10_000, intervals: [50] })
    .toBeGreaterThan(0);
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(7);
  await expect.poll(async () => Number(await position.inputValue())).toBeLessThan(2);
  await expect(page.getByRole("button", { name: "Loop", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Stop playback" }).click();
  await expect(position).toHaveValue("0");
  expect(errors).toEqual([]);
});
