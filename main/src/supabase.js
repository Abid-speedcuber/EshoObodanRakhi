import { createClient } from "@supabase/supabase-js";
// Public browser key; access is enforced by Supabase row-level security.
export const db = createClient(
  import.meta.env.VITE_SUPABASE_URL ||
    "https://kszhmrhlsoqfxkcopvoe.supabase.co",
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzemhtcmhsc29xZnhrY29wdm9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5NjU5MTcsImV4cCI6MjA3NTU0MTkxN30.8TLXLfVbPiwtzpa_4wEYzC9Lfqm58Z7ICIaUQsa0izA",
);
