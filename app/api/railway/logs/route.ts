/**
 * Railway Log Streaming Endpoint
 * Railway server can POST logs here for real-time monitoring
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// In-memory log store (in production, use Redis or database)
const logs: Array<{
  id: string;
  timestamp: string;
  level: string;
  message: string;
  metadata?: any;
}> = [];

// Keep only last 1000 logs
const MAX_LOGS = 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { level = "info", message, metadata } = body;

    const logEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      message: String(message || ""),
      metadata: metadata || {},
    };

    logs.push(logEntry);
    
    // Keep only recent logs
    if (logs.length > MAX_LOGS) {
      logs.shift();
    }

    console.log(`[Railway Log] [${level.toUpperCase()}] ${message}`, metadata);

    return NextResponse.json({ success: true, id: logEntry.id });
  } catch (error: any) {
    console.error("[Railway Logs] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to store log" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const level = searchParams.get("level");
    const limit = parseInt(searchParams.get("limit") || "100");
    const since = searchParams.get("since");

    let filteredLogs = [...logs];

    // Filter by level
    if (level) {
      filteredLogs = filteredLogs.filter((log) => log.level === level);
    }

    // Filter by timestamp
    if (since) {
      const sinceDate = new Date(since);
      filteredLogs = filteredLogs.filter(
        (log) => new Date(log.timestamp) >= sinceDate
      );
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Limit results
    const limitedLogs = filteredLogs.slice(0, limit);

    return NextResponse.json({
      logs: limitedLogs,
      total: filteredLogs.length,
      count: limitedLogs.length,
    });
  } catch (error: any) {
    console.error("[Railway Logs] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch logs" },
      { status: 500 }
    );
  }
}
