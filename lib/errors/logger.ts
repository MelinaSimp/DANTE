// lib/errors/logger.ts
// Comprehensive error logging system

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface ErrorLog {
  type: string;
  source: string;
  error: any;
  context: Record<string, any>;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  workspaceId?: string;
}

/**
 * Log error to console and database
 */
export async function logError(log: ErrorLog): Promise<void> {
  // Log to console
  const severityEmoji = {
    low: '🔵',
    medium: '🟡',
    high: '🟠',
    critical: '🔴'
  };
  
  console.error(
    `${severityEmoji[log.severity]} [${log.severity.toUpperCase()}] [${log.type}]`,
    {
      source: log.source,
      error: log.error,
      context: log.context,
      timestamp: log.timestamp
    }
  );
  
  // Store in database for analysis
  try {
    await supabaseAdmin.from("error_logs").insert({
      type: log.type,
      source: log.source,
      error_message: log.error?.message || String(log.error),
      error_stack: log.error?.stack,
      error_code: log.error?.code,
      context: log.context,
      severity: log.severity,
      workspace_id: log.workspaceId || null,
      timestamp: log.timestamp
    });
  } catch (dbError) {
    // If database logging fails, at least we have console log
    console.error("Failed to log error to database:", dbError);
  }
  
  // Alert on critical errors (could integrate with PagerDuty, Slack, etc.)
  if (log.severity === 'critical') {
    await sendAlert(log);
  }
}

/**
 * Send alert for critical errors
 */
async function sendAlert(log: ErrorLog): Promise<void> {
  // TODO: Integrate with alerting service (PagerDuty, Slack, email, etc.)
  console.error("🚨 CRITICAL ERROR ALERT:", log);
  
  // Example: Send to webhook
  // if (process.env.ALERT_WEBHOOK_URL) {
  //   await fetch(process.env.ALERT_WEBHOOK_URL, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify(log)
  //   });
  // }
}

/**
 * Helper to determine error severity
 */
export function determineSeverity(error: any, context: Record<string, any>): 'low' | 'medium' | 'high' | 'critical' {
  // Critical: System failures, data loss, security issues
  if (error?.code === 500 || 
      error?.message?.includes('database') ||
      error?.message?.includes('authentication') ||
      error?.message?.includes('authorization')) {
    return 'critical';
  }
  
  // High: User-facing errors, payment failures, API failures
  if (error?.code === 400 ||
      error?.code === 401 ||
      error?.code === 403 ||
      error?.code === 404 ||
      context?.userFacing) {
    return 'high';
  }
  
  // Medium: Warnings, retryable errors
  if (error?.code === 429 ||
      error?.message?.includes('timeout') ||
      error?.message?.includes('rate limit')) {
    return 'medium';
  }
  
  // Low: Informational, expected errors
  return 'low';
}

/**
 * Create error response for Twilio
 */
export function generateErrorTwiML(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Validate URL for TwiML
 */
export function validateTwiMLUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  // Network errors, rate limits are retryable
  return error?.code === 20003 || // Unreachable
         error?.code === 429 ||    // Rate limit
         error?.code === 500 ||    // Server error
         error?.code === 502 ||    // Bad gateway
         error?.code === 503 ||    // Service unavailable
         error?.message?.includes('timeout') ||
         error?.message?.includes('ECONNREFUSED') ||
         error?.message?.includes('network');
}


