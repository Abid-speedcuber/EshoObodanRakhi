import { useEffect, useRef } from "react";

import { useApp } from "../context";
export function Icon({ name, size = 16 }) {
  return (
    <img
      className="svg-icon"
      src={`/svgs/${name.endsWith("icon") || name === "overview-icon" ? name : `icon-${name}`}.svg`}
      width={size}
      height={size}
      alt=""
    />
  );
}
export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}
export function Modal({
  title,
  children,
  wide = false,
  form = false,
  footer = true,
  headerAction,
}) {
  const { setModal, t } = useApp();
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={() => setModal(null)}
      onClick={(e) => {
        if (!form && e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            setModal(null);
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        {headerAction}
      </div>
      {children}
      {footer && (
        <button
          className={form ? "form-close full" : "modal-close full"}
          onClick={() => setModal(null)}
        >
          {form ? t("Cancel", "বাতিল") : t("Close", "বন্ধ করুন")}
        </button>
      )}
    </dialog>
  );
}
export function Field({ label, children }) {
  return (
    <label className="field">
      <span className="sr-only">{label}</span>
      {children.type === "input" || children.type === "textarea" ? (
        <children.type
          {...children.props}
          placeholder={children.props.placeholder || label}
        />
      ) : (
        children
      )}
    </label>
  );
}
export function DonationBox() {
  const { t, copy } = useApp();
  return (
    <aside className="donation-box">
      <p>
        {t(
          "You can also contribute by donating to:",
          "আপনিও অনুদান দিয়ে অবদান রাখতে পারেন:",
        )}
      </p>
      {[
        ["nogod", "নগদ", "+880 1937-222273"],
        ["bkash", "বিকাশ", "+880 1515-214867"],
      ].map(([en, bn, number]) => (
        <button key={en} onClick={() => copy(number)}>
          {number} - {t(en, bn)}
        </button>
      ))}
    </aside>
  );
}
export function RichText({ text }) {
  return (
    <div className="rich-text">
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </div>
  );
}
export function Highlight({ text = "", query = "" }) {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}
