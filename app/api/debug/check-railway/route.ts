/**
 * Diagnostic endpoint to check Railway Media Stream server status
 * GET /api/debug/check-railway
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const railwayUrl = process.env.RAILWAY_WEBSOCKET_URL || "wss://motivated-perfection-production.up.railway.app";
    const healthUrl = railwayUrl.replace("wss://", "https://").replace("ws://", "http://") + "/health";

    console.log("[Debug] Checking Railway server:", healthUrl);

    const startTime = Date.now();
    let healthCheck: Response | null = null;
    let error: string | null = null;

    try {
      healthCheck = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
    } catch (fetchError: any) {
      error = fetchError.message || "Unknown error";
    }

    const responseTime = Date.now() - startTime;

    const result = {
      railwayUrl,
      healthUrl,
      reachable: healthCheck !== null,
      status: healthCheck?.status || null,
      statusText: healthCheck?.statusText || null,
      responseTime: `${responseTime}ms`,
      error: error || null,
      timestamp: new Date().toISOString(),
    };

    if (healthCheck?.ok) {
      try {
        const healthData = await healthCheck.json();
        return NextResponse.json({
          ...result,
          healthData,
          status: "✅ Railway server is reachable and healthy",
        });
      } catch (parseError) {
        return NextResponse.json({
          ...result,
          status: "⚠️ Railway server responded but response is not JSON",
        });
      }
    } else {
      return NextResponse.json({
        ...result,
        status: "❌ Railway server is not reachable or unhealthy",
        recommendation: "Check Railway deployment logs and ensure the server is running",
      });
    }
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      status: "❌ Error checking Railway server",
      timestamp: new Date().toISOString(),
    });
  }
}
