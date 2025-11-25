// lib/validation.ts

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Contact validation
export function validateContact(data: {
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];

  // Name validation
  if (!data.name || data.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required' });
  } else if (data.name.trim().length < 2) {
    errors.push({ field: 'name', message: 'Name must be at least 2 characters long' });
  } else if (data.name.trim().length > 100) {
    errors.push({ field: 'name', message: 'Name must be less than 100 characters' });
  }

  // Phone validation
  if (!data.phone || data.phone.trim().length === 0) {
    errors.push({ field: 'phone', message: 'Phone number is required' });
  } else {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = data.phone.replace(/[\s\-\(\)\.]/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      errors.push({ field: 'phone', message: 'Please enter a valid phone number' });
    }
  }

  // Email validation (optional)
  if (data.email && data.email.trim().length > 0) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email.trim())) {
      errors.push({ field: 'email', message: 'Please enter a valid email address' });
    } else if (data.email.trim().length > 255) {
      errors.push({ field: 'email', message: 'Email must be less than 255 characters' });
    }
  }

  // Notes validation (optional)
  if (data.notes && data.notes.length > 1000) {
    errors.push({ field: 'notes', message: 'Notes must be less than 1000 characters' });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Appointment validation
export function validateAppointment(data: {
  contact_id?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  service_type?: string;
  notes?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];

  // Contact ID validation
  if (!data.contact_id || data.contact_id.trim().length === 0) {
    errors.push({ field: 'contact_id', message: 'Contact is required' });
  }

  // Scheduled date validation
  if (!data.scheduled_at || data.scheduled_at.trim().length === 0) {
    errors.push({ field: 'scheduled_at', message: 'Appointment date and time is required' });
  } else {
    const appointmentDate = new Date(data.scheduled_at);
    const now = new Date();
    
    if (isNaN(appointmentDate.getTime())) {
      errors.push({ field: 'scheduled_at', message: 'Please enter a valid date and time' });
    } else if (appointmentDate < now) {
      errors.push({ field: 'scheduled_at', message: 'Appointment cannot be scheduled in the past' });
    } else if (appointmentDate > new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) {
      errors.push({ field: 'scheduled_at', message: 'Appointment cannot be scheduled more than 1 year in advance' });
    }
  }

  // Duration validation
  if (!data.duration_minutes || data.duration_minutes <= 0) {
    errors.push({ field: 'duration_minutes', message: 'Duration must be greater than 0' });
  } else if (data.duration_minutes > 480) { // 8 hours
    errors.push({ field: 'duration_minutes', message: 'Duration cannot exceed 8 hours' });
  }

  // Service type validation
  if (!data.service_type || data.service_type.trim().length === 0) {
    errors.push({ field: 'service_type', message: 'Service type is required' });
  } else if (data.service_type.trim().length > 100) {
    errors.push({ field: 'service_type', message: 'Service type must be less than 100 characters' });
  }

  // Notes validation (optional)
  if (data.notes && data.notes.length > 1000) {
    errors.push({ field: 'notes', message: 'Notes must be less than 1000 characters' });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Knowledge base validation
export function validateKnowledgeEntry(data: {
  category?: string;
  title?: string;
  content?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];

  // Category validation
  if (!data.category || data.category.trim().length === 0) {
    errors.push({ field: 'category', message: 'Category is required' });
  } else if (data.category.trim().length > 50) {
    errors.push({ field: 'category', message: 'Category must be less than 50 characters' });
  }

  // Title validation
  if (!data.title || data.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required' });
  } else if (data.title.trim().length > 200) {
    errors.push({ field: 'title', message: 'Title must be less than 200 characters' });
  }

  // Content validation
  if (!data.content || data.content.trim().length === 0) {
    errors.push({ field: 'content', message: 'Content is required' });
  } else if (data.content.trim().length < 10) {
    errors.push({ field: 'content', message: 'Content must be at least 10 characters long' });
  } else if (data.content.length > 5000) {
    errors.push({ field: 'content', message: 'Content must be less than 5000 characters' });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Generic input sanitization
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

// Phone number formatting
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  return phone; // Return original if can't format
}

// Email validation helper
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// Phone validation helper
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
  return phoneRegex.test(cleanPhone);
}
