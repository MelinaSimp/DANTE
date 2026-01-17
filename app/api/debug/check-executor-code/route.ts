import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint to check which version of executor.ts is deployed
 * This checks if the problematic conversation_steps insert code is present
 */
export async function GET(req: NextRequest) {
  try {
    // Read the actual executor file to check its content
    const fs = await import("fs/promises");
    const path = await import("path");
    
    const executorPath = path.join(process.cwd(), "lib/agent-executor/executor.ts");
    const executorCode = await fs.readFile(executorPath, "utf-8");
    
    // Check for the problematic pattern
    const hasOldPattern = executorCode.includes(
      '.from("conversation_steps").insert({'
    ) && executorCode.includes('.catch((err: any) =>');
    
    // Check for the fix (removed code with comment)
    const hasFixComment = executorCode.includes(
      'Removed logging to conversation_steps table to avoid Supabase query builder issues'
    );
    
    // Count how many times conversation_steps appears
    const conversationStepsMatches = (executorCode.match(/conversation_steps/g) || []).length;
    
    // Get git commit info
    const { execSync } = await import("child_process");
    let gitCommit = "unknown";
    let gitMessage = "unknown";
    try {
      gitCommit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
      gitMessage = execSync("git log -1 --pretty=%B", { encoding: "utf-8" }).trim();
    } catch (e) {
      // Git info not available
    }
    
    return NextResponse.json({
      status: "ok",
      deployedVersion: {
        gitCommit: gitCommit.substring(0, 7),
        gitMessage: gitMessage.substring(0, 100),
      },
      codeCheck: {
        hasOldPattern: hasOldPattern,
        hasFixComment: hasFixComment,
        conversationStepsMentions: conversationStepsMatches,
        isFixed: !hasOldPattern && hasFixComment,
      },
      filePath: executorPath,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}