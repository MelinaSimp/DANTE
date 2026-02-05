// lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Use placeholders when vars are missing so build (e.g. Railway) can complete.
// @supabase/ssr throws if URL/key are empty. Set NEXT_PUBLIC_* in env for real usage.
const url = supabaseUrl || "https://placeholder.supabase.co";
const key = supabaseAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase client using placeholders; set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for real usage."
  );
}

export const supabase = createBrowserClient(url, key);
