import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Browser smoke test: logs in as every role and runs one bid-and-sell cycle.
 * Needs a fresh database (auction not started) and seed passwords already changed or
 * REQUIRE_PASSWORD_CHANGE=false. Run: E2E_BASE_URL=http://127.0.0.1:8000 npx playwright test
 */
const PW: Record<string, string> = {
  admin: process.env.ADMIN_PASSWORD ?? "cpl-admin",
  owner1: process.env.OWNER1_PASSWORD ?? "cpl-owner1",
  owner2: process.env.OWNER2_PASSWORD ?? "cpl-owner2",
  owner3: process.env.OWNER3_PASSWORD ?? "cpl-owner3",
};
const SHOTS = process.env.E2E_SHOTS;

async function signIn(browser: Browser, user: string, viewport = { width: 1400, height: 900 }): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/login");
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Password").fill(PW[user]);
  await page.getByRole("button", { name: "Enter the room" }).click();
  await expect(page).toHaveURL(/\/room/);
  return page;
}

test("admin and owners run one lot end to end", async ({ browser }) => {
  const admin = await signIn(browser, "admin");
  const o1 = await signIn(browser, "owner1", { width: 390, height: 844 });
  const o2 = await signIn(browser, "owner2");
  await signIn(browser, "owner3");

  await expect(admin.getByText("The room is open")).toBeVisible();
  if (SHOTS) await admin.screenshot({ path: `${SHOTS}/1-admin-idle.png` });

  await admin.getByRole("button", { name: "Start auction" }).click();
  await admin.getByRole("button", { name: "Next player" }).click();
  await expect(o1.getByRole("button", { name: /Bid 200/ })).toBeEnabled();

  await o1.getByRole("button", { name: /Bid 200/ }).click();
  await expect(o2.getByRole("button", { name: /Bid 220/ })).toBeEnabled();
  await expect(o1.getByText("You hold the high bid")).toBeVisible();
  if (SHOTS) await o1.screenshot({ path: `${SHOTS}/2-owner1-mobile.png` });

  await o2.getByRole("button", { name: /Bid 220/ }).click();
  await expect(admin.locator("text=Leading").first()).toBeVisible();
  if (SHOTS) await admin.screenshot({ path: `${SHOTS}/3-admin-live.png` });
  if (SHOTS) await o2.screenshot({ path: `${SHOTS}/4-owner2.png` });

  await admin.getByRole("button", { name: "Hammer now" }).click();
  await expect(o1.getByText("SOLD", { exact: true })).toBeVisible();
  if (SHOTS) await o1.screenshot({ path: `${SHOTS}/5-sold.png` });

  await o1.waitForTimeout(3500);
  await o1.goto("/teams");
  await expect(o1.getByText("780").first()).toBeVisible();
  if (SHOTS) await admin.goto("/admin/rules");
  if (SHOTS) await admin.screenshot({ path: `${SHOTS}/6-rules.png`, fullPage: true });
  if (SHOTS) await admin.goto("/players");
  if (SHOTS) await admin.screenshot({ path: `${SHOTS}/7-players.png` });
});
