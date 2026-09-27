import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase environment variables are missing.");
}

const parsedSupabaseUrl = new URL(supabaseUrl);
if (parsedSupabaseUrl.pathname !== "/" || !["https:", "http:"].includes(parsedSupabaseUrl.protocol)) {
  throw new Error("VITE_SUPABASE_URL must be the Supabase project API URL (for example, https://<project-ref>.supabase.co), not a dashboard URL.");
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
