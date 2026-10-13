import { useRef, useState } from "react";

import { useApp } from "../context";
import { history, yearOverview, currentMonth, balance } from "../domain";
import { Modal, Empty, Icon } from "./UI";
import DedicatedEntry from "./Dedicated";
import { renderHistoryImage, downloadHistoryImage } from "../historyImage";
export function CompleteHistory() {
  const { t, fund, money, monthLabel, report } = useApp();
  const [brief, setBrief] = useState(true);
  const [copying, setCopying] = useState(false);
  const contentRef = useRef(null);
  const year = Number(currentMonth().slice(0, 4));
  const all = history(fund);
  const rows = brief
    ? all.filter((r) => r.month.startsWith(String(year)))
    : all;
  const opening = balance(fund.filter((r) => r.month < `${year}-01`));
  function collectionLabel(month) {
    const name = new Intl.DateTimeFormat("bn-BD", {
      month: "long",
      timeZone: "Asia/Dhaka",
    }).format(new Date(`${month}-01T00:00:00+06:00`));
    return t("Total collection (month end)", `${name} মাসে মোট কালেকশন`);
  }
  function closingLabel(row) {
    return row.collectionReleased
      ? t("Closing balance", "মাস শেষে ব্যাল্যান্স")
      : t("Current fund balance", "ফান্ডে বর্তমান ব্যাল্যান্স");
  }
  async function copyHistory() {
    if (copying || !contentRef.current) return;
    setCopying(true);
    try {
      const png = renderHistoryImage({
        source: contentRef.current,
        year,
        title: t("Complete fund history", "ফান্ডের সম্পূর্ণ তথ্য"),
        openingLabel: t("Opening balance", "শুরুতে ব্যাল্যান্স"),
        openingBalance: money(opening),
      });
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        try {
          // Start the clipboard write during the click. Safari requires the user
          // gesture even when rasterization is still resolving the PNG promise.
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": png }),
          ]);
          report(t("History image copied.", "হিস্টরির ছবি কপি হয়েছে।"));
        } catch {
          downloadHistoryImage(await png, year);
          report(
            t(
              "Image copying was blocked. PNG downloaded instead.",
              "ছবি কপি করা যায়নি। PNG ডাউনলোড হয়েছে।",
            ),
          );
        }
      } else {
        downloadHistoryImage(await png, year);
        report(
          t(
            "Image copying is unavailable here. PNG downloaded instead.",
            "এখানে ছবি কপি করা যায় না। PNG ডাউনলোড হয়েছে।",
          ),
        );
      }
    } catch {
      report(
        t(
          "Could not create the history image. Please try again.",
          "হিস্টরির ছবি তৈরি করা যায়নি। আবার চেষ্টা করুন।",
        ),
        true,
      );
    } finally {
      setCopying(false);
    }
  }
  return (
    <Modal
      title={t("Complete fund history", "ফান্ডের সম্পূর্ণ তথ্য")}
      wide
      headerAction={
        <button
          className="history-copy"
          onClick={copyHistory}
          disabled={
            copying || !all.some((row) => row.month.startsWith(String(year)))
          }
        >
          <Icon name="copy" />
          {copying ? t("Copying…", "কপি হচ্ছে…") : t("Copy", "কপি")}
        </button>
      }
    >
      <div className="history-controls">
        <div className="history-mode">
          <span>{t("History Mode:", "তথ্য প্রদর্শন:")}</span>
          <button
            className="primary blue-button"
            onClick={() => setBrief(!brief)}
          >
            {brief
              ? t("Yearly Brief", "সংক্ষিপ্ত")
              : t("Elaborate", "বিস্তারিত")}
          </button>
        </div>
      </div>
      {brief && (
        <>
          <div className="history-opening">
            {t("Opening balance", "শুরুতে ব্যাল্যান্স")}{" "}
            <strong>{money(opening)}</strong>
          </div>
        </>
      )}
      <div className="history-content" ref={contentRef}>
        {rows.length ? (
          rows.map((row) => (
            <section
              className="history-month"
              key={row.month}
              data-month={row.month}
            >
              <h3>{monthLabel(row.month)}</h3>
              {row.dedicated.map((entry) => (
                <DedicatedEntry key={entry.id} row={entry} />
              ))}
              {row.expenses.map((expense) => (
                <div key={expense.id}>
                  <span>{expense.description}</span>
                  <span className="red">− {money(expense.amount)}</span>
                </div>
              ))}
              {row.collectionReleased && (
                <div className="history-collection">
                  <span>{collectionLabel(row.month)}</span>
                  <strong className="green">{money(row.collection)}</strong>
                </div>
              )}
              <div className="history-closing">
                <span>{closingLabel(row)}</span>
                <strong>{money(row.closing)}</strong>
              </div>
            </section>
          ))
        ) : (
          <Empty>
            {t("No history for this period.", "এই সময়ে কোনো তথ্য নেই।")}
          </Empty>
        )}
      </div>
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
        ←
      </button>
      <strong>{year}</strong>
      <button
        className="icon-button"
        aria-label={t("Next year", "পরের বছর")}
        disabled={year >= maxYear}
        onClick={() => setYear(year + 1)}
      >
        →
      </button>
    </div>
  );
}
export function Overview({ initialYear }) {
  const { t, money, fund, monthLabel } = useApp();
  const [year, setYear] = useState(initialYear);
  const rows = yearOverview(fund, year);
  const [selected, setSelected] = useState(null);
  const max =
    Math.max(
      1,
      ...rows.flatMap((r) => [
        r.recognizedCollection,
        r.fundExpenses,
        Math.abs(r.closing),
      ]),
    ) * 1.1;
  const min = Math.min(0, ...rows.map((r) => r.closing)) * 1.1;
  const y = (value) => 950 - ((value - min) / (max - min)) * 870;
  const x = (i) => 80 + (i * 870) / 11;
  const series = [
    {
      key: "recognizedCollection",
      label: t("Collection", "কালেকশন"),
      color: "#10b981",
    },
    { key: "fundExpenses", label: t("Sadakah", "সাদাকাহ"), color: "#ef4444" },
    {
      key: "closing",
      label: t("Total Fund", "ফান্ডে মোট অর্থ"),
      color: "#3b82f6",
    },
  ];
  return (
    <Modal title={t("Yearly Overview", "বার্ষিক তথ্য")} wide>
      <YearPicker
        year={year}
        setYear={(value) => {
          setYear(value);
          setSelected(null);
        }}
      />
      <svg
        className="chart"
        viewBox="0 0 1000 1000"
        role="img"
        aria-label={t(
          `Monthly collections, Sadakah and fund balance in ${year}`,
          `${year} সালের মাসিক কালেকশন, সাদাকাহ ও ফান্ডের ব্যাল্যান্স`,
        )}
      >
        {Array.from({ length: 6 }, (_, i) => {
          const value = min + ((max - min) * i) / 5;
          return (
            <g key={i}>
              <line
                x1="80"
                x2="950"
                y1={y(value)}
                y2={y(value)}
                stroke="#e5e7eb"
              />
              <text
                x="70"
                y={y(value) + 4}
                textAnchor="end"
                fontSize="18"
                fontWeight="bold"
                fill="#6b7280"
              >
                {Math.round(value).toLocaleString()}
              </text>
            </g>
          );
        })}
        {min < 0 && (
          <line
            x1="80"
            x2="950"
            y1={y(0)}
            y2={y(0)}
            stroke="#9ca3af"
            strokeWidth="2"
          />
        )}
        {series.map((series) => (
          <g key={series.key}>
            <polyline
              points={rows
                .map((r, i) => `${x(i)},${y(r[series.key])}`)
                .join(" ")}
              fill="none"
              stroke={series.color}
              strokeWidth="3"
            />
            {rows.map((r, i) => (
              <g key={r.month}>
                <circle
                  cx={x(i)}
                  cy={y(r[series.key])}
                  r="4"
                  fill={series.color}
                />
                <circle
                  cx={x(i)}
                  cy={y(r[series.key])}
                  r="24"
                  fill="transparent"
                  role="button"
                  tabIndex="0"
                  aria-label={`${monthLabel(r.month)} ${series.label}: ${money(r[series.key])}`}
                  onClick={() =>
                    setSelected({
                      i,
                      value: r[series.key],
                      label: series.label,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected({
                        i,
                        value: r[series.key],
                        label: series.label,
                      });
                    }
                  }}
                >
                  <title>
                    {monthLabel(r.month)} · {series.label}:{" "}
                    {money(r[series.key])}
                  </title>
                </circle>
              </g>
            ))}
          </g>
        ))}
        {rows.map((r, i) => (
          <text
            key={r.month}
            x={x(i)}
            y="970"
            textAnchor="middle"
            fontSize="20"
            fontWeight="bold"
            fill="#6b7280"
          >
            {new Date(`${r.month}-01`).toLocaleDateString("en-GB", {
              month: "short",
            })}
          </text>
        ))}
        {selected && (
          <g>
            <circle
              cx={x(selected.i)}
              cy={y(selected.value)}
              r="8"
              fill="#ffd70080"
            />
            <circle
              cx={x(selected.i)}
              cy={y(selected.value)}
              r="5"
              fill="#111"
            />
            <rect
              x={Math.max(10, Math.min(740, x(selected.i) - 100))}
              y={Math.max(10, y(selected.value) - 50)}
              width="240"
              height="35"
              rx="5"
              fill="#111"
            />
            <text
              x={Math.max(20, Math.min(750, x(selected.i) - 90))}
              y={Math.max(35, y(selected.value) - 25)}
              fill="white"
              fontSize="20"
            >
              {new Date(rows[selected.i].month + "-01").toLocaleDateString(
                "en-GB",
                { month: "short" },
              )}
              : {money(selected.value)}
            </text>
          </g>
        )}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </Modal>
  );
}
