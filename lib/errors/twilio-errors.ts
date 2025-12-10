// lib/errors/twilio-errors.ts
// Twilio-specific error handling

import { logError } from "./logger";

/**
 * Handle Twilio API errors
 */
export async function handleTwilioError(
  error: any,
  context: {
    source: string;
    conversationId?: string;
    workspaceId?: string;
    [key: string]: any;
  }
): Promise<{ handled: boolean; message?: string }> {
  const errorCode = error?.code;
  const errorMessage = error?.message || String(error);
  
  // Log the error
  await logError({
    type: "twilio_error",
    source: context.source,
    error,
    context,
    timestamp: new Date().toISOString(),
    severity: getTwilioErrorSeverity(errorCode),
    workspaceId: context.workspaceId
  });
  
  // Handle specific error codes
  switch (errorCode) {
    case 21211: // Invalid 'To' Phone Number
      return {
        handled: true,
        message: "Invalid phone number format. Please check the number and try again."
      };
    
    case 21608: // Unsubscribed recipient
      return {
        handled: true,
        message: "Recipient has unsubscribed from SMS messages."
      };
    
    case 21408: // Permission denied
      return {
        handled: true,
        message: "Cannot send SMS to this number. Please verify your Twilio account."
      };
    
    case 20003: // Unreachable destination
      return {
        handled: true,
        message: "Cannot reach the destination. Please try again later."
      };
    
    case 11200: // HTTP retrieval failure
      return {
        handled: true,
        message: "Failed to retrieve audio file. Please try again."
      };
    
    case 12300: // Invalid Content-Type
      return {
        handled: true,
        message: "Configuration error. Please contact support."
      };
    
    case 429: // Rate limit
      return {
        handled: true,
        message: "Rate limit exceeded. Please try again in a few minutes."
      };
    
    default:
      return {
        handled: false,
        message: "An unexpected error occurred. Please try again."
      };
  }
}

/**
 * Get severity for Twilio error code
 */
function getTwilioErrorSeverity(code: number | string | undefined): 'low' | 'medium' | 'high' | 'critical' {
  if (!code) return 'medium';
  
  const codeNum = typeof code === 'string' ? parseInt(code) : code;
  
  // Critical: System failures
  if (codeNum >= 20000 && codeNum < 20100) return 'critical';
  
  // High: User-facing errors
  if (codeNum >= 21200 && codeNum < 21300) return 'high';
  if (codeNum >= 21400 && codeNum < 21500) return 'high';
  if (codeNum >= 21600 && codeNum < 21700) return 'high';
  
  // Medium: Warnings, retryable
  if (codeNum === 429) return 'medium';
  if (codeNum >= 11200 && codeNum < 11300) return 'medium';
  
  return 'medium';
}

/**
 * Generate user-friendly error message for Twilio errors
 */
export function getTwilioErrorMessage(error: any): string {
  const code = error?.code;
  const message = error?.message || "An error occurred";
  
  const errorMessages: Record<number, string> = {
    21211: "Invalid phone number format",
    21608: "Recipient has unsubscribed",
    21408: "Cannot send to this number. Please verify your account",
    20003: "Cannot reach destination",
    11200: "Failed to retrieve audio",
    12300: "Configuration error",
    429: "Rate limit exceeded. Please try again later"
  };
  
  return errorMessages[code] || message;
}




