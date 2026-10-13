# React app

React + Vite + Supabase. The interface preserves the original narrow layout, green header, icons, stacked panels, compact donor cards, search toggle, settings, and forms using plain CSS (no Tailwind). Run commands inside this directory.

- `npm run dev` — local development
- `npm run build` — production bundle in `dist/`
- `npm run preview` — serve production build
- `npm test` — fund logic, date boundaries, authentication normalization
- `npm run test:browser` — public, user, admin, mobile and failed-write flows with a mocked backend
- `npm run test:offline` — production offline reload and migration from legacy caches (run `npm run build` first)

Browser tests use Playwright Chromium. Install it with `npx playwright install chromium`, or set `CHROME_PATH` to an existing Chrome executable. Tests do not create or change live Supabase records.

## Ported functionality

**Fund:** monthly collection/Sadakah lists; previous/next controls and swipe navigation (June 2017 through current month); collection totals including current month; public Sadakah history; totals from fund versus dedicated contributions; monthly economy and cumulative balance, excluding current-month regular collections until Bangladesh month end; dedicated collections stored with their donation, charging only the donation shortfall to the main fund; annual income/expense/balance line chart with selectable values; complete history in yearly brief or all-time elaborate mode with opening/closing balances, dedicated pairs first, donations next, and closed-month regular collections last; copy collection text including admin contribution text; copy the full current-year history as a PNG; Nagad/bKash donation numbers with copy; admin entry create/edit/delete, highlighting, additional details with safe clickable URLs and preserved line breaks, and independent display/calculation flags.

**Blood:** searchable donor directory by name, phone, location and group; all eight blood groups; available donors first; randomized ordering for public browsing; donor phone calls and copying; own profile create/edit/delete; admin profile create/edit/delete; last donation date; automatic 100-day pause after donation.

**Accounts:** email/phone signup and password login; Google OAuth; phone code verification; email reset and new password form; session persistence; admin search and user/admin role changes with consequences and confirmation. The SQL migration converts existing non-admin roles to user. No service-role browser access or auth admin API calls.

**Shared:** responsive layout, Bangla/English UI, refresh and reconnect, cached public fund/donor data with a stale-data banner, installable PWA and offline application shell. The production service worker keeps authentication/API responses out of its cache and replaces the original worker at `/serviceWorker.js`. Writes require a server connection and are never reported successful before Supabase confirms them.

Notes, activity feeds, notification inboxes, messaging, and student/moderator options are absent. Supabase records for archived features are preserved.

## Database

The dedicated-collection migration `20261012090000_dedicated_collections.sql` was applied on 2026-10-12. It adds `is_dedicated` and `dedicated_donation` without changing existing record values. Apply both versioned migrations for another installation.

The existing hosted project was configured on 2026-10-11, and `supabase/migrations/20261011003100_user_admin_roles.sql` is recorded as applied. For another existing installation, run the SQL Editor copy at `supabase/001_user_admin_roles.sql`, or apply the versioned migration through the CLI. The migration also normalizes the legacy capitalized `"Email"` column and repairs missing account profiles. See the repository README for provider/redirect setup. Fund and donor column names and inverse boolean semantics match the original database: **false/null means enabled** for `is_display` and `is_calculation`. Row-level security remains the authority for all writes; cached roles never grant admin access.

`src/domain.js` holds calculations shared by the monthly ledger, overview and history. `src/context.jsx` handles authentication, profile loading and public data caching. `src/components/` holds the React views and forms.

## Supabase CLI

- `npm run supabase -- <command>` — run the installed CLI
- `npm run supabase:login` — sign in on a new machine
- `npm run supabase:link` — link to the existing project
- `npm run supabase:db-dry-run` — inspect pending migrations
- `npm run supabase:db-push` — apply reviewed migrations
- `npm run supabase:config-diff` — inspect hosted redirect settings

The CLI is already authenticated and linked on this machine. `supabase/config.toml` contains a production remote with only the hosted redirect settings declared. Provider credentials are kept out of repository files. Private snapshots and a rollback SQL file are saved under the Git-ignored `supabase/.backups/20261011-before-role-migration/`. SQL permission checks used temporary records and rolled back all validation writes.

Google and email sign-in are configured. Phone signup is disabled in the hosted project and needs an SMS provider before it can be enabled. No Docker stack was installed or started; this migration extends the existing hosted schema.

## Fund accounting

Regular collections remain visible in the monthly collection list, but are excluded from the available balance and complete history until their month closes in Asia/Dhaka. History lists dedicated pairs first, ordinary fund donations next, and released regular collections last. The current month shows donations and the resulting balance without a regular collection line. The same rule applies to copied history and the yearly chart.

A dedicated collection is one income record with `is_dedicated=true`, `amount` equal to the amount collected, and `dedicated_donation` equal to the total donated. Neither full amount becomes ordinary fund income/expense. The fund contributes `max(dedicated_donation - amount, 0)`, immediately in that entry's month. Surplus dedicated money stays outside the main fund. Editing and deleting the single record updates/removes the paired donation too; converting it to a regular collection clears the paired donation. Existing standalone Sadakah entries retain their display/calculation flags and are not automatically paired with collections.

## History image copy

The history Copy button puts a PNG on the clipboard instead of text. It always captures the complete current year, including its opening balance, whether the dialog is in Yearly Brief or Elaborate mode. It renders at a fixed 480-pixel reading width and natural full height, normally at double resolution, without dialog controls, scroll clipping, or a dependency on the device's screen size. Very large exports scale down to stay within canvas limits. Bangla labels and shaped text are preserved. Dedicated pairs use the same plain rows as other history entries; their monthly cards retain their styling.

If the browser cannot write images to the clipboard or rejects permission, the same PNG downloads as `eor-fund-history-YEAR.png`. Collection Copy List and phone-number copying remain text.
