// lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase environment variables:",
    {
      hasUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
    }
  );
}

export const supabase = createBrowserClient(
  supabaseUrl || "",
  supabaseAnonKey || ""
);
