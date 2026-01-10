import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const vapiApiKey = process.env.VAPI_API_KEY;
  
  return NextResponse.json({
    vapiApiKeyExists: !!vapiApiKey,
    vapiApiKeyLength: vapiApiKey?.length || 0,
    vapiApiKeyPrefix: vapiApiKey?.substring(0, 10) || "N/A",
    allEnvKeys: Object.keys(process.env).filter(k => k.includes("VAPI") || k.includes("RETELL")),
    nodeEnv: process.env.NODE_ENV,
    vercelUrl: process.env.VERCEL_URL,
  });
}
