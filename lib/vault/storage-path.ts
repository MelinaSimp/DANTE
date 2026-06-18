// lib/vault/storage-path.ts
//
// Pure helper: derive the object path inside the `agent-files` bucket
// from a stored file URL (public or signed). Kept dependency-free so
// it can be unit-tested without constructing a Supabase client.

export const VAULT_BUCKET = "agent-files";

/**
 * Extract the storage object path from a vault file URL.
 *   https://x/storage/v1/object/public/agent-files/vault/ws/123_a.pdf
 *     -> "vault/ws/123_a.pdf"
 * Returns null for URLs that don't point at the bucket (e.g. external
 * links or local watched-folder paths).
 */
export function storagePathFromUrl(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  const marker = `/${VAULT_BUCKET}/`;
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  let path = fileUrl.slice(idx + marker.length);
  const q = path.indexOf("?");
  if (q !== -1) path = path.slice(0, q);
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep raw on malformed encoding */
  }
  return path || null;
}
