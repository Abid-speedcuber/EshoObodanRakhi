import { useApp } from "../context";
import { dedicatedContribution } from "../domain";
import { Icon } from "./UI";
export default function DedicatedEntry({ row, editable = false }) {
  const { t, money, isAdmin, setModal } = useApp();
  return (
    <div className="dedicated-entry">
      <div className="dedicated-title">
        <strong className={row.highlighted ? "highlighted" : ""}>
          {row.name}
        </strong>
        {editable && isAdmin && (
          <div className="entry-actions">
            <button
              aria-label={t(
                "Edit dedicated collection",
                "বিষয় ভিত্তিক কালেকশন এডিট",
              )}
              onClick={() => setModal({ kind: "fund", row })}
            >
              <Icon name="edit" />
            </button>
            <button
              aria-label={t(
                "Delete dedicated collection",
                "বিষয় ভিত্তিক কালেকশন মুছুন",
              )}
              onClick={() => setModal({ kind: "delete", table: "fund", row })}
            >
              <Icon name="delete" />
            </button>
          </div>
        )}
      </div>
      <div>
        <span>{t("Dedicated collection", "বিষয় ভিত্তিক কালেকশন")}</span>
        <strong className="green">{money(row.amount)}</strong>
      </div>
      <div>
        <span>{t("Donation on this collection", "এই কালেকশনে অনুদান")}</span>
        <strong className="red">{money(row.dedicated_donation)}</strong>
      </div>
      <div className="dedicated-fund">
        <span>{t("From fund", "ফান্ড থেকে")}</span>
        <strong className="red">− {money(dedicatedContribution(row))}</strong>
      </div>
    </div>
  );
}
