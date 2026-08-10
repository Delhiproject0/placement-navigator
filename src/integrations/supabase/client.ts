import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Without this the app white-screens on a missing .env with an opaque
// "supabaseUrl is required" thrown from inside createClient at module load.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.",
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Both required by the password-reset flow: the recovery link lands back
    // on /auth/update-password with the code in the URL, and PKCE is what
    // lets the client exchange it for a session.
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
