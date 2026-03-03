// Test page to check superadmin status
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess, SUPERADMIN_EMAIL } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

export default async function AdminTestPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  
  if (!auth.user) {
    return (
      <div className="p-8 text-white">
        <h1 className="text-2xl font-bold mb-4">Admin Test</h1>
        <p className="text-red-400">Not logged in</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_superadmin, role, full_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  const isAdmin = hasSuperadminAccess(auth.user.email, profile?.is_superadmin);

  return (
    <div className="p-8 text-white max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Admin Access Test</h1>
      
      <div className="space-y-4 bg-black/40 p-6 rounded-2xl border border-white/10">
        <div>
          <strong>Your Email:</strong> {auth.user.email}
        </div>
        <div>
          <strong>Superadmin Email (Expected):</strong> {SUPERADMIN_EMAIL}
        </div>
        <div>
          <strong>Profile is_superadmin:</strong> {profile?.is_superadmin ? "true" : "false"}
        </div>
        <div>
          <strong>Profile role:</strong> {profile?.role || "null"}
        </div>
        <div>
          <strong>Has Superadmin Access:</strong>{" "}
          <span className={isAdmin ? "text-green-400" : "text-red-400"}>
            {isAdmin ? "YES ✅" : "NO ❌"}
          </span>
        </div>
        <div>
          <strong>User ID:</strong> {auth.user.id}
        </div>
        <div>
          <strong>Profile ID:</strong> {profile?.id || "No profile found"}
        </div>
      </div>

      {isAdmin ? (
        <div className="mt-6">
          <a
            href="/admin"
            className="inline-block px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition"
          >
            Go to Admin Dashboard →
          </a>
        </div>
      ) : (
        <div className="mt-6 p-4 bg-red-500/20 border border-red-500 rounded-lg">
          <p className="text-red-400">
            You don't have superadmin access. Make sure:
          </p>
          <ul className="list-disc list-inside mt-2 text-white/70">
            <li>Your email matches: {SUPERADMIN_EMAIL}</li>
            <li>Your profile has is_superadmin = true in the database</li>
            <li>You've logged out and back in after setting is_superadmin</li>
          </ul>
        </div>
      )}
    </div>
  );
}
