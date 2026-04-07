export const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim() || null;

export function hasSuperadminAccess(
  email: string | null | undefined,
  flaggedSuperadmin: boolean | null | undefined
): boolean {
  if (!flaggedSuperadmin) return false;

  if (SUPERADMIN_EMAIL && email) {
    return email.toLowerCase().trim() === SUPERADMIN_EMAIL;
  }

  return !!flaggedSuperadmin;
}












