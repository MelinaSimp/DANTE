// app/debug-status/page.tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { hasSuperadminAccess, SUPERADMIN_EMAIL } from "@/lib/superadmin";

export default async function DebugStatusPage() {
  const supabase = await createServerSupabase();
  
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect("/auth");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_superadmin, full_name, workspace_id, role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const hasAccess = hasSuperadminAccess(auth.user.email, profile?.is_superadmin);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Debug Status</h1>
      
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-2">User Information</h2>
          <div className="bg-gray-50 rounded p-4">
            <p><strong>ID:</strong> {auth.user.id}</p>
            <p><strong>Email:</strong> {auth.user.email}</p>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Profile Information</h2>
          <div className="bg-gray-50 rounded p-4">
            {profile ? (
              <>
                <p><strong>Full Name:</strong> {profile.full_name || "Not set"}</p>
                <p><strong>Role:</strong> {profile.role || "Not set"}</p>
                <p><strong>Is Superadmin:</strong> 
                  <span className={`ml-2 px-2 py-1 rounded text-sm ${profile.is_superadmin ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {profile.is_superadmin ? 'YES' : 'NO'}
                  </span>
                </p>
                <p><strong>Workspace ID:</strong> {profile.workspace_id || "Not set"}</p>
                <p><strong>Eligible Superadmin Email:</strong> {SUPERADMIN_EMAIL}</p>
              </>
            ) : (
              <p className="text-red-600">No profile found! This is the problem.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Expected Behavior</h2>
          <div className="bg-blue-50 rounded p-4">
            <p><strong>Should see Admin link:</strong> {hasAccess ? 'YES' : 'NO'}</p>
            <p><strong>Should redirect to /admin:</strong> {hasAccess ? 'YES' : 'NO'}</p>
            <p><strong>Can access /admin:</strong> {hasAccess ? 'YES' : 'NO'}</p>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Quick Fix</h2>
          <div className="bg-yellow-50 rounded p-4">
            <p className="mb-2">
              If <strong>Is Superadmin</strong> shows <strong>NO</strong> for the account <strong>{SUPERADMIN_EMAIL}</strong>,
              run this SQL in Supabase:
            </p>
            <code className="block bg-gray-100 p-2 rounded text-sm">
              UPDATE profiles SET is_superadmin = true WHERE id = '{auth.user.id}';
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
