/**
 * Railway Test Endpoint
 * Test Railway connectivity and trigger test actions
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, testData } = body;

    const railwayUrl = process.env.RAILWAY_WEBSOCKET_URL || "wss://motivated-perfection-production.up.railway.app";
    const healthUrl = railwayUrl.replace("wss://", "https://").replace("ws://", "http://") + "/health";
    const apiUrl = railwayUrl.replace("wss://", "https://").replace("ws://", "http://");

    switch (action) {
      case "health_check":
        try {
          const startTime = Date.now();
          const response = await fetch(healthUrl, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
          });
          const responseTime = Date.now() - startTime;
          const data = response.ok ? await response.json() : null;

          return NextResponse.json({
            success: response.ok,
            status: response.status,
            responseTime: `${responseTime}ms`,
            data,
            timestamp: new Date().toISOString(),
          });
        } catch (error: any) {
          return NextResponse.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          }, { status: 503 });
        }

      case "test_connection":
        // Test if we can reach Railway
        try {
          const response = await fetch(healthUrl, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
          });
          
          return NextResponse.json({
            success: response.ok,
            message: response.ok 
              ? "✅ Railway is reachable" 
              : "❌ Railway is not reachable",
            status: response.status,
            url: healthUrl,
          });
        } catch (error: any) {
          return NextResponse.json({
            success: false,
            message: "❌ Cannot reach Railway",
            error: error.message,
            url: healthUrl,
          }, { status: 503 });
        }

      case "trigger_greeting":
        // Test if Railway can call back to Vercel
        if (!testData?.conversationId) {
          return NextResponse.json(
            { error: "conversationId required" },
            { status: 400 }
          );
        }

        // This would trigger Railway to send a test greeting
        // For now, just verify the endpoint exists
        return NextResponse.json({
          success: true,
          message: "Greeting trigger endpoint ready",
          conversationId: testData.conversationId,
        });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("[Railway Test] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute test" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const railwayUrl = process.env.RAILWAY_WEBSOCKET_URL || "wss://motivated-perfection-production.up.railway.app";
  const healthUrl = railwayUrl.replace("wss://", "https://").replace("ws://", "http://") + "/health";

  return NextResponse.json({
    railwayUrl,
    healthUrl,
    availableActions: [
      "health_check",
      "test_connection",
      "trigger_greeting",
    ],
    usage: "POST with { action: 'action_name', testData: {...} }",
  });
}
