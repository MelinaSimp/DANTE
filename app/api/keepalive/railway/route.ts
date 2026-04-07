/**
 * Railway Keep-Alive Endpoint
 * GET /api/keepalive/railway
 * 
 * This endpoint pings Railway Media Stream server to keep it active.
 * Called by Vercel Cron every 10 minutes to prevent Railway from stopping.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const railwayUrl = process.env.RAILWAY_WEBSOCKET_URL || "wss://motivated-perfection-production.up.railway.app";
    const healthUrl = railwayUrl.replace("wss://", "https://").replace("ws://", "http://") + "/health";

    console.log("[Keep-Alive] Pinging Railway server:", healthUrl);

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

    if (healthCheck?.ok) {
      try {
        const healthData = await healthCheck.json();
        console.log("[Keep-Alive] Railway server is active:", healthData);
        
        return NextResponse.json({
          success: true,
          message: "Railway server is active",
          railwayUrl,
          healthUrl,
          responseTime: `${responseTime}ms`,
          healthData,
          timestamp: new Date().toISOString(),
        });
      } catch (parseError) {
        return NextResponse.json({
          success: true,
          message: "Railway server responded (not JSON)",
          railwayUrl,
          healthUrl,
          responseTime: `${responseTime}ms`,
          status: healthCheck.status,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      console.warn("[Keep-Alive] Railway server is not reachable:", {
        status: healthCheck?.status,
        error,
      });
      
      return NextResponse.json({
        success: false,
        message: "Railway server is not reachable",
        railwayUrl,
        healthUrl,
        responseTime: `${responseTime}ms`,
        status: healthCheck?.status || null,
        error: error || null,
        timestamp: new Date().toISOString(),
      }, { status: 503 });
    }
  } catch (error: any) {
    console.error("[Keep-Alive] Error pinging Railway:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
