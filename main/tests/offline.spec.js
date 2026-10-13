import { test, expect } from "@playwright/test";
test("production PWA retires legacy caches and reloads the fund and blood sections offline", async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-11T06:00:00Z"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://kszhmrhlsoqfxkcopvoe.supabase.co/**", (route) =>
    route.fulfill({ status: 403, json: { message: "Test offline data" } }),
  );
  await page.addInitScript(() => {
    if (!localStorage.getItem("donorsData")) {
      localStorage.setItem(
        "donorsData",
        JSON.stringify([
          {
            id: 1,
            name: "Cached donor",
            phone: "01712345678",
            location: "Dhaka",
            blood_group: "A+",
            available: true,
            last_donated: null,
            user_id: null,
          },
        ]),
      );
      localStorage.setItem(
        "allFundData",
        JSON.stringify([
          {
            id: 1,
            month: "2026-10",
            type: "income",
            amount: 500,
            name: "Cached collection",
          },
          {
            id: 2,
            month: "2026-10",
            type: "expense",
            amount: 44,
            description: "Cached Sadakah",
            is_calculation: null,
            is_display: null,
          },
        ]),
      );
      caches.open("eor-v10-static");
      caches.open("eor-react-v1");
    }
  });
  await page.goto("/");
  await expect
    .poll(
      () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      { timeout: 15000 },
    )
    .toBe(true);
  const names = await page.evaluate(() => caches.keys());
  expect(names.some((name) => name.startsWith("eor-react-"))).toBe(true);
  expect(names).not.toContain("eor-v10-static");
  expect(names).not.toContain("eor-react-v1");
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Blood Donors" }),
  ).toBeVisible();
  await expect(page.locator(".donor-card")).toContainText("Cached donor");
  await page.getByRole("button", { name: "Fund History", exact: true }).click();
  await expect(page.locator(".balance-stat")).toContainText("44");
  await expect(page.locator(".main-content")).toContainText("Cached Sadakah");
  await page
    .locator(".fund-tabs")
    .getByRole("button", { name: /Collection/ })
    .click();
  await expect(page.locator(".ledger-grid")).toContainText("Cached collection");
  await expect
    .poll(() =>
      page
        .locator("nav img")
        .evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Complete history", exact: true })
    .click();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(
    page.getByText("History image copied.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return items.some((item) => item.types.includes("image/png"));
    }),
  ).toBe(true);
  expect(errors).toEqual([]);
});
