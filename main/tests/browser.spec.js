import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const month = "2026-10";
const adminId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const funds = [
  {
    id: 1,
    month: "2025-12",
    type: "income",
    name: "Earlier collection",
    amount: 1000,
    timestamp: "2025-12-01T00:00:00Z",
  },
  {
    id: 2,
    month,
    type: "income",
    name: "Abdullah",
    amount: 500,
    timestamp: "2026-10-01T00:00:00Z",
  },
  {
    id: 3,
    month,
    type: "expense",
    description: "Food for families",
    amount: 100,
    is_display: null,
    is_calculation: null,
    additional_info: "Distribution details\nhttps://example.com/receipts",
    timestamp: "2026-10-02T00:00:00Z",
  },
  {
    id: 4,
    month,
    type: "expense",
    description: "Dedicated fundraiser",
    amount: 200,
    is_display: false,
    is_calculation: true,
    timestamp: "2026-10-03T00:00:00Z",
  },
  {
    id: 5,
    month,
    type: "expense",
    description: "Operating expenses",
    amount: 50,
    is_display: true,
    is_calculation: false,
    timestamp: "2026-10-03T00:00:00Z",
  },
  {
    id: 6,
    month,
    type: "expense",
    description: "Future project",
    amount: 400,
    is_display: true,
    is_calculation: true,
    timestamp: "2026-10-03T00:00:00Z",
  },
];
const donors = [
  {
    id: 1,
    user_id: userId,
    name: "Hasan Ahmed",
    phone: "01712345678",
    location: "Dhaka",
    blood_group: "A+",
    available: true,
    last_donated: null,
    created_by_admin: false,
  },
  {
    id: 2,
    user_id: null,
    name: "Rafiq Islam",
    phone: "01812345678",
    location: "Chattogram",
    blood_group: "B+",
    available: true,
    last_donated: "2026-10-01",
    created_by_admin: true,
  },
  {
    id: 3,
    user_id: null,
    name: "Karim",
    phone: "01912345678",
    location: "Dhaka",
    blood_group: "O-",
    available: false,
    last_donated: null,
    created_by_admin: true,
  },
];
async function setup(page, role = null, fail = false, fundRecords = funds) {
  const writes = [];
  await page.clock.setFixedTime(new Date("2026-10-11T06:00:00Z"));
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  const id = role === "admin" ? adminId : userId;
  const account = {
    id,
    email: role === "admin" ? "admin@example.com" : "user@example.com",
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { name: "Test account" },
  };
  await page.addInitScript(
    ({ role, account, funds, donors }) => {
      localStorage.clear();
      if (role)
        localStorage.setItem(
          "sb-kszhmrhlsoqfxkcopvoe-auth-token",
          JSON.stringify({
            access_token: "test-token",
            refresh_token: "test-refresh",
            expires_at: 2147483647,
            expires_in: 3600,
            token_type: "bearer",
            user: account,
          }),
        );
      localStorage.setItem("eor:fund", JSON.stringify(funds));
      localStorage.setItem("eor:donors", JSON.stringify(donors));
    },
    { role, account, funds: fundRecords, donors },
  );
  await page.route(
    "https://kszhmrhlsoqfxkcopvoe.supabase.co/**",
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (fail)
        return route.fulfill({
          status: 403,
          json: { message: "Test connection unavailable" },
        });
      if (request.method() !== "GET") {
        writes.push({
          method: request.method(),
          path: url.pathname,
          body: request.postDataJSON(),
        });
        if (url.pathname.endsWith("/token"))
          return route.fulfill({
            json: {
              access_token: "test-token",
              refresh_token: "test-refresh",
              expires_at: 2147483647,
              expires_in: 3600,
              token_type: "bearer",
              user: account,
            },
          });
        return route.fulfill({
          status: 200,
          json: {
            id: url.pathname.endsWith("/users") ? userId : 1,
            role: request.postDataJSON()?.role,
          },
        });
      }
      if (url.pathname.endsWith("/fund"))
        return route.fulfill({ json: fundRecords });
      if (url.pathname.endsWith("/donors"))
        return route.fulfill({ json: donors });
      if (url.pathname.endsWith("/users")) {
        const profiles = [
          {
            id: adminId,
            name: "Test admin",
            email: "admin@example.com",
            role: "admin",
          },
          {
            id: userId,
            name: "Test user",
            email: "user@example.com",
            role: "user",
          },
        ];
        return route.fulfill({
          json: url.searchParams.has("id")
            ? profiles.filter((p) => p.id === id)
            : profiles,
        });
      }
      if (url.pathname.endsWith("/user"))
        return route.fulfill({ json: account });
      return route.fulfill({ json: [] });
    },
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
  await expect(page.locator(".site-header")).toHaveCSS("position", "sticky");
  return { writes, errors };
}
test("public directory retains the original search toggle and group filter without unrelated features", async ({
  page,
}) => {
  const { errors } = await setup(page);
  await expect(page.locator(".donor-card")).toHaveCount(3);
  await expect(page.locator(".donor-card").first()).toContainText(
    "Hasan Ahmed",
  );
  await page
    .getByRole("combobox", { name: "Blood group", exact: true })
    .selectOption("B+");
  await expect(page.locator(".donor-card")).toHaveCount(1);
  await expect(page.locator(".donor-card")).toContainText("not available");
  await expect(
    page.getByRole("textbox", { name: "Search donors" }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Blood group", exact: true })
    .selectOption("all");
  await page.getByRole("button", { name: "Search donors" }).click();
  await page.getByRole("textbox", { name: "Search donors" }).fill("Dhaka");
  await expect(page.locator(".donor-card")).toHaveCount(2);
  await expect(page.locator("nav")).not.toContainText(
    /Notes|Messages|Notifications|Student|Moderator/,
  );
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.screenshot({ path: "/tmp/eor-blood-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("fund totals, inverted flags, linked details, chart, and history", async ({
  page,
}) => {
  const { errors } = await setup(page);
  await page.getByRole("button", { name: "Fund History", exact: true }).click();
  await expect(page.locator(".balance-stat")).toContainText("850");
  await expect(page.locator(".main-content")).toContainText(
    "All Sadakah History",
  );
  await page
    .locator(".fund-tabs")
    .getByRole("button", { name: /Collection/ })
    .click();
  await expect(page.locator(".ledger-grid")).toContainText(
    "Operating expenses",
  );
  await expect(page.locator(".ledger-grid")).not.toContainText(
    "Dedicated fundraiser",
  );
  await expect(page.locator(".ledger-grid")).not.toContainText(
    "Future project",
  );
  await page
    .locator(".fund-tabs")
    .getByRole("button", { name: /Sadakah/ })
    .click();
  await expect(page.locator(".main-content")).toContainText(
    "Dedicated fundraiser",
  );
  await expect(page.locator(".main-content")).not.toContainText(
    "Operating expenses",
  );
  await expect(
    page.getByRole("link", { name: "https://example.com/receipts" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await page
    .locator(".fund-tabs")
    .getByRole("button", { name: /Collection/ })
    .click();
  await page.getByRole("button", { name: "Yearly overview" }).click();
  await expect(page.locator("dialog .chart polyline")).toHaveCount(3);
  await page.getByRole("button", { name: /December 2026 Total Fund/ }).click();
  await expect(page.locator("dialog .chart")).toContainText("850");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Complete history" }).click();
  await expect(page.locator(".history-opening")).toContainText("1,000");
  await expect(page.locator(".history-month")).toHaveCount(1);
  await page.getByRole("button", { name: "Yearly Brief", exact: true }).click();
  await expect(page.locator(".history-month")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/eor-fund-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("user manages only their own donor profile, including clearing last donation", async ({
  page,
}) => {
  const { writes, errors } = await setup(page, "user");
  await expect(page.getByRole("button", { name: "My Profile" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Edit donor", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "My Profile" }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.getByLabel("Has donated before").check();
  await page.getByLabel("Last donation date").fill("2026-09-10");
  await page.getByLabel("Has donated before").uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(writes.find((w) => w.path.endsWith("/donors")).body.last_donated).toBe(
    null,
  );
  expect(writes.find((w) => w.path.endsWith("/donors")).method).toBe("PATCH");
  expect(errors).toEqual([]);
});
test("admin edits full fund flags and confirms role changes", async ({
  page,
}) => {
  const { writes, errors } = await setup(page, "admin");
  await expect(
    page.getByRole("button", { name: "Admin", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fund History", exact: true }).click();
  await expect(page.locator(".ledger-grid")).toContainText("Future project");
  await page
    .locator(".month-toolbar")
    .getByRole("button", { name: "+ Sadakah", exact: true })
    .click();
  await page.getByLabel("Sadakah title").fill("Test charity");
  const amount = page.getByLabel("Amount (৳)", { exact: true });
  await amount.fill("২7৫.৫০");
  await expect(amount).toHaveValue("275.50");
  await amount.fill("০");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.locator(".form-error")).toContainText(
    "Enter a positive amount",
  );
  expect(writes.filter((w) => w.path.endsWith("/fund"))).toHaveLength(0);
  await amount.fill("২৭৫.৫০");
  await expect(amount).toHaveValue("275.50");
  await page.getByText("Advanced options", { exact: true }).click();
  await page.getByLabel("Show in Sadakah Tab").uncheck();
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  const write = writes.find((w) => w.path.endsWith("/fund"));
  expect(write.body).toMatchObject({
    is_display: true,
    is_calculation: false,
    amount: 275.5,
    updated_by: adminId,
  });
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("button", { name: "👥 Users" }).click();
  await page
    .getByRole("combobox", { name: "Role for Test user" })
    .selectOption("admin");
  await expect(page.locator(".role-confirm")).toContainText("full control");
  expect(writes.filter((w) => w.path.endsWith("/users"))).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm role change" }).click();
  await expect(page.locator(".role-confirm")).toHaveCount(0);
  expect(writes.find((w) => w.path.endsWith("/users")).body).toEqual({
    role: "admin",
  });
  await expect(page.locator("dialog")).not.toContainText(/Student|Moderator/);
  expect(errors).toEqual([]);
});
test("phone password login normalizes Bangladesh number", async ({ page }) => {
  const { writes, errors } = await setup(page);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByLabel("Email or phone number").fill("01712-345678");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page
    .locator("dialog")
    .getByRole("button", { name: "Login", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(writes.find((w) => w.path.endsWith("/token")).body.phone).toBe(
    "+8801712345678",
  );
  expect(errors).toEqual([]);
});
test("failed refresh explicitly displays cached public data", async ({
  page,
}) => {
  await setup(page, null, true);
  await expect(page.getByText(/Unable to refresh/)).toBeVisible();
  await expect(page.locator(".donor-card")).toHaveCount(3);
});
test("mobile layout, Bengali, and dialog keyboard navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await setup(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Enable", { exact: true }).check();
  await page.getByRole("button", { name: "বন্ধ করুন", exact: true }).click();
  await expect(page.getByRole("heading", { name: "রক্তদাতা" })).toBeVisible();
  await page.getByRole("button", { name: "ফান্ডের তথ্য", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "সব সাদাকাহ তথ্য" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/eor-fund-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "সম্পূর্ণ তথ্য" }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("long fund histories paginate beyond the first thousand records", async ({
  page,
}) => {
  await setup(page);
  const records = Array.from({ length: 1002 }, (_, i) => ({
    id: i + 1,
    type: "income",
    month: "2025-01",
    amount: 1,
    name: `Contributor ${i + 1}`,
    timestamp: "2025-01-01T00:00:00Z",
  }));
  await page.route("**/rest/v1/fund?**", (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 1000);
    const data = records.slice(offset, offset + limit);
    return route.fulfill({
      status: 206,
      headers: {
        "content-range": `${offset}-${offset + data.length - 1}/${records.length}`,
      },
      json: data,
    });
  });
  await page.getByRole("button", { name: "Refresh data" }).click();
  await page.getByRole("button", { name: "Fund History", exact: true }).click();
  await expect(page.locator(".balance-stat")).toContainText("1,002");
});

test("rejected writes keep the editor open and show the server error", async ({
  page,
}) => {
  await setup(page, "admin");
  await page.getByRole("button", { name: "Fund History", exact: true }).click();
  await page
    .locator(".month-toolbar")
    .getByRole("button", { name: "+ Collection", exact: true })
    .click();
  await page.getByLabel("Contributor name").fill("Test contributor");
  await page.getByLabel("Amount (৳)", { exact: true }).fill("50");
  await page.route("**/rest/v1/fund?**", (route) =>
    route.fulfill({
      status: 403,
      json: { message: "Access denied by database policy" },
    }),
  );
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator(".form-error")).toContainText(
    "Access denied by database policy",
  );
  await expect(page.locator(".status")).toHaveCount(0);
});

test("collection accepts Bangla keyboard input and submits an English numeric amount", async ({
  page,
}) => {
  const { writes, errors } = await setup(page, "admin");
  await page.getByRole("button", { name: "Fund History", exact: true }).click();
  await page
    .locator(".month-toolbar")
    .getByRole("button", { name: "+ Collection", exact: true })
    .click();
  await page.getByLabel("Contributor name").fill("রনি");
  const amount = page.getByLabel("Amount (৳)", { exact: true });
  await expect(amount).toHaveAttribute("type", "text");
  await amount.focus();
  await page.keyboard.insertText("১০০");
  await expect(amount).toHaveValue("100");
  expect(await amount.evaluate((input) => input.validity.valid)).toBe(true);
  await page.screenshot({ path: "/tmp/eor-bangla-collection.png" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(writes.find((w) => w.path.endsWith("/fund")).body).toMatchObject({
    name: "রনি",
    amount: 100,
    type: "income",
  });
  expect(errors).toEqual([]);
});

test("dedicated collection and donation stay paired in monthly view and history", async ({
  page,
}) => {
  const campaign = {
    id: 7,
    month,
    type: "income",
    name: "বন্যা সহায়তা",
    amount: 200,
    is_dedicated: true,
    dedicated_donation: 275,
    timestamp: "2026-10-04T00:00:00Z",
  };
  const { writes, errors } = await setup(page, "admin", false, [
    ...funds,
    campaign,
  ]);
  await page.getByRole("button", { name: "Fund History", exact: true }).click();
  await expect(page.locator(".balance-stat")).toContainText("775");
  await expect(page.locator(".ledger-grid>.panel").nth(1)).toContainText(
    "Sadakah",
  );
  await expect(page.locator(".ledger-grid>.panel").nth(2)).toHaveClass(
    /dedicated-panel/,
  );
  await expect(page.locator(".dedicated-panel")).toContainText("বন্যা সহায়তা");
  await expect(page.locator(".dedicated-panel")).toContainText("75");
  await expect(page.locator(".ledger-grid>.panel").first()).not.toContainText(
    "বন্যা সহায়তা",
  );
  await expect(page.locator(".month-summary")).toContainText("-225");
  await page
    .getByRole("button", { name: "Edit dedicated collection", exact: true })
    .click();
  await expect(
    page.getByLabel("Dedicated collection", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Donation on this collection (৳)", { exact: true }),
  ).toHaveValue("275");
  await page.getByLabel("Amount (৳)", { exact: true }).fill("২২০");
  await page
    .getByLabel("Donation on this collection (৳)", { exact: true })
    .fill("৩০০");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(writes.find((w) => w.path.endsWith("/fund")).body).toMatchObject({
    is_dedicated: true,
    amount: 220,
    dedicated_donation: 300,
  });
  await page
    .getByRole("button", { name: "Complete history", exact: true })
    .click();
  const october = page
    .locator(".history-month")
    .filter({ has: page.getByRole("heading", { name: "October 2026" }) });
  await expect(october.locator(".history-collection")).toHaveCount(0);
  await expect(october.locator(".dedicated-entry")).toHaveCount(1);
  await expect(october.locator(".history-closing")).toContainText("775");
  expect(
    await october.evaluate((el) =>
      el.children[1].classList.contains("dedicated-entry"),
    ),
  ).toBe(true);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(
    page.getByText("History image copied.", { exact: true }),
  ).toBeVisible();
  const copied = await clipboardPng(page);
  expect(copied.width).toBe(960);
  expect(copied.height).toBeGreaterThan(300);
  await writeFile(
    "/tmp/eor-history-png.png",
    Buffer.from(copied.base64, "base64"),
  );
  await page.getByRole("button", { name: "Yearly Brief", exact: true }).click();
  const december = page
    .locator(".history-month")
    .filter({ has: page.getByRole("heading", { name: "December 2025" }) });
  await expect(december.locator(".history-collection")).toContainText("1,000");
  await page.screenshot({ path: "/tmp/eor-dedicated-history.png" });
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "/tmp/eor-dedicated-monthly.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Delete dedicated collection", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  expect(writes.filter((w) => w.path.endsWith("/fund")).at(-1).method).toBe(
    "DELETE",
  );
  expect(errors).toEqual([]);
});
test("new dedicated collection supports Bangla amounts and regular conversion clears paired donation", async ({
  page,
}) => {
  const { writes } = await setup(page, "admin");
  await page.getByRole("button", { name: "Fund History", exact: true }).click();
  await page
    .locator(".month-toolbar")
    .getByRole("button", { name: "+ Collection", exact: true })
    .click();
  await expect(page.getByLabel("Donation on this collection (৳)")).toHaveCount(
    0,
  );
  await page.getByLabel("Contributor name").fill("শীতবস্ত্র");
  await page.getByLabel("Dedicated collection", { exact: true }).check();
  await page.getByLabel("Amount (৳)", { exact: true }).fill("১০০০");
  await page
    .getByLabel("Donation on this collection (৳)", { exact: true })
    .fill("১৩০০");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  expect(writes.find((w) => w.path.endsWith("/fund")).body).toMatchObject({
    name: "শীতবস্ত্র",
    is_dedicated: true,
    amount: 1000,
    dedicated_donation: 1300,
  });
  await page
    .locator(".month-toolbar")
    .getByRole("button", { name: "+ Collection", exact: true })
    .click();
  await page.getByLabel("Contributor name").fill("Regular donor");
  await page.getByLabel("Amount (৳)", { exact: true }).fill("৫০০");
  await page.getByLabel("Dedicated collection", { exact: true }).check();
  await page
    .getByLabel("Donation on this collection (৳)", { exact: true })
    .fill("৭০০");
  await page.getByLabel("Dedicated collection", { exact: true }).uncheck();
  await expect(page.getByLabel("Donation on this collection (৳)")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Add", exact: true }).click();
  expect(
    writes.filter((w) => w.path.endsWith("/fund")).at(-1).body,
  ).toMatchObject({
    is_dedicated: false,
    dedicated_donation: null,
    amount: 500,
  });
});

test("month rollover releases held collections and history puts closed-month collections last", async ({
  page,
}) => {
  await setup(page, "admin");
  await page.getByRole("button", { name: "Fund History", exact: true }).click();
  await expect(page.locator(".balance-stat")).toContainText("850");
  await page.clock.setFixedTime(new Date("2026-10-31T17:59:59Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".balance-stat")).toContainText("850");
  await page.clock.setFixedTime(new Date("2026-10-31T18:00:00Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".balance-stat")).toContainText("1,350");
  await page
    .getByRole("button", { name: "Complete history", exact: true })
    .click();
  const october = page
    .locator(".history-month")
    .filter({ has: page.getByRole("heading", { name: "October 2026" }) });
  await expect(october.locator(".history-collection")).toContainText("500");
  expect(
    await october.evaluate((el) => {
      const collection = el.querySelector(".history-collection");
      const expenses = [...el.children].filter(
        (child) =>
          child.textContent.includes("Food for families") ||
          child.textContent.includes("Operating expenses"),
      );
      return expenses.every((expense) =>
        Boolean(
          expense.compareDocumentPosition(collection) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      );
    }),
  ).toBe(true);
  await expect(october.locator(".history-closing")).toContainText("1,350");
});

async function clipboardPng(page) {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find((item) => item.types.includes("image/png"));
    if (!item) throw new Error("Clipboard did not contain a PNG");
    const blob = await item.getType("image/png");
    const bitmap = await createImageBitmap(blob);
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const result = { width: bitmap.width, height: bitmap.height, base64 };
    bitmap.close();
    return result;
  });
}

test("PNG copy includes the full current year on a phone even in elaborate mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const entries = [
    {
      id: 1,
      month: "2025-12",
      type: "income",
      name: "Previous year",
      amount: 1000,
    },
    ...Array.from({ length: 10 }, (_, i) => [
      {
        id: 10 + i * 20,
        month: `2026-${String(i + 1).padStart(2, "0")}`,
        type: "income",
        name: `Collection ${i + 1}`,
        amount: 100,
      },
      ...Array.from({ length: 8 }, (_, j) => ({
        id: 11 + i * 20 + j,
        month: `2026-${String(i + 1).padStart(2, "0")}`,
        type: "expense",
        description: `Month ${i + 1} donation ${j + 1} — সহায়তার জন্য অনুদান`,
        amount: 1,
      })),
    ]).flat(),
  ];
  await setup(page, "admin", false, entries);
  await page.evaluate(() => {
    localStorage.setItem("lang", "bn");
    const observer = new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (
            node instanceof Element &&
            node.classList.contains("history-image-host")
          ) {
            window.__historyExport = {
              text: node.textContent,
              months: [...node.querySelectorAll(".history-month")].map(
                (month) => month.dataset.month,
              ),
            };
          }
    });
    observer.observe(document.body, { childList: true });
  });
  // Use the existing settings flow so all exported labels are Bengali.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Enable", { exact: true }).check();
  await page.getByRole("button", { name: "বন্ধ করুন", exact: true }).click();
  await page
    .getByRole("button", { name: "সম্পূর্ণ তথ্য", exact: true })
    .click();
  await page.getByRole("button", { name: "সংক্ষিপ্ত", exact: true }).click();
  await expect(page.locator("dialog .history-month")).toHaveCount(11);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "কপি", exact: true }).click();
  await expect(
    page.getByText("হিস্টরির ছবি কপি হয়েছে।", { exact: true }),
  ).toBeVisible();
  const copied = await clipboardPng(page);
  expect(copied.width).toBe(960);
  expect(copied.height).toBeGreaterThan(844 * 2);
  const exported = await page.evaluate(() => window.__historyExport);
  expect(exported.months).toHaveLength(10);
  expect(exported.months.every((month) => month.startsWith("2026-"))).toBe(
    true,
  );
  expect(exported.text).toContain("জানুয়ারি মাসে মোট কালেকশন");
  expect(exported.text).toContain("ফান্ডে বর্তমান ব্যাল্যান্স");
  expect(exported.text).toContain("Month 10 donation 8");
  expect(exported.text).not.toContain("২০২৫");
  expect(exported.text).not.toContain("অক্টোবর মাসে মোট কালেকশন");
  await writeFile(
    "/tmp/eor-history-full-year.png",
    Buffer.from(copied.base64, "base64"),
  );
  await expect(page.locator(".history-image-host")).toHaveCount(0);
});

test("blocked image clipboard downloads a PNG rather than copying text", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Complete history", exact: true })
    .click();
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "write", {
      configurable: true,
      value: () =>
        Promise.reject(new DOMException("Blocked", "NotAllowedError")),
    }),
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("eor-fund-history-2026.png");
  await download.saveAs("/tmp/eor-history-fallback.png");
  await expect(
    page.getByText("Image copying was blocked. PNG downloaded instead.", {
      exact: true,
    }),
  ).toBeVisible();
});
