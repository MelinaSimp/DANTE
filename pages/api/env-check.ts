import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

  res.status(200).json({
    supabase: {
      url: NEXT_PUBLIC_SUPABASE_URL || null,
      hasAnon: !!NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRole: !!SUPABASE_SERVICE_ROLE,
    },
    webhooks: {
      publicBaseUrl: PUBLIC_BASE_URL || null,
    },
  });
}
