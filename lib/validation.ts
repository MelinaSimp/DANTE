// lib/validation.ts
// Validation utilities for forms and user input

/**
 * Validates phone number format (E.164)
 * Returns null if valid, error message if invalid
 */
export function validatePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) {
    return "Phone number is required";
  }

  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, "");

  // Must start with + and have 10-15 digits after country code
  if (!cleaned.startsWith("+")) {
    return "Phone number must start with + (e.g., +1234567890)";
  }

  const digits = cleaned.substring(1);
  if (digits.length < 10 || digits.length > 15) {
    return "Phone number must be 10-15 digits after country code";
  }

  // Check for valid country code (1-3 digits)
  if (digits.length < 10) {
    return "Phone number is too short";
  }

  return null; // Valid
}

/**
 * Formats phone number to E.164 format
 * Assumes US numbers if no country code provided
 */
export function formatPhoneToE164(phone: string): string {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // If 10 digits, assume US (+1)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  // If 11 digits starting with 1, add +
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

  // Otherwise, add + prefix
  return `+${cleaned}`;
}

/**
 * Validates email format
 */
export function validateEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null; // Email is optional in most cases
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "Please enter a valid email address";
  }

  return null;
}

/**
 * Validates required field
 */
export function validateRequired(value: string | null | undefined, fieldName: string): string | null {
  if (!value || value.trim().length === 0) {
    return `${fieldName} is required`;
  }
  return null;
}

/**
 * Validates minimum length
 */
export function validateMinLength(value: string, minLength: number, fieldName: string): string | null {
  if (value.length < minLength) {
    return `${fieldName} must be at least ${minLength} characters`;
  }
  return null;
}

/**
 * Validates maximum length
 */
export function validateMaxLength(value: string, maxLength: number, fieldName: string): string | null {
  if (value.length > maxLength) {
    return `${fieldName} must be no more than ${maxLength} characters`;
  }
  return null;
}

/**
 * Sanitizes user input to prevent XSS attacks
 * Trims whitespace and escapes HTML entities
 */
export function sanitizeInput(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  // Trim whitespace
  let sanitized = String(input).trim();

  // Escape HTML entities to prevent XSS
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // Limit length to prevent DoS (10,000 characters max)
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }

  return sanitized;
}

/**
 * Contact validation result
 */
export interface ContactValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates contact data
 */
export function validateContact(data: {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
}): ContactValidationResult {
  const errors: string[] = [];

  // Validate name (required)
  const nameError = validateRequired(data.name, 'Name');
  if (nameError) {
    errors.push(nameError);
  } else {
    const nameLengthError = validateMaxLength(data.name, 255, 'Name');
    if (nameLengthError) {
      errors.push(nameLengthError);
    }
  }

  // Validate email (optional but must be valid if provided)
  if (data.email && data.email.trim().length > 0) {
    const emailError = validateEmail(data.email);
    if (emailError) {
      errors.push(emailError);
    } else {
      const emailLengthError = validateMaxLength(data.email, 255, 'Email');
      if (emailLengthError) {
        errors.push(emailLengthError);
      }
    }
  }

  // Validate phone (optional but must be valid if provided)
  if (data.phone && data.phone.trim().length > 0) {
    const phoneError = validatePhoneNumber(data.phone);
    if (phoneError) {
      errors.push(phoneError);
    }
  }

  // Validate notes (optional, but limit length if provided)
  if (data.notes && data.notes.trim().length > 0) {
    const notesLengthError = validateMaxLength(data.notes, 5000, 'Notes');
    if (notesLengthError) {
      errors.push(notesLengthError);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
