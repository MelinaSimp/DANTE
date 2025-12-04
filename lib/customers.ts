// lib/customers.ts
// Customer status determination and utilities

export type CustomerStatus = "inquiry" | "current" | "past";

export interface CustomerInfo {
  id: string; // contact_id or phone number
  name: string | null;
  phone: string;
  email: string | null;
  status: CustomerStatus;
  lastInteractionAt: string | null;
  firstInteractionAt: string;
  totalInteractions: number;
  hasActiveBooking: boolean;
  hasCompletedBooking: boolean;
}

/**
 * Determines customer status based on interaction history
 * - Inquiry: First interaction, no completed booking
 * - Current: Active booking OR interaction within last 30 days
 * - Past: Completed booking, no interaction in 30+ days
 */
export function determineCustomerStatus(
  firstInteractionAt: string,
  lastInteractionAt: string | null,
  hasActiveBooking: boolean,
  hasCompletedBooking: boolean
): CustomerStatus {
  // If they have an active booking, they're current
  if (hasActiveBooking) {
    return "current";
  }

  // If no last interaction, they're inquiry (first contact)
  if (!lastInteractionAt) {
    return "inquiry";
  }

  // Check if last interaction was within 30 days
  const lastInteraction = new Date(lastInteractionAt);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const isRecent = lastInteraction >= thirtyDaysAgo;

  // If they have a completed booking but no recent interaction, they're past
  if (hasCompletedBooking && !isRecent) {
    return "past";
  }

  // If recent interaction, they're current
  if (isRecent) {
    return "current";
  }

  // Otherwise, they're inquiry (first contact, no booking)
  return "inquiry";
}

/**
 * Gets initials from a name
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Formats relative time (e.g., "12 minutes ago")
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  
  return date.toLocaleDateString();
}

/**
 * Truncates text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}




