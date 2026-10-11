import { useState } from "react";
import {
  HeartHandshake,
  Wallet,
  Droplets,
  RefreshCw,
  LogOut,
  UserRound,
  ShieldCheck,
} from "lucide-react";
import { AppProvider, useApp } from "./context";
import { db } from "./supabase";
import Fund from "./components/Fund";
import Blood from "./components/Blood";
import { AuthForm, FundForm, DonorForm, DeleteForm } from "./components/Forms";
import { CompleteHistory, Overview } from "./components/History";
import Users from "./components/Users";
function Shell() {
  const {
    t,
    lang,
    setLang,
    user,
    profile,
    isAdmin,
    authLoading,
    loading,
    stale,
    status,
    modal,
    setModal,
    refresh,
    run,
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
        <div className="header-inner">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("blood");
            }}
          >
            <span className="brand-symbol">
              <HeartHandshake size={27} strokeWidth={1.7} />
            </span>
            <span>
              <strong>{t("Esho Obodan Rakhi", "এসো অবদান রাখি")}</strong>
              <small>
                {t("For the sake of Allah", "একমাত্র আল্লাহর জন্য")}
              </small>
            </span>
          </a>
          <div className="header-actions">
            <button
              className="language"
              onClick={() => setLang(lang === "en" ? "bn" : "en")}
            >
              {lang === "en" ? "বাংলা" : "English"}
            </button>
            <button
              className={`icon-button ${loading ? "spinning" : ""}`}
              disabled={loading}
              aria-label={t("Refresh data", "তথ্য রিফ্রেশ")}
              onClick={refresh}
            >
              <RefreshCw size={17} />
            </button>
            {user ? (
              <>
                <span className="account-name">
                  {profile?.name || user.email || user.phone}
                  {isAdmin && <small>{t("Admin", "অ্যাডমিন")}</small>}
                </span>
                <button
                  className="icon-button"
                  aria-label={t("Sign out", "লগআউট")}
                  onClick={() =>
                    run(async () => {
                      const { error } = await db.auth.signOut();
                      if (error) throw error;
                      setModal(null);
                    })
                  }
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <button
                className="primary sign-in"
                disabled={authLoading}
                onClick={() => setModal({ kind: "auth", mode: "login" })}
              >
                <UserRound size={16} />
                {t("Sign in", "লগইন")}
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="nav-wrap">
        <nav aria-label={t("Main navigation", "মূল মেনু")}>
          <button
            className={section === "fund" ? "active" : ""}
            onClick={() => navigate("fund")}
          >
            <Wallet size={19} />
            {t("Community fund", "ফান্ড")}
          </button>
          <button
            className={section === "blood" ? "active" : ""}
            onClick={() => navigate("blood")}
          >
            <Droplets size={19} />
            {t("Blood donation", "রক্তদান")}
          </button>
          {isAdmin && (
            <button
              className="manage-access"
              onClick={() => setModal({ kind: "users" })}
            >
              <ShieldCheck size={17} />
              {t("Manage access", "অনুমতি নিয়ন্ত্রণ")}
            </button>
          )}
        </nav>
      </div>
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
      <footer>
        <div className="footer-brand">
          <HeartHandshake size={17} />
          {t("Esho Obodan Rakhi", "এসো অবদান রাখি")}
        </div>
        <span>
          {t(
            "Small contributions. Lasting change.",
            "ছোট অবদান। দীর্ঘস্থায়ী পরিবর্তন।",
          )}
        </span>
      </footer>
      {status && (
        <div
          className={`status ${status.error ? "error" : ""}`}
          role={status.error ? "alert" : "status"}
        >
          {status.text}
        </div>
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
