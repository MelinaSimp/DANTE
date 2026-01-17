/**
 * Validation utilities index
 * Re-exports from validation.ts to avoid module resolution conflicts
 */

// Re-export all functions from validation.ts
export {
  validatePhoneNumber,
  formatPhoneToE164,
  validateEmail,
  validateRequired,
  validateMinLength,
  validateMaxLength,
  sanitizeInput,
  validateContact,
  type ContactValidationResult,
} from "../validation";

// Re-export agent validator functions
export {
  validateAgent,
  validateScenario,
  validateAllScenarios,
  getValidationSummary,
  type ValidationResult,
  type ValidationError,
} from "./agent-validator";
