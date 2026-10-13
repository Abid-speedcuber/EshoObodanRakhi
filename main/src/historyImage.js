import { toBlob } from "html-to-image";

// Capture a full-height ledger rather than the clipped, scrollable dialog.
export async function renderHistoryImage({
  source,
  year,
  title,
  openingLabel,
  openingBalance,
}) {
  await document.fonts.ready;
  const host = document.createElement("div");
  host.className = "history-image-host";
  host.setAttribute("aria-hidden", "true");
  const ledger = document.createElement("div");
  ledger.className = "history-export";
  ledger.lang = document.documentElement.lang;
  const brand = document.createElement("div");
  brand.className = "history-export-brand";
  brand.textContent = "Esho Obodan Rakhi";
  const heading = document.createElement("h2");
  heading.textContent = `${title} · ${year.toLocaleString(ledger.lang === "bn" ? "bn-BD" : "en-GB", { useGrouping: false })}`;
  const opening = document.createElement("div");
  opening.className = "history-opening";
  const label = document.createElement("span");
  label.textContent = openingLabel;
  const amount = document.createElement("strong");
  amount.textContent = openingBalance;
  opening.append(label, amount);
  ledger.append(brand, heading, opening);
  for (const month of source.querySelectorAll(
    `.history-month[data-month^="${year}-"]`,
  )) {
    ledger.append(month.cloneNode(true));
  }
  host.append(ledger);
  document.body.append(host);
  try {
    const width = 480;
    const height = Math.ceil(ledger.getBoundingClientRect().height);
    // Preserve all rows while keeping very long exports within canvas limits.
    const pixelRatio = Math.min(
      2,
      16000 / height,
      Math.sqrt(16000000 / (width * height)),
    );
    const blob = await toBlob(ledger, {
      width,
      height,
      pixelRatio,
      backgroundColor: "#ffffff",
      skipAutoScale: true,
    });
    if (!blob) throw new Error("Could not create the history image.");
    return blob;
  } finally {
    host.remove();
  }
}

export function downloadHistoryImage(blob, year) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `eor-fund-history-${year}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
