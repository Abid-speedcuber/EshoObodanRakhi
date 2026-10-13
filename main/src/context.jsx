import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { db } from "./supabase";
import { currentMonth, readCache } from "./domain";
const Context = createContext(null);
export const useApp = () => useContext(Context);
async function fetchRows(table, ordering, signal) {
  const rows = [];
  let total = null;
  do {
    let query = db.from(table).select("*", { count: "exact" });
    for (const column of ordering) query = query.order(column);
    const result = await query
      .order("id")
      .range(rows.length, rows.length + 999)
      .abortSignal(signal);
    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    total = result.count;
    if (!page.length || (total === null && page.length < 1000)) break;
  } while (total === null || rows.length < total);
  return { data: rows };
}
export function AppProvider({ children }) {
  const [lang, setLang] = useState(() =>
    localStorage.getItem("lang") === "bn" ? "bn" : "en",
  );
  const [accountingMonth, setAccountingMonth] = useState(currentMonth);
  useEffect(() => {
    const updateMonth = () => setAccountingMonth(currentMonth());
    const timer = setInterval(updateMonth, 60000);
    window.addEventListener("focus", updateMonth);
    document.addEventListener("visibilitychange", updateMonth);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", updateMonth);
      document.removeEventListener("visibilitychange", updateMonth);
    };
  }, []);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [fund, setFund] = useState(() =>
    readCache("eor:fund", readCache("allFundData")).filter((r) => r.month),
  );
  const [donors, setDonors] = useState(() =>
    readCache("eor:donors", readCache("donorsData")),
  );
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [status, setStatus] = useState(null);
  const [modal, setModal] = useState(null);
  const version = useRef(0);
  const pending = useRef(false);
  const t = (en, bn) => (lang === "bn" ? bn : en);
  const money = (value) =>
    `৳ ${Number(value).toLocaleString(lang === "bn" ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 })}`;
  const monthLabel = (value) =>
    new Date(`${value}-01T00:00:00`).toLocaleDateString(
      lang === "bn" ? "bn-BD" : "en-GB",
      { month: "long", year: "numeric" },
    );
  const report = (text, error = false) => setStatus({ text, error });
  useEffect(() => {
    localStorage.setItem("lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 7000);
    return () => clearTimeout(timer);
  }, [status]);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        fetchRows("fund", ["month", "timestamp"], AbortSignal.timeout(15000)),
        fetchRows("donors", ["name"], AbortSignal.timeout(15000)),
      ]);
      let failed = false;
      results.forEach((result, index) => {
        if (result.status === "rejected" || result.value.error) {
          failed = true;
          return;
        }
        const rows = result.value.data || [];
        (index === 0 ? setFund : setDonors)(rows);
        try {
          localStorage.setItem(
            index === 0 ? "eor:fund" : "eor:donors",
            JSON.stringify(rows),
          );
        } catch {
          /* storage can be full */
        }
      });
      setStale(failed);
    } finally {
      setLoading(false);
      pending.current = false;
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    let sessionInitialized = false;
    async function resolve(session) {
      const request = ++version.current;
      const nextUser = session?.user || null;
      setUser(nextUser);
      setProfile(null);
      if (!nextUser) {
        setAuthLoading(false);
        return;
      }
      setAuthLoading(true);
      try {
        const result = await db
          .from("users")
          .select("id,name,email,role")
          .eq("id", nextUser.id)
          .maybeSingle();
        if (result.error) throw result.error;
        let row = result.data;
        if (!row) {
          row = {
            id: nextUser.id,
            name:
              nextUser.user_metadata?.name ||
              nextUser.user_metadata?.full_name ||
              nextUser.email ||
              nextUser.phone ||
              "User",
            email: nextUser.email || null,
            role: "user",
          };
          const { error } = await db.from("users").insert(row);
          if (error) throw error;
        }
        if (!disposed && request === version.current)
          setProfile({ ...row, role: row.role === "admin" ? "admin" : "user" });
      } catch (error) {
        if (!disposed && request === version.current)
          report(error.message, true);
      } finally {
        if (!disposed && request === version.current) setAuthLoading(false);
      }
    }
    db.auth.getSession().then(({ data, error }) => {
      if (!disposed && !sessionInitialized) {
        sessionInitialized = true;
        if (error) report(error.message, true);
        resolve(data.session);
      }
    });
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event, session) => {
      // Defer database calls until Supabase releases its auth lock.
      setTimeout(() => {
        if (!disposed && !(event === "INITIAL_SESSION" && sessionInitialized)) {
          sessionInitialized = true;
          resolve(session);
        }
      }, 0);
      if (event === "PASSWORD_RECOVERY")
        setModal({ kind: "auth", mode: "reset" });
    });
    refresh();
    const reconnect = () => refresh();
    window.addEventListener("online", reconnect);
    return () => {
      disposed = true;
      version.current++;
      subscription.unsubscribe();
      window.removeEventListener("online", reconnect);
    };
  }, [refresh]);
  const run = async (task) => {
    try {
      await task();
    } catch (error) {
      report(error.message || String(error), true);
    }
  };
  const copy = (text) =>
    run(async () => {
      await navigator.clipboard.writeText(text);
      report(t("Copied to clipboard.", "কপি করা হয়েছে।"));
    });
  const mutate = async (query, message) => {
    const { data, error } = await query.select("id").single();
    if (error) throw error;
    if (!data?.id)
      throw new Error(
        t(
          "The change was not applied. Please refresh and try again.",
          "পরিবর্তন হয়নি। রিফ্রেশ করে আবার চেষ্টা করুন।",
        ),
      );
    setModal(null);
    report(message);
    await refresh();
  };
  return (
    <Context.Provider
      value={{
        accountingMonth,
        lang,
        setLang,
        t,
        money,
        monthLabel,
        user,
        profile,
        isAdmin: profile?.role === "admin",
        authLoading,
        fund,
        donors,
        loading,
        stale,
        status,
        report,
        modal,
        setModal,
        refresh,
        run,
        copy,
        mutate,
      }}
    >
      {children}
    </Context.Provider>
  );
}
