import test from "node:test";
import assert from "node:assert/strict";
import {
  balance,
  countedExpense,
  visibleSadakah,
  sum,
  monthSummary,
  yearOverview,
  history,
  isAvailable,
  donationDays,
  shiftMonth,
  currentMonth,
  credentials,
} from "../src/domain.js";
const rows = [
  { id: 1, type: "income", amount: "1000", month: "2024-12" },
  { id: 2, type: "income", amount: 500, month: "2025-01" },
  {
    id: 3,
    type: "expense",
    amount: 100,
    month: "2025-01",
    is_display: null,
    is_calculation: null,
  },
  {
    id: 4,
    type: "expense",
    amount: 200,
    month: "2025-01",
    is_display: false,
    is_calculation: true,
  },
  {
    id: 5,
    type: "expense",
    amount: 50,
    month: "2025-01",
    is_display: true,
    is_calculation: false,
  },
  {
    id: 6,
    type: "expense",
    amount: 400,
    month: "2025-01",
    is_display: true,
    is_calculation: true,
  },
];
test("Sadakah preserves all four inverted display/calculation flag combinations", () => {
  assert.deepEqual(
    rows.filter(visibleSadakah).map((r) => r.id),
    [3, 4],
  );
  assert.deepEqual(
    rows.filter(countedExpense).map((r) => r.id),
    [3, 5],
  );
  assert.equal(sum(rows.filter(visibleSadakah)), 300);
  assert.equal(balance(rows), 1350);
});
test("monthly totals exclude dedicated/planned expenses and carry previous balance", () => {
  const month = monthSummary(rows, "2025-01");
  assert.equal(month.collection, 500);
  assert.equal(month.sadakah, 150);
  assert.equal(month.balance, 350);
  assert.equal(month.closing, 1350);
  assert.equal(monthSummary(rows, "2025-02").closing, 1350);
});
test("year overview carries balance from previous years into empty months", () => {
  const year = yearOverview(rows, 2025);
  assert.equal(year.length, 12);
  assert.equal(year[0].closing, 1350);
  assert.equal(year[11].closing, 1350);
  assert.deepEqual(
    history(rows).map((r) => r.month),
    ["2024-12", "2025-01"],
  );
});
test("100-day availability boundary uses Bangladesh calendar dates", () => {
  const donor = { available: true, last_donated: "2025-01-01" };
  assert.equal(donationDays(donor, new Date("2025-04-09T18:00:00Z")), 99);
  assert.equal(isAvailable(donor, new Date("2025-04-09T18:00:00Z")), false);
  assert.equal(isAvailable(donor, new Date("2025-04-10T18:00:00Z")), true);
  assert.equal(
    isAvailable({ ...donor, available: false }, new Date("2026-01-01")),
    false,
  );
  assert.equal(isAvailable({ available: true, last_donated: null }), true);
  assert.equal(
    isAvailable({ available: true, last_donated: "2099-01-01" }),
    false,
  );
});
test("month navigation crosses years and Bangladesh midnight correctly", () => {
  assert.equal(shiftMonth("2025-01", -1), "2024-12");
  assert.equal(shiftMonth("2025-12", 1), "2026-01");
  assert.equal(currentMonth(new Date("2025-12-31T18:00:00Z")), "2026-01");
});
test("authentication supports email and local/international phone numbers", () => {
  assert.deepEqual(credentials(" 01712-345678 "), { phone: "+8801712345678" });
  assert.deepEqual(credentials("+880 1712345678"), { phone: "+8801712345678" });
  assert.deepEqual(credentials("user@example.com"), {
    email: "user@example.com",
  });
});
