import { useState } from "react";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useApp } from "../context";
import { history, yearOverview, currentMonth, balance } from "../domain";
import { Modal, Empty } from "./UI";
export function CompleteHistory() {
  const { t, fund, money, monthLabel, copy } = useApp();
  const [brief, setBrief] = useState(true);
  const [year, setYear] = useState(Number(currentMonth().slice(0, 4)));
  const all = history(fund);
  const rows = brief
    ? all.filter((r) => r.month.startsWith(String(year)))
    : all;
  const opening = balance(fund.filter((r) => r.month < `${year}-01`));
  function copyHistory() {
    const text = `${t("Complete fund history", "ফান্ডের সম্পূর্ণ তথ্য")}\n\n${brief ? `${year}\n${t("Opening balance", "শুরুতে অবশিষ্ট")}: ${money(opening)}\n\n` : ""}${rows.map((r) => `${monthLabel(r.month)}\n${t("Collection", "কালেকশন")}: ${money(r.collection)}\n${r.expenses.map((e) => `${t("Sadakah", "সাদাকাহ")} (${e.description}): ${money(e.amount)}`).join("\n")}\n${t("Closing balance", "অবশিষ্ট")}: ${money(r.closing)}`).join("\n\n")}`;
    copy(text);
  }
  return (
    <Modal title={t("Complete fund history", "ফান্ডের সম্পূর্ণ তথ্য")} wide>
      <div className="history-controls">
        <div className="tabs">
          <button
            className={brief ? "active" : ""}
            onClick={() => setBrief(true)}
          >
            {t("Yearly brief", "সংক্ষিপ্ত")}
          </button>
          <button
            className={!brief ? "active" : ""}
            onClick={() => setBrief(false)}
          >
            {t("Elaborate", "বিস্তারিত")}
          </button>
        </div>
        <button
          className="secondary"
          onClick={copyHistory}
          disabled={!rows.length}
        >
          <Copy size={16} />
          {t("Copy history", "তথ্য কপি")}
        </button>
      </div>
      {brief && (
        <>
          <YearPicker year={year} setYear={setYear} />
          <div className="history-opening">
            {t("Opening balance", "শুরুতে অবশিষ্ট")}{" "}
            <strong>{money(opening)}</strong>
          </div>
        </>
      )}
      {rows.length ? (
        rows.map((row) => (
          <section className="history-month" key={row.month}>
            <h3>{monthLabel(row.month)}</h3>
            <div>
              <span>{t("Total collection", "মোট কালেকশন")}</span>
              <strong className="green">{money(row.collection)}</strong>
            </div>
            {row.expenses.map((expense) => (
              <div key={expense.id}>
                <span>{expense.description}</span>
                <span className="red">− {money(expense.amount)}</span>
              </div>
            ))}
            <div className="history-closing">
              <span>{t("Closing balance", "অবশিষ্ট")}</span>
              <strong>{money(row.closing)}</strong>
            </div>
          </section>
        ))
      ) : (
        <Empty>
          {t("No history for this period.", "এই সময়ে কোনো তথ্য নেই।")}
        </Empty>
      )}
    </Modal>
  );
}
function YearPicker({ year, setYear }) {
  const { t } = useApp();
  const maxYear = Number(currentMonth().slice(0, 4));
  return (
    <div className="year-picker">
      <button
        className="icon-button"
        aria-label={t("Previous year", "আগের বছর")}
        disabled={year <= 2017}
        onClick={() => setYear(year - 1)}
      >
        <ChevronLeft size={20} />
      </button>
      <strong>{year}</strong>
      <button
        className="icon-button"
        aria-label={t("Next year", "পরের বছর")}
        disabled={year >= maxYear}
        onClick={() => setYear(year + 1)}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
export function Overview({ initialYear }) {
  const { t, money, fund, monthLabel } = useApp();
  const [year, setYear] = useState(initialYear);
  const rows = yearOverview(fund, year);
  const max = Math.max(
    1,
    ...rows.flatMap((r) => [r.collection, r.sadakah, r.closing]),
  );
  const min = Math.min(0, ...rows.map((r) => r.closing));
  const y = (value) => 230 - ((value - min) / (max - min)) * 185;
  const points = rows.map((r, i) => `${60 + i * 51},${y(r.closing)}`).join(" ");
  return (
    <Modal title={t("Yearly overview", "বার্ষিক তথ্য")} wide>
      <YearPicker year={year} setYear={setYear} />
      <div className="chart-legend">
        <span className="green">● {t("Collection", "কালেকশন")}</span>
        <span className="red">● {t("Sadakah", "সাদাকাহ")}</span>
        <span className="blue">● {t("Fund balance", "ফান্ডে অবশিষ্ট")}</span>
      </div>
      <svg
        className="chart"
        viewBox="0 0 680 280"
        role="img"
        aria-label={t(
          `Monthly collections, Sadakah and fund balance in ${year}`,
          `${year} সালের মাসিক কালেকশন, সাদাকাহ ও ফান্ডের অবশিষ্ট`,
        )}
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const value = min + ((max - min) * i) / 4;
          return (
            <g key={i}>
              <line
                x1="45"
                x2="650"
                y1={y(value)}
                y2={y(value)}
                stroke="#e5e9e5"
              />
              <text
                x="38"
                y={y(value) + 4}
                textAnchor="end"
                fontSize="10"
                fill="#6e7d73"
              >
                {Math.round(value).toLocaleString()}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => (
          <g key={r.month}>
            <rect
              x={49 + i * 51}
              y={y(r.collection)}
              width="10"
              height={Math.max(0, y(0) - y(r.collection))}
              rx="2"
              fill="#239c70"
            >
              <title>
                {monthLabel(r.month)} · {t("Collection", "কালেকশন")}:{" "}
                {money(r.collection)}
              </title>
            </rect>
            <rect
              x={61 + i * 51}
              y={y(r.sadakah)}
              width="10"
              height={Math.max(0, y(0) - y(r.sadakah))}
              rx="2"
              fill="#d56c63"
            >
              <title>
                {monthLabel(r.month)} · {t("Sadakah", "সাদাকাহ")}:{" "}
                {money(r.sadakah)}
              </title>
            </rect>
            <text
              x={60 + i * 51}
              y="255"
              textAnchor="middle"
              fontSize="10"
              fill="#6e7d73"
            >
              {new Date(`${r.month}-01`).toLocaleDateString("en-GB", {
                month: "short",
              })}
            </text>
          </g>
        ))}
        <polyline
          points={points}
          fill="none"
          stroke="#437ab4"
          strokeWidth="2.5"
        />
        {rows.map((r, i) => (
          <circle
            key={r.month}
            cx={60 + i * 51}
            cy={y(r.closing)}
            r="4"
            fill="#437ab4"
          >
            <title>
              {monthLabel(r.month)} · {t("Balance", "অবশিষ্ট")}:{" "}
              {money(r.closing)}
            </title>
          </circle>
        ))}
      </svg>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Month", "মাস")}</th>
              <th>{t("Collection", "কালেকশন")}</th>
              <th>{t("Sadakah", "সাদাকাহ")}</th>
              <th>{t("Fund balance", "অবশিষ্ট")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <td>{monthLabel(r.month)}</td>
                <td className="green">{money(r.collection)}</td>
                <td className="red">{money(r.sadakah)}</td>
                <td>{money(r.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
