-- Run once in Supabase > SQL Editor. Keeps fund/donors and all historical data.
BEGIN;

-- The live legacy database uses a capitalized "Email" column.
-- Normalize the name while retaining existing values; other installations may
-- already have lowercase email or no email column at all.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='Email')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='email') THEN
    ALTER TABLE public.users RENAME COLUMN "Email" TO email;
  END IF;
END $$;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
UPDATE public.users u SET email = a.email FROM auth.users a WHERE u.id = a.id AND u.email IS NULL AND a.email IS NOT NULL;

UPDATE public.users SET role = 'user' WHERE role IS DISTINCT FROM 'admin' AND role IS DISTINCT FROM 'user';
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS eor_users_role_check;
ALTER TABLE public.users ADD CONSTRAINT eor_users_role_check CHECK (role IN ('user', 'admin'));

-- A dedicated helper avoids recursion through users' RLS policies.
CREATE OR REPLACE FUNCTION public.eor_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND role = 'admin'); $$;
REVOKE ALL ON FUNCTION public.eor_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eor_is_admin() TO authenticated;

-- Replace users policies: the old unrestricted INSERT policy allowed role spoofing.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
  LOOP EXECUTE format('DROP POLICY %I ON public.users', p.policyname); END LOOP;
END $$;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY eor_read_users ON public.users FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.eor_is_admin());
CREATE POLICY eor_create_own_user ON public.users FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()) AND role = 'user');
CREATE POLICY eor_admin_update_users ON public.users FOR UPDATE TO authenticated
  USING (public.eor_is_admin() AND id <> (SELECT auth.uid()))
  WITH CHECK (public.eor_is_admin() AND id <> (SELECT auth.uid()) AND role IN ('user','admin'));

-- Profile creation must work even when email/phone confirmation is required.
CREATE OR REPLACE FUNCTION public.eor_create_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'name',''), NULLIF(NEW.raw_user_meta_data->>'full_name',''), NEW.email, NEW.phone, 'User'), NEW.email, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.eor_create_user_profile() FROM PUBLIC;
DROP TRIGGER IF EXISTS eor_auth_user_profile ON auth.users;
CREATE TRIGGER eor_auth_user_profile AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.eor_create_user_profile();

-- Backfill accounts that never received a profile (including unconfirmed signups).
INSERT INTO public.users (id, name, email, role)
SELECT id, COALESCE(NULLIF(raw_user_meta_data->>'name',''), NULLIF(raw_user_meta_data->>'full_name',''), email, phone, 'User'), email, 'user'
FROM auth.users ON CONFLICT (id) DO NOTHING;
COMMIT;
