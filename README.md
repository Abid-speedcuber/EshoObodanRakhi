# Esho Obodan Rakhi

The original application is archived in `legacy/`. The React application lives in `main/` and includes only community funds, blood donation, authentication, and user/admin access management. Repository metadata stays at the root.

```sh
cd main
npm install
npm run dev
```

Production: `npm run build`. Tests: `npm test`. Firebase serves `main/dist`; the root workflow builds and tests before deployment. The rewritten website has not been deployed to Firebase.

**Supabase setup complete for the existing project (2026-10-11).** The role/profile migration has been applied to `kszhmrhlsoqfxkcopvoe`: roles are limited to user/admin, signup automatically creates profiles, and profile/role permissions are secured. The legacy `"Email"` column was normalized to `email`, preserving its values. Existing admins, login accounts, fund and donor records are preserved. Missing profiles for eight existing login accounts were repaired. Production and local authentication redirects are configured. For another existing installation, run [the SQL Editor version](main/supabase/001_user_admin_roles.sql), or apply the versioned CLI migration.

The existing public Supabase URL and anonymous browser key are retained. Override with `main/.env` using `main/.env.example` if needed; never use a service-role key in the app. Google and email sign-in are configured. Phone signup remains disabled in the hosted project; enabling it requires an SMS provider.

See [main/README.md](main/README.md) for the feature checklist and implementation details.

## Supabase CLI

The CLI is installed as a development dependency in `main/`. Run it with `npm run supabase -- <command>` from that directory. The local CLI configuration is in `main/supabase/config.toml`, and the versioned role migration is in `main/supabase/migrations/20261011003100_user_admin_roles.sql`. The original SQL Editor copy is retained for manual setup.

Sign in with `npm run supabase:login`. The CLI is signed in and linked to the existing project. For a fresh checkout, link it with `npm run supabase:link`. Inspect pending migrations with `npm run supabase:db-dry-run` and redirect configuration with `npm run supabase:config-diff`. CLI credentials are managed by Supabase outside the repository; local link state and private pre-migration snapshots are ignored by Git. The `production` remote in `config.toml` declares only the hosted redirect settings. Other provider and database settings are left undeclared. The CLI manages this existing hosted database; no Docker stack was installed or started.
