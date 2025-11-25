const DEFAULT_SUPERADMIN_EMAIL = "adharsh.narendrakumar101@gmail.com";

const configuredEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();

export const SUPERADMIN_EMAIL =
  configuredEmail && configuredEmail.length > 0 ? configuredEmail : DEFAULT_SUPERADMIN_EMAIL;

export function hasSuperadminAccess(
  email: string | null | undefined,
  flaggedSuperadmin: boolean | null | undefined
): boolean {
  if (!flaggedSuperadmin || !email) return false;
  return email.toLowerCase().trim() === SUPERADMIN_EMAIL;
}












