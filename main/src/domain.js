export const GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
export const MIN_MONTH = "2017-06";
// Explicit parts avoid locale-dependent separators in month keys.
export function currentMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
}
export function currentDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export const sum = (rows) =>
  rows.reduce((total, row) => total + Number(row.amount || 0), 0);
export const countedExpense = (row) =>
  row.type === "expense" && !row.is_calculation;
export const visibleSadakah = (row) =>
  row.type === "expense" && !row.is_display;
export const isDedicated = (row) =>
  row.type === "income" && row.is_dedicated === true;
export const regularIncome = (row) =>
  row.type === "income" && !isDedicated(row);
export const dedicatedContribution = (row) =>
  isDedicated(row)
    ? Math.max(0, Number(row.dedicated_donation || 0) - Number(row.amount || 0))
    : 0;
export const dedicatedTotal = (rows) =>
  rows.reduce((total, row) => total + dedicatedContribution(row), 0);
// Regular collections are released only when their Bangladesh calendar month closes.
// Dedicated collections stay separate; only their donation shortfall uses the fund.
export function balance(rows, asOfMonth = currentMonth()) {
  const active = rows.filter((row) => row.month <= asOfMonth);
  return (
    sum(active.filter((row) => regularIncome(row) && row.month < asOfMonth)) -
    sum(active.filter(countedExpense)) -
    dedicatedTotal(active)
  );
}
export function monthSummary(rows, month, asOfMonth = currentMonth()) {
  const entries = rows.filter((row) => row.month === month);
  const income = entries.filter(regularIncome);
  const expenses = entries.filter(countedExpense);
  const dedicated = entries.filter(isDedicated);
  const collection = sum(income);
  const recognizedCollection = month < asOfMonth ? collection : 0;
  const sadakah = sum(expenses);
  const contribution = dedicatedTotal(dedicated);
  const opening = balance(
    rows.filter((row) => row.month < month),
    asOfMonth,
  );
  return {
    income,
    expenses,
    dedicated,
    collection,
    recognizedCollection,
    sadakah,
    dedicatedContribution: contribution,
    fundExpenses: sadakah + contribution,
    collectionReleased: month < asOfMonth,
    opening,
    afterExpenses: opening - sadakah - contribution,
    balance:
      month > asOfMonth ? 0 : recognizedCollection - sadakah - contribution,
    closing: balance(
      rows.filter((row) => row.month <= month),
      asOfMonth,
    ),
  };
}
export function history(rows, asOfMonth = currentMonth()) {
  return [
    ...new Set(
      rows.filter((row) => row.month <= asOfMonth).map((row) => row.month),
    ),
  ]
    .sort()
    .map((month) => ({ month, ...monthSummary(rows, month, asOfMonth) }));
}
export function yearOverview(rows, year, asOfMonth = currentMonth()) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month, ...monthSummary(rows, month, asOfMonth) };
  });
}
export function donationDays(donor, now = new Date()) {
  if (!donor.last_donated) return null;
  return Math.floor(
    (Date.parse(`${currentDate(now)}T00:00:00Z`) -
      Date.parse(`${donor.last_donated}T00:00:00Z`)) /
      86400000,
  );
}
export function isAvailable(donor, now = new Date()) {
  const days = donationDays(donor, now);
  return Boolean(donor.available) && (days === null || days >= 100);
}
export function shiftMonth(month, delta) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
export function shuffle(rows) {
  const result = [...rows];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function normalizeDigits(value) {
  return String(value).replace(/[০-৯]/g, (digit) =>
    String(digit.charCodeAt(0) - "০".charCodeAt(0)),
  );
}
export function credentials(value) {
  const original = value.trim();
  const input = normalizeDigits(original);
  return /^[+\d][\d\s-]*$/.test(input)
    ? {
        phone: input.startsWith("+")
          ? input.replace(/[\s-]/g, "")
          : `+88${input.replace(/[\s-]/g, "")}`,
      }
    : { email: original };
}
export function readCache(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
