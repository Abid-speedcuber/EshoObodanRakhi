import { useMemo, useState } from "react";
import {
  Search,
  MapPin,
  Phone,
  Copy,
  Pencil,
  Plus,
  Droplets,
} from "lucide-react";
import { useApp } from "../context";
import { GROUPS, isAvailable, donationDays, shuffle } from "../domain";
import { Empty, Highlight } from "./UI";
export default function Blood() {
  const {
    t,
    donors,
    user,
    profile,
    authLoading,
    isAdmin,
    setModal,
    copy,
    loading,
  } = useApp();
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const search = query.trim();
  const ordered = useMemo(
    () => (isAdmin ? [...donors] : shuffle(donors)),
    [donors, isAdmin],
  );
  const filtered = ordered
    .filter(
      (d) =>
        (group === "all" || d.blood_group === group) &&
        (!availableOnly || isAvailable(d)) &&
        [d.name, d.phone, d.location, d.blood_group].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(search.toLowerCase()),
        ),
    )
    .sort(
      (a, b) =>
        Number(isAvailable(b)) - Number(isAvailable(a)) ||
        (search || isAdmin ? a.name.localeCompare(b.name) : 0),
    );
  const myProfile = donors.find((d) => d.user_id === user?.id);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {t(
              "A connection that can save a life",
              "একটি যোগাযোগ বাঁচাতে পারে জীবন",
            )}
          </span>
          <h1>{t("Find a blood donor", "রক্তদাতা খুঁজুন")}</h1>
          <p>
            {t(
              "Find someone nearby. Reach out directly. Make a difference.",
              "কাছের রক্তদাতা খুঁজুন। সরাসরি যোগাযোগ করুন। অবদান রাখুন।",
            )}
          </p>
        </div>
        <button
          className="primary"
          disabled={authLoading || (user && !profile)}
          onClick={() =>
            setModal(
              user
                ? { kind: "donor", row: isAdmin ? null : myProfile }
                : { kind: "auth", mode: "login" },
            )
          }
        >
          {isAdmin ? <Plus size={18} /> : <Droplets size={18} />}
          {isAdmin
            ? t("Add donor", "রক্তদাতা যোগ করুন")
            : myProfile
              ? t("My donor profile", "আমার ডোনার প্রোফাইল")
              : t("Become a donor", "রক্তদাতা হোন")}
        </button>
      </div>
      {!isAdmin && !myProfile && (
        <div className="info-banner">
          <Droplets size={22} />
          <div>
            <strong>
              {t(
                "Your small act could be someone’s second chance.",
                "আপনার ছোট অবদান হতে পারে কারও নতুন জীবন।",
              )}
            </strong>
            <p>
              {t(
                "Sign in and add your phone number, blood group, and location to join the donor directory.",
                "লগইন করে ফোন নম্বর, রক্তের গ্রুপ ও লোকেশন দিয়ে রক্তদাতার তালিকায় যোগ দিন।",
              )}
            </p>
          </div>
        </div>
      )}
      <div className="donor-filters">
        <label className="search-field">
          <Search size={18} />
          <span className="sr-only">
            {t("Search donors", "রক্তদাতা খুঁজুন")}
          </span>
          <input
            placeholder={t(
              "Search name, location, phone…",
              "নাম, লোকেশন, ফোন দিয়ে খুঁজুন…",
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">{t("Blood group", "রক্তের গ্রুপ")}</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="all">
              {t("All blood groups", "সব রক্তের গ্রুপ")}
            </option>
            {GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
          />
          {t("Available only", "শুধু অ্যাভেইলেবল")}
        </label>
        {(query || group !== "all" || availableOnly) && (
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setGroup("all");
              setAvailableOnly(false);
            }}
          >
            {t("Clear", "মুছুন")}
          </button>
        )}
      </div>
      <div className="result-count">
        <strong>
          {filtered.length} {t("donors", "রক্তদাতা")}
        </strong>
        <span>
          <span className="dot green-dot" />
          {t(
            "Available donors appear first",
            "অ্যাভেইলেবল রক্তদাতা আগে দেখানো হচ্ছে",
          )}
        </span>
      </div>
      <div className="donor-grid">
        {filtered.map((donor) => {
          const available = isAvailable(donor);
          const days = donationDays(donor);
          return (
            <article
              className={`donor-card ${available ? "" : "unavailable"}`}
              key={donor.id}
            >
              <div className="donor-top">
                <span className={`availability ${available ? "yes" : ""}`}>
                  <span className="dot" />
                  {available
                    ? t("Available", "অ্যাভেইলেবল")
                    : t("Not available", "অ্যাভেইলেবল নয়")}
                </span>
                <span className="blood-badge">
                  <Highlight text={donor.blood_group} query={search} />
                </span>
              </div>
              <h2>
                <Highlight text={donor.name} query={search} />
              </h2>
              <p className="location">
                <MapPin size={16} />
                <Highlight text={donor.location} query={search} />
              </p>
              {donor.created_by_admin && (
                <small className="admin-added">
                  {t("Added by admin", "অ্যাডমিন যুক্ত করেছেন")}
                </small>
              )}
              <div className="donation-date">
                {donor.last_donated ? (
                  <>
                    {t("Last donated:", "শেষ রক্তদান:")}{" "}
                    {new Date(
                      `${donor.last_donated}T00:00:00`,
                    ).toLocaleDateString("en-GB")}
                    {days < 100 && (
                      <small>
                        {t(
                          `${Math.max(0, 100 - days)} days until available`,
                          `অ্যাভেইলেবল হতে ${Math.max(0, 100 - days)} দিন বাকি`,
                        )}
                      </small>
                    )}
                  </>
                ) : (
                  t(
                    "Last donation not recorded",
                    "শেষ রক্তদানের তারিখ দেওয়া হয়নি",
                  )
                )}
              </div>
              <div className="donor-contact">
                <a href={`tel:${donor.phone}`}>
                  <Phone size={16} />
                  <Highlight text={donor.phone} query={search} />
                </a>
                <div className="actions">
                  <button
                    className="icon-button"
                    aria-label={t("Copy phone number", "ফোন নম্বর কপি")}
                    onClick={() => copy(donor.phone)}
                  >
                    <Copy size={16} />
                  </button>
                  {(isAdmin || user?.id === donor.user_id) && (
                    <button
                      className="icon-button"
                      aria-label={t("Edit donor", "রক্তদাতা এডিট")}
                      onClick={() => setModal({ kind: "donor", row: donor })}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <section className="panel">
          <Empty>
            {loading
              ? t("Loading donors…", "রক্তদাতা লোড হচ্ছে…")
              : t(
                  "No donors found. Try another group or location.",
                  "কোনো রক্তদাতা পাওয়া যায়নি। অন্য গ্রুপ বা লোকেশন চেষ্টা করুন।",
                )}
          </Empty>
        </section>
      )}
      <p className="directory-footnote">
        {t(
          "Availability automatically pauses for 100 days after a recorded donation.",
          "শেষ রক্তদানের পর ১০০ দিন অ্যাভেইলেবল স্ট্যাটাস বন্ধ থাকে।",
        )}
      </p>
    </>
  );
}
