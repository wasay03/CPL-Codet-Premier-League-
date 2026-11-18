import { expect, test, type Browser } from "@playwright/test";

/**
 * Polling mode (hosts without WebSockets, e.g. Vercel). Opt-in: needs a backend whose lot timers
 * never fire, fresh data, opening/reset timers of ~6 s, and `vite preview` (it proxies only /api).
 * Run: E2E_POLLING=1 E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/polling.spec.ts
 */
test.skip(!process.env.E2E_POLLING, "set E2E_POLLING=1 to run the polling-mode test");

const PW: Record<string, string> = { admin: "cpl-admin", owner1: "cpl-owner1", owner2: "cpl-owner2" };
async function signIn(browser: Browser, user: string) {
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/login");
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Password").fill(PW[user]);
  await page.getByRole("button", { name: "Enter the room" }).click();
  await expect(page).toHaveURL(/\/room/);
  return page;
}

test("polling mode: live updates and lots close without a server timer", async ({ browser }) => {
  const admin = await signIn(browser, "admin");
  const o1 = await signIn(browser, "owner1");
  const o2 = await signIn(browser, "owner2");
  await expect(o1.getByText("The room is open")).toBeVisible();

  await admin.getByRole("button", { name: "Start auction" }).click();
  await admin.getByRole("button", { name: "Next player" }).click();
  await expect(o1.getByRole("button", { name: /Bid 200/ })).toBeEnabled();
  await o1.getByRole("button", { name: /Bid 200/ }).click();
  await expect(o2.getByRole("button", { name: /Bid 220/ })).toBeEnabled();
  await o2.getByRole("button", { name: /Bid 220/ }).click();
  await expect(o1.getByRole("button", { name: /Bid 240/ })).toBeEnabled();

  // Nobody hammers: the clock runs out and the next poll closes the lot.
  await expect(o1.getByText("SOLD", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(o1.getByText(/to Team Two for/)).toBeVisible();

  await admin.waitForTimeout(3200);
  await admin.getByRole("button", { name: "Next player" }).click();
  await expect(o2.getByText("UNSOLD", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(o2.getByText("Drops to Diamond", { exact: true })).toBeVisible();

  await o2.waitForTimeout(3200);
  await o2.getByRole("button", { name: "Live feed" }).click();
  await expect(o2.getByText(/SOLD to Team Two for 220/)).toBeVisible();
  await expect(o2.getByText("Auction running")).toBeVisible();
});
