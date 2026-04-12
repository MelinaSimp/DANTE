// app/api/integrations/[provider]/oauth/route.ts
// Handle OAuth flows for various providers

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { isOwner } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * OAuth callback handler
 * GET /api/integrations/[provider]/oauth
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // Should contain workspace_id
    const error = searchParams.get("error");
    
    // Check authentication
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.redirect(new URL("/auth?error=unauthorized", req.url));
    }
    
    // Get workspace and profile info
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id, is_superadmin, role")
      .eq("id", user.id)
      .single();
    
    if (!profile?.workspace_id) {
      return NextResponse.redirect(new URL("/auth?error=no_workspace", req.url));
    }
    
    if (error) {
      // Redirect to appropriate page based on user role
      const redirectPath = (profile?.is_superadmin || isOwner(profile?.role))
        ? "/admin"
        : "/home";

      return NextResponse.redirect(
        new URL(`${redirectPath}?error=oauth_${error}`, req.url)
      );
    }
    
    if (!code) {
      // Initiate OAuth flow
      return await initiateOAuthFlow(provider, profile.workspace_id, req);
    }
    
    // Exchange code for token
    return await handleOAuthCallback(provider, code, profile.workspace_id, user.id, req);
  } catch (error: any) {
    console.error("[OAuth] Error:", error);
    console.error("[OAuth] Error details:", {
      message: error.message,
      stack: error.stack,
      provider: error.provider || "unknown"
    });
    // Redirect to /home on error (can't check user role in catch block easily)
    return NextResponse.redirect(
      new URL(`/home?error=oauth_failed&message=${encodeURIComponent(error.message || "OAuth flow failed")}`, req.url)
    );
  }
}

/**
 * Initiate OAuth flow
 */
async function initiateOAuthFlow(
  provider: string,
  workspaceId: string,
  req: NextRequest
): Promise<NextResponse> {
  const baseUrl = req.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/integrations/${provider}/oauth`;
  const state = Buffer.from(JSON.stringify({ workspaceId })).toString("base64");
  
  let authUrl = "";
  
  switch (provider) {
    case "google": {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        console.error("[OAuth] GOOGLE_CLIENT_ID not configured in environment variables");
        // Redirect with a helpful error message - use /home as default
        return NextResponse.redirect(
          new URL("/home?error=oauth_config_missing&message=Google+OAuth+credentials+not+configured", req.url)
        );
      }
      
      const scopes = [
        "https://www.googleapis.com/auth/calendar", // Full calendar access (read + write)
        "https://www.googleapis.com/auth/spreadsheets.readonly"
      ].join(" ");
      
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${state}`;
      break;
    }
    
    case "microsoft": {
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      if (!clientId) {
        throw new Error("MICROSOFT_CLIENT_ID not configured");
      }
      
      const scopes = [
        "https://graph.microsoft.com/Calendars.Read",
        "https://graph.microsoft.com/Files.Read"
      ].join(" ");
      
      authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `state=${state}`;
      break;
    }
    
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
  
  return NextResponse.redirect(authUrl);
}

/**
 * Handle OAuth callback
 */
async function handleOAuthCallback(
  provider: string,
  code: string,
  workspaceId: string,
  userId: string,
  req: NextRequest
): Promise<NextResponse> {
  const baseUrl = req.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/integrations/${provider}/oauth`;
  
  let tokenData: any;
  
  switch (provider) {
    case "google": {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error("Google OAuth credentials not configured");
      }
      
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Google OAuth error: ${response.status}`);
      }
      
      tokenData = await response.json();
      break;
    }
    
    case "microsoft": {
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error("Microsoft OAuth credentials not configured");
      }
      
      const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Microsoft OAuth error: ${response.status}`);
      }
      
      tokenData = await response.json();
      break;
    }
    
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
  
  // Encrypt tokens (in production, use proper encryption)
  const encryptedToken = Buffer.from(tokenData.access_token).toString("base64");
  const encryptedRefresh = tokenData.refresh_token 
    ? Buffer.from(tokenData.refresh_token).toString("base64")
    : null;
  
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;
  
  // Store credentials
  await supabaseAdmin
    .from("integration_credentials")
    .upsert({
      workspace_id: workspaceId,
      integration_type: provider,
      provider: provider,
      encrypted_oauth_token: encryptedToken,
      encrypted_refresh_token: encryptedRefresh,
      token_expires_at: expiresAt,
      config: {},
    }, {
      onConflict: "workspace_id,integration_type,provider"
    });
  
  // Redirect to appropriate page based on user role
  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin, role")
    .eq("id", userId)
    .maybeSingle();

  // If superadmin or owner, redirect to admin page
  if (profile?.is_superadmin || isOwner(profile?.role)) {
    return NextResponse.redirect(new URL("/admin?success=oauth_connected", req.url));
  } else {
    // Regular user, redirect to the personalized home hub
    return NextResponse.redirect(new URL("/home?success=oauth_connected", req.url));
  }
}



