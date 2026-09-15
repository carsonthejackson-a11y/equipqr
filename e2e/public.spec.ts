import { test, expect } from "@playwright/test";

// Smoke tests for the app's public, no-login surface. These run against a
// production build (`next start`, via playwright.config.ts's webServer) and
// must never create data — no signups, no service requests submitted.

test.describe("public marketing + auth pages", () => {
  test("/ renders the landing page", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Scan the tag");
    // Buttons rendered over <Link> get role="button", so match by href + text.
    await expect(page.locator('a[href="/signup"]', { hasText: /start free trial/i }).first()).toBeVisible();
    await expect(page.locator('a[href="/login"]', { hasText: /log in/i }).first()).toBeVisible();
  });

  test("/pricing lists all three plans", async ({ page }) => {
    const response = await page.goto("/pricing");
    expect(response?.status()).toBe(200);
    for (const plan of ["Starter", "Pro", "Business"]) {
      await expect(page.getByRole("heading", { name: plan, exact: true }).first()).toBeVisible();
    }
    // exact: the compare table also renders "$79/mo" as a sub-label.
    await expect(page.getByText("$79", { exact: true })).toBeVisible();
  });

  test("/pricing?for=owners lists the three restaurant plans", async ({ page }) => {
    // Locks in the plan rename (docs/design/marketing-2026-09/BRIEF.md D4):
    // the `site` / `multi_site` plans display as Kitchen / Multi-kitchen.
    const response = await page.goto("/pricing?for=owners");
    expect(response?.status()).toBe(200);
    for (const plan of ["Free", "Kitchen", "Multi-kitchen"]) {
      await expect(page.getByRole("heading", { name: plan, exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("$24", { exact: true })).toBeVisible();
  });

  test("the header menu toggles on a phone-width viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const button = page.getByRole("button", { name: "Open menu" });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    // exact: the footer's "For restaurants" link would otherwise match too.
    await expect(page.getByRole("link", { name: "Restaurants", exact: true })).toBeVisible();
    await expect(page.locator('a[href="/login"]', { hasText: /log in/i }).last()).toBeVisible();
  });

  test("/restaurants renders the owner landing page", async ({ page }) => {
    const response = await page.goto("/restaurants");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Tag the kitchen");
  });

  test("/login renders the login form", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Access your company dashboard.")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("/signup renders the signup form", async ({ page }) => {
    const response = await page.goto("/signup");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Set up EquipQR for your service company.")).toBeVisible();
    await expect(page.getByLabel("Company name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });
});

test.describe("public QR scan page", () => {
  test("an unknown QR token shows a not-found state, not a 500", async ({ page }) => {
    const response = await page.goto("/e/not-a-real-token");
    // Next's App Router serves not-found content with a 404 status.
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });
});

test.describe("/api/health", () => {
  test("responds with a well-formed health payload", async ({ request }) => {
    const response = await request.get("/api/health");
    // Either is a legitimate outcome depending on whether this run can
    // actually reach Supabase — the important thing is the route itself
    // never 500s and always returns the documented shape.
    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(typeof body.ok).toBe("boolean");
    expect(typeof body.version).toBe("string");
    expect(typeof body.time).toBe("string");
    expect(["ok", "error"]).toContain(body.checks?.supabase);
  });

  test("reports checks.supabase: ok against a real Supabase project", async ({ request }) => {
    // CI builds and serves this app against a dummy Supabase project
    // (see .github/workflows/ci.yml) — the check can never succeed there.
    // Skip only that case; everywhere else (local dev, a real deploy) this
    // should hold.
    test.skip(!!process.env.CI, "CI runs against a dummy Supabase project with no real backend to check.");

    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.checks.supabase).toBe("ok");
  });
});
