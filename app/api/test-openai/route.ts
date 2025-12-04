/**
 * Test endpoint to verify OpenAI API key is accessible
 * DELETE this file after testing
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { 
        error: "OPENAI_API_KEY not found",
        message: "Make sure OPENAI_API_KEY is set in your environment variables"
      },
      { status: 500 }
    );
  }

  // Test the API key by making a simple request
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "OpenAI API key is invalid or has no access",
          status: response.status,
          message: "Check your API key in OpenAI dashboard"
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "OpenAI API key is valid and accessible",
      keyPrefix: apiKey.substring(0, 7) + "...",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to test OpenAI API",
        message: error.message,
      },
      { status: 500 }
    );
  }
}










