import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Minimal Vapi Test Endpoint
 * 
 * This endpoint returns the exact response format Vapi expects
 * Use this to test if Vapi will call your webhook during calls
 * 
 * Response format: { messages: [{ role: "assistant", content: "..." }] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[Vapi Test] Received:", JSON.stringify(body, null, 2));

    // Return minimal response in the exact format Vapi expects
    const response = {
      messages: [
        {
          role: "assistant",
          content: "Hi! How can I help you today?",
        },
      ],
    };

    console.log("[Vapi Test] Returning:", JSON.stringify(response, null, 2));
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[Vapi Test] Error:", error);
    return NextResponse.json(
      { 
        messages: [
          {
            role: "assistant",
            content: "I'm sorry, I encountered an error.",
          },
        ],
      },
      { status: 500 }
    );
  }
}
