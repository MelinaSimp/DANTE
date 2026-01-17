import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint to check which version of executor.ts is deployed
 * This verifies the fix for the Supabase insert error is live
 */
export async function GET(req: NextRequest) {
  try {
    // Try to import the executor to get its version
    let executorVersion = "unknown";
    let hasFixedCode = false;
    
    try {
      const executorModule = await import("@/lib/agent-executor/executor");
      executorVersion = (executorModule as any).EXECUTOR_VERSION || "unknown";
      hasFixedCode = executorVersion === "3.0-no-insert-catch";
    } catch (error: any) {
      return NextResponse.json({
        status: "error",
        error: "Could not import executor module",
        details: error.message,
      }, { status: 500 });
    }
    
    // Get git commit info (if available)
    let gitCommit = "unknown";
    let gitMessage = "unknown";
    try {
      const { execSync } = await import("child_process");
      gitCommit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim().substring(0, 7);
      gitMessage = execSync("git log -1 --pretty=%B", { encoding: "utf-8" }).trim().substring(0, 100);
    } catch (e) {
      // Git info not available in Vercel
    }
    
    return NextResponse.json({
      status: "ok",
      deployedCode: {
        executorVersion: executorVersion,
        hasFixedCode: hasFixedCode,
        fixApplied: hasFixedCode,
      },
      deployment: {
        gitCommit: gitCommit,
        gitMessage: gitMessage,
      },
      timestamp: new Date().toISOString(),
      checkResult: hasFixedCode 
        ? "✅ FIXED: Code version 3.0 is deployed - the Supabase insert error should be resolved"
        : "⚠️ OLD CODE: Version " + executorVersion + " is deployed - the fix may not be live yet",
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}