import { useEffect, useRef } from "react";
import { X, Heart, Copy } from "lucide-react";
import { useApp } from "../context";
export function Empty({ children }) {
  return (
    <div className="empty">
      <Heart size={25} strokeWidth={1.4} />
      <p>{children}</p>
    </div>
  );
}
export function Modal({ title, children, wide = false }) {
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
        if (e.target === e.currentTarget) {
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
        <button
          className="icon-button"
          aria-label={t("Close", "বন্ধ করুন")}
          onClick={() => setModal(null)}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function DonationBox() {
  const { t, copy } = useApp();
  return (
    <aside className="donation-box">
      <div>
        <Heart size={21} />
        <strong>
          {t(
            "Every contribution makes a difference.",
            "প্রতিটি অবদান মূল্যবান।",
          )}
        </strong>
      </div>
      <p>
        {t(
          "Contribute to our community fund through these accounts. Tap to copy.",
          "এই অ্যাকাউন্টে সাদাকাহ করে অবদান রাখুন। কপি করতে ক্লিক করুন।",
        )}
      </p>
      <div className="payment-options">
        {[
          ["Nagad", "নগদ", "+880 1937-222273"],
          ["bKash", "বিকাশ", "+880 1515-214867"],
        ].map(([name, bn, number]) => (
          <button key={name} onClick={() => copy(number)}>
            <span>{t(name, bn)}</span>
            <strong>{number}</strong>
            <Copy size={15} />
          </button>
        ))}
      </div>
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
