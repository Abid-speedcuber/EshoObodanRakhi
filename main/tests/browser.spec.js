import { test, expect } from "@playwright/test";
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
async function setup(page, role = null, fail = false) {
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
    { role, account, funds, donors },
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
      if (url.pathname.endsWith("/fund")) return route.fulfill({ json: funds });
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
  return { writes, errors };
}
test("public directory filters availability, group, and search without unrelated features", async ({
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
  await expect(page.locator(".donor-card")).toContainText("Not available");
  await page.getByLabel("Available only").check();
  await expect(
    page.getByText("No donors found. Try another group or location."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("textbox", { name: "Search donors" }).fill("Dhaka");
  await expect(page.locator(".donor-card")).toHaveCount(2);
  await expect(page.locator("nav")).not.toContainText(
    /Notes|Messages|Notifications|Student|Moderator/,
  );
  await page.screenshot({ path: "/tmp/eor-blood-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("fund totals, inverted flags, linked details, chart, and history", async ({
  page,
}) => {
  const { errors } = await setup(page);
  await page
    .getByRole("button", { name: "Community fund", exact: true })
    .click();
  await expect(page.locator(".balance-stat")).toContainText("1,350");
  await expect(page.locator(".ledger-grid")).toContainText(
    "Operating expenses",
  );
  await expect(page.locator(".ledger-grid")).not.toContainText(
    "Dedicated fundraiser",
  );
  await expect(page.locator(".ledger-grid")).not.toContainText(
    "Future project",
  );
  await expect(
    page.getByRole("link", { name: "https://example.com/receipts" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await page.getByRole("button", { name: "All Sadakah", exact: true }).click();
  await expect(page.locator(".panel")).toContainText("Dedicated fundraiser");
  await expect(page.locator(".panel")).not.toContainText("Operating expenses");
  await page.getByRole("button", { name: "Yearly overview" }).click();
  await expect(page.locator("dialog table tbody tr")).toHaveCount(12);
  await expect(page.locator("dialog table tbody tr").last()).toContainText(
    "1,350",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Complete history" }).click();
  await expect(page.locator(".history-opening")).toContainText("1,000");
  await expect(page.locator(".history-month")).toHaveCount(1);
  await page.getByRole("button", { name: "Elaborate", exact: true }).click();
  await expect(page.locator(".history-month")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Monthly collection" }).click();
  await page.screenshot({ path: "/tmp/eor-fund-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("user manages only their own donor profile, including clearing last donation", async ({
  page,
}) => {
  const { writes, errors } = await setup(page, "user");
  await expect(
    page.getByRole("button", { name: "My donor profile" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Edit donor", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "My donor profile" }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.getByLabel("Has donated before").check();
  await page.getByLabel("Last donation date").fill("2026-09-10");
  await page.getByLabel("Has donated before").uncheck();
  await page.getByRole("button", { name: "Save profile" }).click();
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
    page.getByRole("button", { name: "Manage access" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Community fund", exact: true })
    .click();
  await expect(page.locator(".ledger-grid")).toContainText("Future project");
  await page
    .locator(".month-toolbar")
    .getByRole("button", { name: "Sadakah", exact: true })
    .click();
  await page.getByLabel("Sadakah title").fill("Test charity");
  await page.getByLabel("Amount (৳)", { exact: true }).fill("275.50");
  await page.getByText("Advanced options", { exact: true }).click();
  await page.getByLabel("Show in public Sadakah history").uncheck();
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  const write = writes.find((w) => w.path.endsWith("/fund"));
  expect(write.body).toMatchObject({
    is_display: true,
    is_calculation: false,
    amount: 275.5,
    updated_by: adminId,
  });
  await page.getByRole("button", { name: "Manage access" }).click();
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
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email or phone number").fill("01712-345678");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page
    .locator("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
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
  await page.getByRole("button", { name: "বাংলা", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "রক্তদাতা খুঁজুন" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ফান্ড", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "আমাদের ফান্ড" }),
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
  await page
    .getByRole("button", { name: "Community fund", exact: true })
    .click();
  await expect(page.locator(".balance-stat")).toContainText("1,002");
});

test("rejected writes keep the editor open and show the server error", async ({
  page,
}) => {
  await setup(page, "admin");
  await page
    .getByRole("button", { name: "Community fund", exact: true })
    .click();
  await page
    .locator(".month-toolbar")
    .getByRole("button", { name: "Collection", exact: true })
    .click();
  await page.getByLabel("Contributor name").fill("Test contributor");
  await page.getByLabel("Amount (৳)", { exact: true }).fill("50");
  await page.route("**/rest/v1/fund?**", (route) =>
    route.fulfill({
      status: 403,
      json: { message: "Access denied by database policy" },
    }),
  );
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator(".form-error")).toContainText(
    "Access denied by database policy",
  );
  await expect(page.locator(".status")).toHaveCount(0);
});
