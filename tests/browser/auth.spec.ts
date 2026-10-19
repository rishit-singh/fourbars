import { test, expect } from "@playwright/test";
import { fixtureOrigin, fixtureProject, fixtureSession, user, projectId } from "./helpers";

test("auth forms clear values and confirmation resend respects cooldowns", async ({ page }) => {
  await page.clock.install();
  let resendRequests = 0;
  const callbacks: string[] = [];
  await page.route(`${fixtureOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/signup")) {
      callbacks.push(url.searchParams.get("redirect_to") ?? "");
      return route.fulfill({ json: { user, session: null } });
    }
    if (url.pathname.endsWith("/resend")) {
      resendRequests++;
      callbacks.push(url.searchParams.get("redirect_to") ?? "");
      return route.fulfill({
        status: 429,
        json: { code: "over_email_send_rate_limit", msg: "Email rate limit exceeded" },
      });
    }
    return route.fulfill({ json: null });
  });
  await page.goto("/login?next=%2Feditor%2Fnew");
  await page.getByLabel("Email", { exact: true }).fill("old@example.test");
  await page.getByLabel("Password", { exact: true }).fill("old-password");
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.getByLabel("Email", { exact: true }).fill("new@example.test");
  await page.getByLabel("Password", { exact: true }).fill("new-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: /Resend available in/ })).toBeDisabled();
  // Advance one timeout at a time: this verifies the UI countdown without real email delivery.
  await page.clock.runFor(61_000);
  await page.getByRole("button", { name: "Resend confirmation email", exact: true }).click();
  await expect(page.locator("#auth-error")).toContainText("Too many requests");
  await expect(page.getByRole("button", { name: /Resend available in/ })).toBeDisabled();
  expect(resendRequests).toBe(1);
  expect(callbacks).toEqual(["http://localhost:3001/login", "http://localhost:3001/login"]);
});

test("sign-in resumes creation and StrictMode creates only one project", async ({ page }) => {
  let creates = 0;
  await page.route(`${fixtureOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/token")) return route.fulfill({ json: fixtureSession() });
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: user });
    if (url.pathname.endsWith("/projects") && route.request().method() === "POST") {
      creates++;
      return route.fulfill({ json: { id: projectId } });
    }
    if (url.pathname.endsWith("/project_details")) return route.fulfill({ json: fixtureProject() });
    return route.fulfill({ json: null });
  });
  await page.goto("/login?next=%2Feditor%2Fnew");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`/editor/${projectId}`);
  await expect(page.getByLabel("Melody title")).toHaveValue("First sketch");
  expect(creates).toBe(1);
});
