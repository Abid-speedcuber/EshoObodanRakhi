import { useEffect, useState } from "react";
import { useApp } from "../context";
import { db } from "../supabase";
import { Modal, Empty } from "./UI";
export default function Users() {
  const { t, user, isAdmin } = useApp();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null);
  useEffect(() => {
    let disposed = false;
    if (!isAdmin) return;
    db.from("users")
      .select("id,name,email,role,created_at")
      .order("name")
      .then(({ data, error }) => {
        if (disposed) return;
        if (error) setError(error.message);
        else setRows(data || []);
        setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [isAdmin]);
  async function save() {
    const { id, role } = pending;
    setBusy(id);
    setError("");
    const { data, error } = await db
      .from("users")
      .update({ role })
      .eq("id", id)
      .select("id,role")
      .single();
    if (error) setError(error.message);
    else if (data?.id) {
      setRows(rows.map((row) => (row.id === id ? { ...row, role } : row)));
      setPending(null);
    } else
      setError(
        t(
          "The role change was not applied. Please try again.",
          "রোল পরিবর্তন হয়নি। আবার চেষ্টা করুন।",
        ),
      );
    setBusy(null);
  }
  return (
    <Modal title={t("Manage Users", "ব্যবহারকারী নিয়ন্ত্রণ")} wide>
      <p className="subtle">
        {t(
          "Admins manage the fund, all blood donor profiles, and account roles.",
          "অ্যাডমিন ফান্ড, সব রক্তদাতার প্রোফাইল ও অ্যাকাউন্টের অনুমতি নিয়ন্ত্রণ করেন।",
        )}
      </p>
      <input
        aria-label={t("Search accounts", "অ্যাকাউন্ট খুঁজুন")}
        className="full"
        placeholder={t("Search name or email…", "নাম বা ইমেইল দিয়ে খুঁজুন…")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <Empty>{t("Loading accounts…", "অ্যাকাউন্ট লোড হচ্ছে…")}</Empty>
      )}
      {rows
        .filter((r) =>
          `${r.name} ${r.email || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .map((row) => (
          <div className="user-row" key={row.id}>
            <div>
              <strong>{row.name}</strong>
              <small>{row.email || row.id}</small>
            </div>
            <select
              aria-label={`${t("Role for", "রোল")} ${row.name}`}
              disabled={row.id === user?.id || busy !== null}
              value={row.role === "admin" ? "admin" : "user"}
              onChange={(e) => setPending({ ...row, role: e.target.value })}
            >
              <option value="user">{t("User", "ইউজার")}</option>
              <option value="admin">{t("Admin", "অ্যাডমিন")}</option>
            </select>
            {row.id === user?.id && <small>{t("You", "আপনি")}</small>}
          </div>
        ))}
      {pending && (
        <div className="role-confirm" role="alert">
          <strong>
            {pending.name} →{" "}
            {pending.role === "admin"
              ? t("Admin", "অ্যাডমিন")
              : t("User", "ইউজার")}
          </strong>
          <p>
            {pending.role === "admin"
              ? t(
                  "This gives full control of fund entries, blood donors, and other accounts’ roles.",
                  "এতে ফান্ড, রক্তদাতা এবং অন্য অ্যাকাউন্টের রোল নিয়ন্ত্রণের পূর্ণ অনুমতি পাবেন।",
                )
              : t(
                  "This removes access to fund editing, other donors’ profiles, and role management.",
                  "এতে ফান্ড এডিট, অন্য রক্তদাতার প্রোফাইল এবং রোল নিয়ন্ত্রণের অনুমতি বাতিল হবে।",
                )}
          </p>
          <div className="actions">
            <button
              className="secondary"
              disabled={busy !== null}
              onClick={() => setPending(null)}
            >
              {t("Cancel", "বাতিল")}
            </button>
            <button className="primary" disabled={busy !== null} onClick={save}>
              {busy
                ? t("Saving…", "সেভ হচ্ছে…")
                : t("Confirm role change", "রোল পরিবর্তন নিশ্চিত")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
