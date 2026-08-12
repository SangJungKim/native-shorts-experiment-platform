import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseEnvironment = Boolean(supabaseUrl && supabaseKey);

export const supabase = createClient(
  supabaseUrl ?? "http://127.0.0.1:54321",
  supabaseKey ?? "missing-public-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
