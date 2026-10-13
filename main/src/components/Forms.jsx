import { useState } from "react";

import { db } from "../supabase";
import { useApp } from "../context";
import { GROUPS, currentDate, credentials, normalizeDigits } from "../domain";
import { Modal, Field, Icon } from "./UI";
function normalizeNumberInput(event) {
  const input = event.currentTarget;
  const normalized = normalizeDigits(input.value);
  if (normalized === input.value) return;
  const { selectionStart, selectionEnd } = input;
  input.value = normalized;
  if (selectionStart !== null)
    input.setSelectionRange(selectionStart, selectionEnd);
}
function useSubmission() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = (task) => async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await task(new FormData(event.currentTarget));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}
function FormError({ error }) {
  return (
    error && (
      <p className="form-error" role="alert">
        {error}
      </p>
    )
  );
}
export function AuthForm({ initialMode }) {
  const { t, setModal, report } = useApp();
  const [mode, setMode] = useState(initialMode || "login");
  const [show, setShow] = useState(false);
  const [info, setInfo] = useState("");
  const [phone, setPhone] = useState("");
  const { busy, error, submit } = useSubmission();
  const titles = {
    login: t("Login", "লগইন করুন"),
    signup: t("Sign Up", "সাইন আপ"),
    forgot: t("Forgot Password", "পাসওয়ার্ড ভুলে গেছেন"),
    reset: t("Set a new password", "নতুন পাসওয়ার্ড দিন"),
    verify: t("Verify your phone", "ফোন যাচাই করুন"),
  };
  async function handle(data) {
    const identity = credentials(String(data.get("identity") || ""));
    const password = data.get("password");
    if (mode === "signup" && password !== data.get("confirm"))
      throw new Error(t("Passwords do not match.", "পাসওয়ার্ড মিলছে না।"));
    let result;
    if (mode === "signup") {
      result = await db.auth.signUp({
        ...identity,
        password,
        options: {
          data: { name: data.get("name").trim() },
          emailRedirectTo: window.location.origin,
        },
      });
      if (result.error) throw result.error;
      if (result.data.session) {
        setModal(null);
        report(t("Account created.", "অ্যাকাউন্ট তৈরি হয়েছে।"));
      } else if (identity.phone) {
        setPhone(identity.phone);
        setMode("verify");
        setInfo(
          t(
            "Enter the verification code sent to your phone.",
            "ফোনে পাঠানো কোডটি দিন।",
          ),
        );
      } else {
        setInfo(
          t(
            "Check your email to activate your account, then sign in.",
            "ইমেইল থেকে অ্যাকাউন্ট চালু করে লগইন করুন।",
          ),
        );
        setMode("login");
      }
    } else if (mode === "login") {
      result = await db.auth.signInWithPassword({ ...identity, password });
      if (result.error) throw result.error;
      setModal(null);
    } else if (mode === "forgot") {
      result = await db.auth.resetPasswordForEmail(
        data.get("identity").trim(),
        { redirectTo: window.location.origin },
      );
      if (result.error) throw result.error;
      setInfo(
        t(
          "Check your email for a password reset link.",
          "পাসওয়ার্ড রিসেট লিঙ্কের জন্য ইমেইল দেখুন।",
        ),
      );
    } else if (mode === "verify") {
      result = await db.auth.verifyOtp({
        phone,
        token: data.get("token").trim(),
        type: "sms",
      });
      if (result.error) throw result.error;
      setModal(null);
    } else {
      if (password !== data.get("confirm"))
        throw new Error(t("Passwords do not match.", "পাসওয়ার্ড মিলছে না।"));
      result = await db.auth.updateUser({ password });
      if (result.error) throw result.error;
      setModal(null);
      report(t("Password updated.", "পাসওয়ার্ড আপডেট হয়েছে।"));
    }
  }
  return (
    <Modal title={titles[mode]} form>
      {info && (
        <p className="form-info" role="status">
          {info}
        </p>
      )}
      <form onSubmit={submit(handle)}>
        <fieldset disabled={busy}>
          {mode === "signup" && (
            <Field label={t("Full name", "পুরো নাম")}>
              <input name="name" required maxLength={120} autoComplete="name" />
            </Field>
          )}
          {["login", "signup", "forgot"].includes(mode) && (
            <Field
              label={
                mode === "forgot"
                  ? t("Email address", "ইমেইল")
                  : t("Email or phone number", "ইমেইল অথবা ফোন নম্বর")
              }
            >
              <input
                name="identity"
                type={mode === "forgot" ? "email" : "text"}
                required
                autoComplete="username"
                placeholder="you@example.com / 017…"
              />
            </Field>
          )}
          {["login", "signup", "reset"].includes(mode) && (
            <Field label={t("Password", "পাসওয়ার্ড")}>
              <div className="password-field">
                <input
                  name="password"
                  placeholder={t("Password", "পাসওয়ার্ড")}
                  type={show ? "text" : "password"}
                  required
                  minLength={mode === "login" ? 1 : 6}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t(
                    "Show or hide password",
                    "পাসওয়ার্ড দেখান বা লুকান",
                  )}
                  onClick={() => setShow(!show)}
                >
                  <Icon name={show ? "eye-slash" : "eye"} size={20} />
                </button>
              </div>
            </Field>
          )}
          {["reset", "signup"].includes(mode) && (
            <Field label={t("Confirm password", "পাসওয়ার্ড আবার দিন")}>
              <input
                name="confirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </Field>
          )}
          {mode === "verify" && (
            <>
              <Field label={t("Phone number", "ফোন নম্বর")}>
                <input
                  value={phone}
                  onChange={(e) => setPhone(normalizeDigits(e.target.value))}
                  required
                  type="tel"
                  onInput={normalizeNumberInput}
                />
              </Field>
              <Field label={t("Verification code", "যাচাই কোড")}>
                <input
                  name="token"
                  onInput={normalizeNumberInput}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              </Field>
            </>
          )}
          <FormError error={error} />
          {mode === "login" && (
            <button
              type="button"
              className="text-button centered"
              onClick={() => {
                setMode("forgot");
                setInfo("");
              }}
            >
              {t("Forgot password?", "পাসওয়ার্ড ভুলে গেছেন?")}
            </button>
          )}
          <button
            className={`primary full ${mode === "signup" ? "blue-button" : ""}`}
            type="submit"
          >
            {busy
              ? t("Please wait…", "অপেক্ষা করুন…")
              : mode === "login"
                ? t("Login", "লগইন")
                : mode === "signup"
                  ? t("Sign Up", "সাইন আপ")
                  : mode === "verify"
                    ? t("Verify", "যাচাই করুন")
                    : t("Continue", "এগিয়ে যান")}
          </button>
          {["login", "signup"].includes(mode) && (
            <>
              {mode === "login" && (
                <>
                  {" "}
                  <div className="divider">{t("or", "অথবা")}</div>
                  <button
                    className="secondary full"
                    type="button"
                    onClick={async () => {
                      const result = await db.auth.signInWithOAuth({
                        provider: "google",
                        options: { redirectTo: window.location.origin },
                      });
                      if (result.error) setInfo(result.error.message);
                    }}
                  >
                    <Icon name="google" size={18} />
                    {t("Continue with Google", "গুগল দিয়ে লগইন")}
                  </button>
                </>
              )}{" "}
              <p className="auth-switch">
                {mode === "login"
                  ? t("Don't have an account?", "অ্যাকাউন্ট নেই?")
                  : t("Already have an account?", "অ্যাকাউন্ট আছে?")}{" "}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setInfo("");
                  }}
                >
                  {mode === "login"
                    ? t("Sign Up", "সাইন আপ")
                    : t("Login", "লগইন")}
                </button>
              </p>
            </>
          )}
          {["forgot", "verify"].includes(mode) && (
            <button
              type="button"
              className="text-button centered"
              onClick={() => {
                setMode("login");
                setInfo("");
              }}
            >
              {t("Back to sign in", "লগইনে ফিরে যান")}
            </button>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
export function FundForm({ row }) {
  const { t, isAdmin, user, mutate, setModal } = useApp();
  const { busy, error, submit } = useSubmission();
  const expense = row.type === "expense";
  const [dedicated, setDedicated] = useState(Boolean(row.is_dedicated));
  const title = expense ? t("Sadakah", "সাদাকাহ") : t("Collection", "কালেকশন");
  return (
    <Modal
      title={`${row.id ? t("Edit", "এডিট") : t("Add", "যোগ করুন")} ${title}`}
      form
      footer={false}
    >
      <form
        onSubmit={submit(async (data) => {
          if (!isAdmin)
            throw new Error(
              t("Admin access required.", "অ্যাডমিন অনুমতি প্রয়োজন।"),
            );
          const amount = Number(normalizeDigits(data.get("amount")));
          if (
            !Number.isFinite(amount) ||
            (dedicated && !expense ? amount < 0 : amount <= 0)
          )
            throw new Error(t("Enter a positive amount.", "সঠিক পরিমাণ দিন।"));
          const payload = {
            month: data.get("month"),
            type: row.type,
            amount,
            highlighted: data.has("highlighted"),
            updated_by: user.id,
            ...(expense
              ? {
                  description: data.get("description").trim(),
                  additional_info: data.get("additional_info").trim(),
                  is_display: !data.has("display"),
                  is_calculation: !data.has("calculation"),
                }
              : {
                  name: data.get("name").trim(),
                  is_dedicated: dedicated,
                  dedicated_donation: dedicated
                    ? Number(normalizeDigits(data.get("dedicated_donation")))
                    : null,
                }),
          };
          if (
            !expense &&
            dedicated &&
            (!Number.isFinite(payload.dedicated_donation) ||
              payload.dedicated_donation < 0)
          )
            throw new Error(
              t("Enter a valid donation amount.", "অনুদানের সঠিক পরিমাণ দিন।"),
            );
          if (!(expense ? payload.description : payload.name))
            throw new Error(
              t("A name or title is required.", "নাম বা শিরোনাম দিন।"),
            );
          await mutate(
            row.id
              ? db.from("fund").update(payload).eq("id", row.id)
              : db.from("fund").insert(payload),
            t("Entry saved.", "এন্ট্রি সেভ হয়েছে।"),
          );
        })}
      >
        <fieldset disabled={busy}>
          <input type="hidden" name="month" value={row.month} />
          <Field
            label={
              expense
                ? t("Sadakah title", "সাদাকাহ শিরোনাম")
                : dedicated
                  ? t("Collection purpose", "বিষয় / উদ্দেশ্য")
                  : t("Contributor name", "অবদানকারীর নাম")
            }
          >
            <input
              name={expense ? "description" : "name"}
              defaultValue={row.name || row.description || ""}
              required
              maxLength={500}
            />
          </Field>
          <Field label={t("Amount (৳)", "পরিমাণ (৳)")}>
            <input
              name="amount"
              type="text"
              inputMode="decimal"
              onInput={normalizeNumberInput}
              pattern="(?:[0-9]+(?:\.[0-9]{1,2})?|\.[0-9]{1,2})"
              required
              defaultValue={row.amount ?? ""}
            />
          </Field>
          {!expense && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  name="dedicated"
                  checked={dedicated}
                  onChange={(event) => setDedicated(event.target.checked)}
                />
                {t("Dedicated collection", "বিষয় ভিত্তিক কালেকশন")}
              </label>
              {dedicated && (
                <Field
                  label={t(
                    "Donation on this collection (৳)",
                    "এই কালেকশনে অনুদান (৳)",
                  )}
                >
                  <input
                    name="dedicated_donation"
                    type="text"
                    inputMode="decimal"
                    onInput={normalizeNumberInput}
                    pattern="(?:[0-9]+(?:\.[0-9]{1,2})?|\.[0-9]{1,2})"
                    required
                    defaultValue={row.dedicated_donation ?? ""}
                  />
                </Field>
              )}
            </>
          )}
          {expense && (
            <Field label={t("Additional information", "আরও তথ্য")}>
              <textarea
                name="additional_info"
                rows={4}
                defaultValue={row.additional_info || ""}
              />
            </Field>
          )}
          {!expense && (
            <label className="check">
              <input
                name="highlighted"
                type="checkbox"
                defaultChecked={row.highlighted}
              />
              {t("Highlight this entry", "এই এন্ট্রি হাইলাইট করুন")}
            </label>
          )}
          {expense && (
            <details
              className="advanced"
              open={Boolean(
                row.highlighted || row.is_display || row.is_calculation,
              )}
            >
              <summary>{t("Advanced options", "আরও অপশন")}</summary>
              <label className="check">
                <input
                  name="highlighted"
                  type="checkbox"
                  defaultChecked={row.highlighted}
                />
                {t("Highlight this entry", "এই এন্ট্রি হাইলাইট করুন")}
              </label>
              {expense && (
                <>
                  <label className="check">
                    <input
                      name="display"
                      type="checkbox"
                      defaultChecked={!row.is_display}
                    />
                    {t("Show in Sadakah Tab", "সাদাকাহ তথ্যে দেখান")}
                  </label>
                  <label className="check">
                    <input
                      name="calculation"
                      type="checkbox"
                      defaultChecked={!row.is_calculation}
                    />
                    {t("Include in Calculations", "ফান্ডের হিসাব থেকে বাদ দিন")}
                  </label>
                </>
              )}
            </details>
          )}
          <FormError error={error} />
          <div className="actions form-actions">
            {" "}
            <button
              type="submit"
              className={expense ? "primary destructive" : "primary"}
            >
              {busy
                ? t("Saving…", "সেভ হচ্ছে…")
                : row.id
                  ? t("Save", "সেভ করুন")
                  : t("Add", "যোগ করুন")}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setModal(null)}
            >
              {t("Cancel", "বাতিল")}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function DonorForm({ row }) {
  const { t, isAdmin, user, profile, mutate, setModal } = useApp();
  const { busy, error, submit } = useSubmission();
  const [hasDate, setHasDate] = useState(Boolean(row?.last_donated));
  const today = currentDate();
  return (
    <Modal
      form
      title={
        isAdmin
          ? row?.id
            ? t("Edit blood donor", "রক্তদাতা এডিট")
            : t("Add blood donor", "রক্তদাতা যোগ করুন")
          : t("My donor profile", "আমার ডোনার প্রোফাইল")
      }
    >
      <form
        onSubmit={submit(async (data) => {
          if (!user || !profile || (row && !isAdmin && row.user_id !== user.id))
            throw new Error(
              t(
                "Please sign in to edit your profile.",
                "নিজের প্রোফাইল এডিট করতে লগইন করুন।",
              ),
            );
          const payload = {
            name: data.get("name").trim(),
            phone: normalizeDigits(data.get("phone").trim()),
            location: data.get("location").trim(),
            blood_group: data.get("blood_group"),
            available: data.has("available"),
            last_donated: hasDate ? data.get("last_donated") : null,
          };
          if (!payload.name || !payload.phone || !payload.location)
            throw new Error(
              t(
                "Complete all required fields.",
                "সব প্রয়োজনীয় তথ্য পূরণ করুন।",
              ),
            );
          if (!GROUPS.includes(payload.blood_group))
            throw new Error(
              t("Choose a blood group.", "রক্তের গ্রুপ নির্বাচন করুন।"),
            );
          const query = row?.id
            ? db.from("donors").update(payload).eq("id", row.id)
            : db.from("donors").insert({
                ...payload,
                user_id: isAdmin ? null : user.id,
                created_by_admin: isAdmin,
              });
          await mutate(
            query,
            t("Donor profile saved.", "ডোনার প্রোফাইল সেভ হয়েছে।"),
          );
        })}
      >
        <fieldset disabled={busy}>
          <Field label={t("Full name", "পুরো নাম")}>
            <input
              name="name"
              defaultValue={row?.name || (!isAdmin ? profile?.name : "")}
              required
              maxLength={120}
            />
          </Field>
          <Field label={t("Phone number", "ফোন নম্বর")}>
            <input
              name="phone"
              type="tel"
              onInput={normalizeNumberInput}
              defaultValue={row?.phone || ""}
              required
              pattern={"\\+?[0-9][0-9\\s\\-]{6,19}"}
              autoComplete="tel"
            />
          </Field>
          <div className="form-columns">
            <Field label={t("Blood group", "রক্তের গ্রুপ")}>
              <select
                name="blood_group"
                defaultValue={row?.blood_group || ""}
                required
              >
                <option value="">{t("Select group", "গ্রুপ নির্বাচন")}</option>
                {GROUPS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label={t("Location", "লোকেশন")}>
              <input
                name="location"
                defaultValue={row?.location || ""}
                required
                maxLength={200}
              />
            </Field>
          </div>
          <label className="check">
            <input
              name="available"
              type="checkbox"
              defaultChecked={row ? row.available : true}
            />
            {t("Available to donate", "রক্তদানে অ্যাভেইলেবল")}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={hasDate}
              onChange={(e) => setHasDate(e.target.checked)}
            />
            {t("Has donated before", "আগে রক্ত দিয়েছেন")}
          </label>
          {hasDate && (
            <Field label={t("Last donation date", "শেষ রক্তদানের তারিখ")}>
              <input
                name="last_donated"
                type="date"
                required
                max={today}
                defaultValue={row?.last_donated || ""}
              />
            </Field>
          )}
          <FormError error={error} />
          <div className="actions form-actions">
            {" "}
            <button type="submit" className="primary full">
              {busy ? t("Saving…", "সেভ হচ্ছে…") : t("Save", "সেভ করুন")}
            </button>
            {row?.id && (
              <button
                type="button"
                className="primary destructive"
                onClick={() =>
                  setModal({ kind: "delete", table: "donors", row })
                }
              >
                {t("Delete donor profile", "ডোনার প্রোফাইল মুছুন")}
              </button>
            )}
          </div>{" "}
        </fieldset>
      </form>
    </Modal>
  );
}
export function DeleteForm({ table, row }) {
  const { t, user, isAdmin, mutate, setModal } = useApp();
  const { busy, error, submit } = useSubmission();
  return (
    <Modal title={t("Confirm deletion", "মুছে ফেলা নিশ্চিত করুন")}>
      <p>
        {t("Permanently delete", "স্থায়ীভাবে মুছবেন")}{" "}
        <strong>{row.name || row.description}</strong>?
      </p>
      <form
        onSubmit={submit(async () => {
          if (!isAdmin && (table !== "donors" || row.user_id !== user?.id))
            throw new Error(t("Access denied.", "অনুমতি নেই।"));
          await mutate(
            db.from(table).delete().eq("id", row.id),
            t("Deleted.", "মুছে ফেলা হয়েছে।"),
          );
        })}
      >
        <FormError error={error} />
        <div className="actions">
          <button
            className="secondary"
            type="button"
            onClick={() => setModal(null)}
            disabled={busy}
          >
            {t("Cancel", "বাতিল")}
          </button>
          <button className="primary destructive" type="submit" disabled={busy}>
            {busy ? t("Deleting…", "মুছছে…") : t("Delete", "মুছুন")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
