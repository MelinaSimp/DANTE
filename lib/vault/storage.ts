// lib/vault/storage.ts
//
// Storage-side cleanup for vault files. Used by the delete handler and
// the zero-retention purge so raw documents don't linger in the bucket
// after the user removes them or under no-retention mode.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { VAULT_BUCKET, storagePathFromUrl } from "@/lib/vault/storage-path";

/**
 * Remove a vault file's object from storage given its stored URL.
 * Best-effort: returns true on success, false if there was nothing to
 * remove or the removal failed (logged, never throws).
 */
export async function deleteVaultFile(fileUrl: string | null | undefined): Promise<boolean> {
  const path = storagePathFromUrl(fileUrl);
  if (!path) return false;
  try {
    const { error } = await supabaseAdmin.storage.from(VAULT_BUCKET).remove([path]);
    if (error) {
      console.error("[vault-storage] remove failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[vault-storage] remove threw:", e instanceof Error ? e.message : e);
    return false;
  }
}
