import { useRef, useState } from "react";
import { useApp } from "../context";
import {
  currentMonth,
  MIN_MONTH,
  shiftMonth,
  sum,
  visibleSadakah,
  countedExpense,
  monthSummary,
} from "../domain";
import { Empty, DonationBox, RichText, Icon } from "./UI";
export function FundEntry({ row, index, details = false }) {
  const { t, money, monthLabel, isAdmin, setModal } = useApp();
  const category =
    row.type === "income"
      ? "income"
      : row.is_calculation
        ? row.is_display
          ? "planned"
          : "external"
        : row.is_display
          ? "operating"
          : "regular";
  return (
    <div
      className={`entry ${category} ${details ? "sadakah-detail" : ""}`}
      title={
        row.timestamp
          ? new Date(row.timestamp).toLocaleString("en-GB", {
              timeZone: "Asia/Dhaka",
            })
          : ""
      }
    >
      <div className="entry-main">
        <div className="entry-name">
          {!details && <span className="row-number">{index + 1}.</span>}
          <span className={row.highlighted ? "highlighted" : ""}>
            {row.name || row.description || t("Unnamed", "নামহীন")}
          </span>
        </div>
        <strong className={row.type === "income" ? "green" : "red"}>
          {money(row.amount)}
        </strong>
        {isAdmin && (
          <div className="entry-actions">
            <button
              aria-label={t("Edit entry", "এডিট করুন")}
              onClick={() => setModal({ kind: "fund", row })}
            >
              <Icon name="edit" />
            </button>
            <button
              aria-label={t("Delete entry", "মুছুন")}
              onClick={() => setModal({ kind: "delete", table: "fund", row })}
            >
              <Icon name="delete" />
            </button>
          </div>
        )}
      </div>
      {details && <small>{monthLabel(row.month)}</small>}
      {details && row.additional_info && (
        <RichText text={row.additional_info} />
      )}
    </div>
  );
}
export default function Fund() {
  const { t, money, monthLabel, fund, isAdmin, setModal, copy, loading } =
    useApp();
  const [tab, setTab] = useState("sadakah");
  const [month, setMonth] = useState(currentMonth);
  const touch = useRef(null);
  const totals = monthSummary(fund, month);
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
    let text = `${monthLabel(month)}\n\n${totals.income.map((r, i) => `${i + 1}. ${r.name} — ${money(r.amount)}`).join("\n")}\n\n${t("Total Collection", "মোট কালেকশন")}: ${money(totals.collection)}`;
    if (isAdmin)
      text +=
        "\n\nঅনেক ভাইরা বাকি, আমরা আল্লাহর জন্য নিয়াত করি দেওয়ার ভাইরা। এই কাজ গুলোতো আপনাদের সদাকার মাধ্যমে হচ্ছে আল্লাহর তৌফিকে।\n+880 1937-222273 - নগদ\n+880 1515-214867 - বিকাশ\n\nhttps://eshoobodanrakhi.web.app";
    copy(text);
  }
  return (
    <>
      {!isAdmin && (
        <div className="fund-tabs">
          <button
            className={tab === "collection" ? "selected" : ""}
            onClick={() => setTab("collection")}
          >
            <strong className="green">{t("Collection", "কালেকশন")}</strong>
            <b className="green">
              {money(sum(fund.filter((r) => r.type === "income")))}
            </b>
            <small>
              {money(monthSummary(fund, currentMonth()).collection)}{" "}
              {t("this month", "এই মাসে")}
            </small>
          </button>
          <button
            className={tab === "sadakah" ? "selected" : ""}
            onClick={() => setTab("sadakah")}
          >
            <strong className="red">{t("Sadakah", "সাদাকাহ")}</strong>
            <b className="red">{money(sum(allExpenses))}</b>
            <small>
              {money(sum(fund.filter(countedExpense)))}{" "}
              {t("from fund", "ফান্ড থেকে")}
            </small>
          </button>
        </div>
      )}
      {isAdmin || tab === "collection" ? (
        <>
          <div className="month-toolbar panel">
            <div className="month-picker">
              <button
                aria-label={t("Previous month", "আগের মাস")}
                disabled={month <= MIN_MONTH}
                onClick={() => changeMonth(-1)}
              >
                <Icon name="previous" size={20} />
              </button>
              <strong>{monthLabel(month)}</strong>
              <button
                aria-label={t("Next month", "পরের মাস")}
                disabled={month >= currentMonth()}
                onClick={() => changeMonth(1)}
              >
                <Icon name="next" size={20} />
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
                  + {t("Collection", "কালেকশন")}
                </button>
                <button
                  className="primary destructive"
                  onClick={() =>
                    setModal({ kind: "fund", row: { type: "expense", month } })
                  }
                >
                  + {t("Sadakah", "সাদাকাহ")}
                </button>
              </div>
            )}
          </div>
          <div
            className="ledger-grid"
            onTouchStart={(e) =>
              (touch.current = [e.touches[0].clientX, e.touches[0].clientY])
            }
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
                <h2 className="green">{t("Collection", "কালেকশন")}</h2>
                <button
                  className="copy-list"
                  disabled={!totals.income.length}
                  onClick={copyIncome}
                >
                  <Icon name="copy" />
                  {t("Copy List", "লিস্ট কপি")}
                </button>
              </div>
              {!isAdmin && <DonationBox />}
              <div className="entries">
                {totals.income.length ? (
                  totals.income.map((r, i) => (
                    <FundEntry key={r.id} row={r} index={i} />
                  ))
                ) : (
                  <Empty>
                    {loading
                      ? t("Loading…", "লোড হচ্ছে…")
                      : t("No collection entries", "কোনো এন্ট্রি নেই")}
                  </Empty>
                )}
              </div>
              <div className="panel-total green">
                <strong>{t("Total Collection:", "মোট কালেকশন:")}</strong>
                <strong>{money(totals.collection)}</strong>
              </div>
            </section>
            <section className="panel">
              <div className="panel-title">
                <h2 className="red">{t("Sadakah", "সাদাকাহ")}</h2>
              </div>
              <div className="entries">
                {expenses.length ? (
                  expenses.map((r, i) => (
                    <FundEntry key={r.id} row={r} index={i} />
                  ))
                ) : (
                  <Empty>{t("No sadakah entries", "কোনো এন্ট্রি নেই")}</Empty>
                )}
              </div>
              <div className="panel-total red">
                <strong>{t("Total Sadakah:", "মোট সাদাকাহ:")}</strong>
                <strong>{money(totals.sadakah)}</strong>
              </div>
            </section>
          </div>
          <div className="month-summary panel">
            <div>
              <strong>{t("Monthly Economy:", "মাসিক হিসাব:")}</strong>
              <strong className={totals.balance < 0 ? "red" : "green"}>
                {money(totals.balance)}
              </strong>
            </div>
            <div>
              <strong>
                {t("Net Worth at Month End:", "মাস শেষে অবশিষ্ট:")}
              </strong>
              <strong className="blue">{money(totals.closing)}</strong>
            </div>
          </div>
          <div className="panel overview-button">
            <button
              className="primary blue-button"
              onClick={() =>
                setModal({ kind: "overview", year: Number(month.slice(0, 4)) })
              }
            >
              <Icon name="overview-icon" size={20} />
              {t("Yearly Overview", "বার্ষিক তথ্য")}
            </button>
          </div>
        </>
      ) : (
        <section className="panel">
          <div className="panel-title">
            <h2>{t("All Sadakah History", "সব সাদাকাহ তথ্য")}</h2>
          </div>
          <div className="entries">
            {allExpenses.length ? (
              allExpenses.map((r, i) => (
                <FundEntry key={r.id} row={r} index={i} details />
              ))
            ) : (
              <Empty>{t("No sadakah entries", "কোনো এন্ট্রি নেই")}</Empty>
            )}
          </div>
          <DonationBox />
        </section>
      )}
    </>
  );
}
