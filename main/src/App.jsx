import { useState } from "react";
import { AppProvider, useApp } from "./context";
import { db } from "./supabase";
import { balance } from "./domain";
import Fund from "./components/Fund";
import Blood from "./components/Blood";
import { AuthForm, FundForm, DonorForm, DeleteForm } from "./components/Forms";
import { CompleteHistory, Overview } from "./components/History";
import { Modal, Icon } from "./components/UI";
import Users from "./components/Users";
function Shell() {
  const {
    t,
    lang,
    setLang,
    user,
    isAdmin,
    authLoading,
    loading,
    stale,
    status,
    modal,
    setModal,
    refresh,
    run,
    fund,
    money,
  } = useApp();
  const [section, setSection] = useState(() =>
    localStorage.getItem("eor:section") === "fund" ? "fund" : "blood",
  );
  function navigate(next) {
    setSection(next);
    localStorage.setItem("eor:section", next);
  }
  return (
    <div className="app">
      <header className="site-header">
        <button
          className="brand"
          aria-label={t("Complete history", "সম্পূর্ণ তথ্য")}
          onClick={() => setModal({ kind: "history" })}
        >
          <strong>
            Esho Obodan Rakhi
            <br />
            <span>আসো অবদান রাখি</span>
          </strong>
          <small className="balance-stat">{money(balance(fund))}</small>
        </button>
        <div className="header-actions">
          {(!user || isAdmin) && (
            <button
              disabled={authLoading}
              onClick={() =>
                setModal({
                  kind: user ? "menu" : "auth",
                  mode: "login",
                })
              }
            >
              {user ? t("Admin", "অ্যাডমিন") : t("Login", "লগইন")}
            </button>
          )}
          <button
            disabled={loading}
            aria-label={t("Refresh data", "তথ্য রিফ্রেশ")}
            onClick={refresh}
          >
            <Icon name="refresh" />
          </button>
          <button
            aria-label={t("Settings", "সেটিংস")}
            onClick={() => setModal({ kind: "settings" })}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
      <nav aria-label={t("Main navigation", "মূল মেনু")}>
        <button
          className={section === "fund" ? "active" : ""}
          onClick={() => navigate("fund")}
        >
          <Icon name="fund" size={45} />
          <span>{t("Fund History", "ফান্ডের তথ্য")}</span>
        </button>
        <button
          className={section === "blood" ? "active" : ""}
          onClick={() => navigate("blood")}
        >
          <Icon name="blood-donation-icon" size={45} />
          <span>{t("Blood Donors", "রক্তদাতা")}</span>
        </button>
      </nav>
      <main className="main-content">
        {stale && (
          <div className="offline-banner" role="status">
            {t(
              "Unable to refresh. Showing saved data where available; it may be out of date.",
              "রিফ্রেশ করা যায়নি। সেভ করা তথ্য দেখানো হচ্ছে, যা পুরোনো হতে পারে।",
            )}{" "}
            <button
              className="text-button"
              disabled={loading}
              onClick={refresh}
            >
              {t("Retry", "আবার চেষ্টা")}
            </button>
          </div>
        )}
        {section === "fund" ? <Fund /> : <Blood />}
      </main>
      {status && (
        <div
          className={`status ${status.error ? "error" : ""}`}
          role={status.error ? "alert" : "status"}
        >
          {status.text}
        </div>
      )}
      {modal?.kind === "settings" && (
        <Modal title={t("Settings", "সেটিংস")}>
          <div className="settings-language">
            <strong>{t("Bengali Mode", "বাংলা মোড")}</strong>
            <label className="check">
              <input
                type="checkbox"
                checked={lang === "bn"}
                onChange={(e) => setLang(e.target.checked ? "bn" : "en")}
              />
              {t("Enable", "চালু করুন")}
            </label>
          </div>
          {user ? (
            <button
              className="primary destructive full"
              onClick={() =>
                run(async () => {
                  const { error } = await db.auth.signOut();
                  if (error) throw error;
                  setModal(null);
                })
              }
            >
              {t("Logout", "লগআউট")}
            </button>
          ) : (
            <button
              className="primary full"
              onClick={() => setModal({ kind: "auth", mode: "login" })}
            >
              {t("Login", "লগইন")}
            </button>
          )}
        </Modal>
      )}
      {modal?.kind === "menu" && isAdmin && (
        <Modal title={t("Admin Menu", "অ্যাডমিন মেনু")}>
          <button
            className="primary blue-button full"
            onClick={() => setModal({ kind: "users" })}
          >
            👥 {t("Users", "ব্যবহারকারী")}
          </button>
        </Modal>
      )}
      {modal?.kind === "auth" && <AuthForm initialMode={modal.mode} />}
      {modal?.kind === "fund" && isAdmin && <FundForm row={modal.row} />}
      {modal?.kind === "donor" && user && <DonorForm row={modal.row} />}
      {modal?.kind === "delete" && user && (
        <DeleteForm table={modal.table} row={modal.row} />
      )}
      {modal?.kind === "history" && <CompleteHistory />}
      {modal?.kind === "overview" && <Overview initialYear={modal.year} />}
      {modal?.kind === "users" && isAdmin && <Users />}
    </div>
  );
}
export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
