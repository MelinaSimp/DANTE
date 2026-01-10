import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint to show ALL environment variables (safe version)
 * GET /api/debug/all-env
 */
export async function GET() {
  // Get all env vars but only show safe ones (not values)
  const allEnvKeys = Object.keys(process.env).sort();
  
  // Categorize env vars
  const vapiVars = allEnvKeys.filter(k => k.toUpperCase().includes('VAPI'));
  const retellVars = allEnvKeys.filter(k => k.toUpperCase().includes('RETELL'));
  const openaiVars = allEnvKeys.filter(k => k.toUpperCase().includes('OPENAI'));
  const elevenlabsVars = allEnvKeys.filter(k => k.toUpperCase().includes('ELEVEN'));
  const twilioVars = allEnvKeys.filter(k => k.toUpperCase().includes('TWILIO'));
  const vercelVars = allEnvKeys.filter(k => k.toUpperCase().includes('VERCEL'));
  const nextVars = allEnvKeys.filter(k => k.toUpperCase().includes('NEXT'));
  
  // Check specific keys
  const importantKeys = {
    VAPI_API_KEY: {
      exists: !!process.env.VAPI_API_KEY,
      length: process.env.VAPI_API_KEY?.length || 0,
      prefix: process.env.VAPI_API_KEY?.substring(0, 10) || "N/A",
    },
    RETELL_API_KEY: {
      exists: !!process.env.RETELL_API_KEY,
      length: process.env.RETELL_API_KEY?.length || 0,
      prefix: process.env.RETELL_API_KEY?.substring(0, 10) || "N/A",
    },
    OPENAI_API_KEY: {
      exists: !!process.env.OPENAI_API_KEY,
      length: process.env.OPENAI_API_KEY?.length || 0,
      prefix: process.env.OPENAI_API_KEY?.substring(0, 7) || "N/A",
    },
  };
  
  return NextResponse.json({
    totalEnvVars: allEnvKeys.length,
    importantKeys,
    categorized: {
      vapi: vapiVars,
      retell: retellVars,
      openai: openaiVars,
      elevenlabs: elevenlabsVars,
      twilio: twilioVars,
      vercel: vercelVars,
      next: nextVars,
    },
    allKeys: allEnvKeys,
    nodeEnv: process.env.NODE_ENV,
    vercelUrl: process.env.VERCEL_URL,
    vercelEnv: process.env.VERCEL_ENV,
    deploymentUrl: process.env.VERCEL_URL,
  });
}
