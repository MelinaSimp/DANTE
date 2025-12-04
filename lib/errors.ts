// lib/errors.ts
// Error handling utilities

export type ErrorSeverity = "error" | "warning" | "info";

export interface AppError {
  message: string;
  severity: ErrorSeverity;
  code?: string;
  field?: string;
  details?: string;
}

/**
 * Creates a standardized error object
 */
export function createError(
  message: string,
  severity: ErrorSeverity = "error",
  code?: string,
  field?: string,
  details?: string
): AppError {
  return {
    message,
    severity,
    code,
    field,
    details,
  };
}

/**
 * Formats error message for display
 */
export function formatError(error: AppError | string): string {
  if (typeof error === "string") {
    return error;
  }
  return error.message;
}

/**
 * Gets user-friendly error message from API errors
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "An unexpected error occurred. Please try again.";
}

/**
 * Common error messages
 */
export const ErrorMessages = {
  NETWORK_ERROR: "Network error. Please check your connection and try again.",
  UNAUTHORIZED: "You are not authorized to perform this action.",
  NOT_FOUND: "The requested resource was not found.",
  VALIDATION_ERROR: "Please check your input and try again.",
  SERVER_ERROR: "Server error. Please try again later.",
  PHONE_INVALID: "Please enter a valid phone number in E.164 format (e.g., +1234567890).",
  PHONE_REQUIRED: "Phone number is required.",
  WORKSPACE_NOT_FOUND: "Workspace not found. Please contact your administrator.",
  AGENT_NOT_FOUND: "Agent not found.",
  CALL_SESSION_NOT_FOUND: "Call session not found.",
} as const;




