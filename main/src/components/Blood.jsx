import { useMemo, useState } from "react";
import { useApp } from "../context";
import { GROUPS, isAvailable, donationDays, shuffle } from "../domain";
import { Empty, Highlight, Icon } from "./UI";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const search = query.trim();
  const ordered = useMemo(
    () => (isAdmin ? [...donors] : shuffle(donors)),
    [donors, isAdmin],
  );
  const filtered = ordered
    .filter(
      (d) =>
        (group === "all" || d.blood_group === group) &&
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
      <section className="panel blood-heading">
        <div className="panel-title">
          <h1>{t("Blood Donors", "রক্তদাতা")}</h1>
          {user && (
            <button
              className="primary"
              disabled={authLoading || !profile}
              onClick={() =>
                setModal({ kind: "donor", row: isAdmin ? null : myProfile })
              }
            >
              {isAdmin
                ? t("Add Donor", "রক্তদাতা যোগ করুন")
                : t("My Profile", "আমার প্রোফাইল")}
            </button>
          )}
        </div>
        {!isAdmin && !myProfile && (
          <div className="info-banner">
            {user
              ? t(
                  "To be a blood donor, click on My Profile and add phone and location.",
                  "রক্তদাতা হতে আমার প্রোফাইলে ক্লিক করে ফোন ও লোকেশন যোগ করুন।",
                )
              : t(
                  "To be a blood donor, login and complete your donor profile.",
                  "রক্তদাতা হতে লগইন করে আপনার প্রোফাইল সম্পূর্ণ করুন।",
                )}
          </div>
        )}
      </section>
      <div className="donor-filters panel">
        {searchOpen ? (
          <>
            <input
              autoFocus
              aria-label={t("Search donors", "রক্তদাতা খুঁজুন")}
              placeholder={t("Search donors…", "রক্তদাতা খুঁজুন…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                if (!query) setSearchOpen(false);
              }}
            />
            <button
              aria-label={t("Clear search", "মুছুন")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
              }}
            >
              <Icon name="close" size={20} />
            </button>
          </>
        ) : (
          <>
            <select
              aria-label={t("Blood group", "রক্তের গ্রুপ")}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="all">
                {t("All Blood Groups", "সব রক্তের গ্রুপ")}
              </option>
              {GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
            <button
              className="primary"
              aria-label={t("Search donors", "রক্তদাতা খুঁজুন")}
              onClick={() => setSearchOpen(true)}
            >
              <Icon name="search" size={20} />
            </button>
          </>
        )}
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
                <div>
                  <h2>
                    <Highlight text={donor.name} query={search} />
                    {!available && (
                      <span className="not-available">
                        {" "}
                        {t("(not available)", "(অ্যাভেইলেবল নয়)")}
                      </span>
                    )}
                  </h2>
                  <p className="location">
                    <Icon name="location" />
                    <Highlight text={donor.location} query={search} />
                  </p>
                  {donor.last_donated && (
                    <div className="donation-date">
                      {t("Last donated:", "শেষ রক্তদান:")}{" "}
                      {new Date(
                        `${donor.last_donated}T00:00:00`,
                      ).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {days < 100 && (
                        <span className="days-ago">
                          {" "}
                          ({days} {t("days ago", "দিন আগে")})
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <strong className="blood-badge">
                  <Highlight text={donor.blood_group} query={search} />
                </strong>
              </div>
              <div className="donor-contact">
                <a href={`tel:${donor.phone}`}>
                  <Icon name="call" />
                  <Highlight text={donor.phone} query={search} />
                </a>
                <div className="actions">
                  <button
                    className="copy-list"
                    aria-label={t("Copy phone number", "ফোন নম্বর কপি")}
                    onClick={() => copy(donor.phone)}
                  >
                    <Icon name="copy" />
                  </button>
                  {isAdmin && (
                    <button
                      className="edit-donor"
                      aria-label={t("Edit donor", "রক্তদাতা এডিট")}
                      onClick={() => setModal({ kind: "donor", row: donor })}
                    >
                      <Icon name="edit" />
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <Empty>
          {loading
            ? t("Loading donors…", "রক্তদাতা লোড হচ্ছে…")
            : t("No donors found", "কোনো রক্তদাতা পাওয়া যায়নি")}
        </Empty>
      )}
    </>
  );
}
