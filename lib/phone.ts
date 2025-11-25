// lib/phone.ts
// Minimal E.164 normalizer for US numbers. Expand as needed.
export function normalizePhone(input: string | undefined | null): string | null {
  if (!input) return null;
  
  // Remove all non-digit characters except +
  const cleaned = input.replace(/[^\d+]/g, "");
  
  // If it starts with + but missing country code (e.g., +2163508215)
  if (cleaned.startsWith("+")) {
    const afterPlus = cleaned.substring(1);
    // If it's 10 digits after +, add country code 1
    if (afterPlus.length === 10 && /^\d{10}$/.test(afterPlus)) {
      return `+1${afterPlus}`;
    }
    // If it's 11 digits and starts with 1, it's already correct
    if (afterPlus.length === 11 && afterPlus.startsWith("1")) {
      return cleaned;
    }
    // If it's already in correct format (+1...), return as is
    if (afterPlus.length === 11 && afterPlus.startsWith("1")) {
      return cleaned;
    }
  }
  
  // If no +, treat as digits only
  const just = cleaned.replace(/\D/g, "");
  if (just.length === 11 && just.startsWith("1")) return `+${just}`;
  if (just.length === 10) return `+1${just}`;
  
  return null;
}
