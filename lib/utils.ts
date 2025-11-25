// lib/utils.ts
export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}
export interface NoteLite { id: string; body: string; created_at: string }
