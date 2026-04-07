export const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim() || null;

export function hasSuperadminAccess(
  email: string | null | undefined,
  flaggedSuperadmin: boolean | null | undefined
): boolean {
  if (!flaggedSuperadmin || !email) return false;
  if (!SUPERADMIN_EMAIL) {
    console.warn("SUPERADMIN_EMAIL env var not set — superadmin access denied");
    return false;
  }
  return email.toLowerCase().trim() === SUPERADMIN_EMAIL;
}












