import { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Copy,
  Pencil,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  ChartNoAxesCombined,
  History,
} from "lucide-react";
import { useApp } from "../context";
import {
  currentMonth,
  MIN_MONTH,
  shiftMonth,
  sum,
  balance,
  visibleSadakah,
  countedExpense,
  monthSummary,
} from "../domain";
import { Empty, DonationBox, RichText } from "./UI";
export function FundEntry({ row, index, details = false }) {
  const { t, money, monthLabel, isAdmin, setModal } = useApp();
  const category =
    row.type === "expense"
      ? row.is_calculation
        ? row.is_display
          ? "planned"
          : "external"
        : row.is_display
          ? "operating"
          : "regular"
      : "income";
  const date = row.timestamp
    ? new Date(row.timestamp).toLocaleString("en-GB", {
        timeZone: "Asia/Dhaka",
      })
    : "";
  return (
    <div className={`entry ${category}`} title={date}>
      <div className="entry-main">
        <div className="entry-name">
          <span className="row-number">{index + 1}</span>
          <div>
            <strong className={row.highlighted ? "highlighted" : ""}>
              {row.name || row.description || t("Unnamed", "নামহীন")}
            </strong>
            {details && <small>{monthLabel(row.month)}</small>}
            {isAdmin && row.type === "expense" && (
              <small>
                {!row.is_display
                  ? t("Visible in Sadakah", "সাদাকাহতে দেখানো")
                  : t("Hidden from Sadakah", "সাদাকাহতে লুকানো")}{" "}
                ·{" "}
                {!row.is_calculation
                  ? t("From fund", "ফান্ড থেকে")
                  : t("Outside fund", "ফান্ডের বাইরে")}
              </small>
            )}
          </div>
        </div>
        <strong className={row.type === "income" ? "green" : "red"}>
          {money(row.amount)}
        </strong>
        {isAdmin && (
          <div className="entry-actions">
            <button
              className="icon-button"
              aria-label={t("Edit entry", "এডিট করুন")}
              onClick={() => setModal({ kind: "fund", row })}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-button danger"
              aria-label={t("Delete entry", "মুছুন")}
              onClick={() => setModal({ kind: "delete", table: "fund", row })}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      {row.additional_info && <RichText text={row.additional_info} />}
    </div>
  );
}
export default function Fund() {
  const { t, money, monthLabel, fund, isAdmin, setModal, copy, loading } =
    useApp();
  const [tab, setTab] = useState("collection");
  const [month, setMonth] = useState(currentMonth);
  const touch = useRef(null);
  const totals = monthSummary(fund, month);
  const incomeTotal = sum(fund.filter((r) => r.type === "income"));
  const sadakahTotal = sum(fund.filter(visibleSadakah));
  const allExpenses = fund
    .filter(visibleSadakah)
    .sort(
      (a, b) =>
        b.month.localeCompare(a.month) ||
        new Date(b.timestamp) - new Date(a.timestamp),
    );
  const expenses = isAdmin
    ? fund.filter((r) => r.month === month && r.type === "expense")
    : totals.expenses;
  function changeMonth(delta) {
    const next = shiftMonth(month, delta);
    if (next >= MIN_MONTH && next <= currentMonth()) setMonth(next);
  }
  function copyIncome() {
    const today = new Date().toLocaleDateString("bn-BD", {
      timeZone: "Asia/Dhaka",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    let text = `${monthLabel(month)} — ${today}\n\n${totals.income.map((r, i) => `${i + 1}. ${r.name} — ${money(r.amount)}`).join("\n")}\n\n${t("Total collection", "মোট কালেকশন")}: ${money(totals.collection)}`;
    if (isAdmin)
      text +=
        "\n\nঅনেক ভাইরা বাকি, আমরা আল্লাহর জন্য নিয়াত করি দেওয়ার ভাইরা। এই কাজ গুলোতো আপনাদের সদাকার মাধ্যমে হচ্ছে আল্লাহর তৌফিকে।\n+880 1937-222273 - নগদ\n+880 1515-214867 - বিকাশ\n\nhttps://eshoobodanrakhi.web.app";
    copy(text);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {t(
              "A little from each of us. A lot for our community.",
              "সবার অল্প অবদান, সমাজের বড় উপকার।",
            )}
          </span>
          <h1>{t("Our community fund", "আমাদের ফান্ড")}</h1>
          <p>
            {t(
              "Every contribution, every act of kindness. Open for everyone to see.",
              "প্রতিটি কালেকশন, প্রতিটি সাদাকাহ — সবার জন্য উন্মুক্ত।",
            )}
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => setModal({ kind: "history" })}
        >
          <History size={17} />
          {t("Complete history", "সম্পূর্ণ তথ্য")}
        </button>
      </div>
      <div className="stats-grid">
        <div className="stat balance-stat">
          <span>{t("Available in fund", "ফান্ডে অবশিষ্ট")}</span>
          <strong>{money(balance(fund))}</strong>
          <small>
            {t(
              "Together, we make good things happen.",
              "সবার অবদানেই ভালো কাজ সম্ভব।",
            )}
          </small>
        </div>
        <button
          className={`stat ${tab === "collection" ? "selected" : ""}`}
          onClick={() => setTab("collection")}
        >
          <span>
            <ArrowUpRight size={18} />
            {t("Total collection", "মোট কালেকশন")}
          </span>
          <strong>{money(incomeTotal)}</strong>
          <small>
            {money(monthSummary(fund, currentMonth()).collection)}{" "}
            {t("this month", "এই মাসে")}
          </small>
        </button>
        <button
          className={`stat ${tab === "sadakah" ? "selected" : ""}`}
          onClick={() => setTab("sadakah")}
        >
          <span>
            <ArrowDownRight size={18} />
            {t("Total Sadakah", "মোট সাদাকাহ")}
          </span>
          <strong>{money(sadakahTotal)}</strong>
          <small>
            {money(sum(fund.filter(countedExpense)))}{" "}
            {t("from fund", "ফান্ড থেকে")}
          </small>
        </button>
      </div>
      <div className="section-toolbar">
        <div className="tabs">
          <button
            className={tab === "collection" ? "active" : ""}
            onClick={() => setTab("collection")}
          >
            {t("Monthly collection", "মাসিক কালেকশন")}
          </button>
          <button
            className={tab === "sadakah" ? "active" : ""}
            onClick={() => setTab("sadakah")}
          >
            {t("All Sadakah", "সব সাদাকাহ")}
          </button>
        </div>
        <button
          className="text-button"
          onClick={() =>
            setModal({ kind: "overview", year: Number(month.slice(0, 4)) })
          }
        >
          <ChartNoAxesCombined size={18} />
          {t("Yearly overview", "বার্ষিক তথ্য")}
        </button>
      </div>
      {tab === "collection" ? (
        <>
          <div className="month-toolbar">
            <div className="month-picker">
              <button
                className="icon-button"
                aria-label={t("Previous month", "আগের মাস")}
                disabled={month <= MIN_MONTH}
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={20} />
              </button>
              <label>
                <span className="sr-only">
                  {t("Select month", "মাস নির্বাচন")}
                </span>
                <input
                  type="month"
                  min={MIN_MONTH}
                  max={currentMonth()}
                  value={month}
                  onChange={(e) => {
                    if (
                      e.target.value >= MIN_MONTH &&
                      e.target.value <= currentMonth()
                    )
                      setMonth(e.target.value);
                  }}
                />
              </label>
              <button
                className="icon-button"
                aria-label={t("Next month", "পরের মাস")}
                disabled={month >= currentMonth()}
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={20} />
              </button>
            </div>
            {isAdmin && (
              <div className="actions">
                <button
                  className="primary"
                  onClick={() =>
                    setModal({ kind: "fund", row: { type: "income", month } })
                  }
                >
                  <Plus size={16} />
                  {t("Collection", "কালেকশন")}
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    setModal({ kind: "fund", row: { type: "expense", month } })
                  }
                >
                  <Plus size={16} />
                  {t("Sadakah", "সাদাকাহ")}
                </button>
              </div>
            )}
          </div>
          <div
            className="ledger-grid"
            onTouchStart={(e) => {
              touch.current = [e.touches[0].clientX, e.touches[0].clientY];
            }}
            onTouchEnd={(e) => {
              if (!touch.current) return;
              const [x, y] = touch.current;
              const dx = e.changedTouches[0].clientX - x;
              const dy = e.changedTouches[0].clientY - y;
              if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5)
                changeMonth(dx < 0 ? 1 : -1);
              touch.current = null;
            }}
          >
            <section className="panel">
              <div className="panel-title">
                <h2>
                  <span className="dot green-dot" />
                  {t("Collection", "কালেকশন")}
                </h2>
                <button
                  className="text-button"
                  disabled={!totals.income.length}
                  onClick={copyIncome}
                >
                  <Copy size={15} />
                  {t("Copy list", "লিস্ট কপি")}
                </button>
              </div>
              {totals.income.length ? (
                totals.income.map((r, i) => (
                  <FundEntry key={r.id} row={r} index={i} />
                ))
              ) : (
                <Empty>
                  {loading
                    ? t("Loading collection…", "লোড হচ্ছে…")
                    : t(
                        "No collection for this month yet.",
                        "এই মাসে কোনো কালেকশন নেই।",
                      )}
                </Empty>
              )}
              <div className="panel-total">
                <span>{t("Total collection", "মোট কালেকশন")}</span>
                <strong className="green">{money(totals.collection)}</strong>
              </div>
            </section>
            <section className="panel">
              <div className="panel-title">
                <h2>
                  <span className="dot red-dot" />
                  {t("Sadakah", "সাদাকাহ")}
                </h2>
                <span className="subtle">
                  {expenses.length} {t("entries", "এন্ট্রি")}
                </span>
              </div>
              {expenses.length ? (
                expenses.map((r, i) => (
                  <FundEntry key={r.id} row={r} index={i} />
                ))
              ) : (
                <Empty>
                  {t(
                    "No Sadakah for this month yet.",
                    "এই মাসে কোনো সাদাকাহ নেই।",
                  )}
                </Empty>
              )}
              <div className="panel-total">
                <span>{t("Total from fund", "ফান্ড থেকে মোট")}</span>
                <strong className="red">{money(totals.sadakah)}</strong>
              </div>
            </section>
          </div>
          <div className="month-summary">
            <div>
              <span>{t("Monthly economy", "মাসিক হিসাব")}</span>
              <strong className={totals.balance < 0 ? "red" : "green"}>
                {money(totals.balance)}
              </strong>
            </div>
            <div>
              <span>{t("Net worth at month end", "মাস শেষে অবশিষ্ট")}</span>
              <strong>{money(totals.closing)}</strong>
            </div>
          </div>
        </>
      ) : (
        <section className="panel">
          <div className="panel-title">
            <h2>{t("All Sadakah history", "সব সাদাকাহ তথ্য")}</h2>
            <span className="subtle">
              {allExpenses.length} {t("acts of kindness", "সাদাকাহ")}
            </span>
          </div>
          {allExpenses.length ? (
            allExpenses.map((r, i) => (
              <FundEntry key={r.id} row={r} index={i} details />
            ))
          ) : (
            <Empty>{t("No Sadakah entries yet.", "কোনো সাদাকাহ নেই।")}</Empty>
          )}
        </section>
      )}
      {!isAdmin && <DonationBox />}
    </>
  );
}
