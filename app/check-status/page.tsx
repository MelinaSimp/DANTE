import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { hasSuperadminAccess, SUPERADMIN_EMAIL } from "@/lib/superadmin";

export default async function CheckStatusPage() {
  const supabase = await createServerSupabase();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Status Check</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Not logged in. Please sign in first.</p>
        </div>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const isSuperadmin = hasSuperadminAccess(user.email, profile?.is_superadmin);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Your Account Status</h1>
      
      <div className="space-y-4">
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-3">User Information</h2>
          <div className="space-y-2 text-sm">
            <div><strong>User ID:</strong> {user.id}</div>
            <div><strong>Email:</strong> {user.email}</div>
            <div><strong>Created:</strong> {new Date(user.created_at).toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-3">Profile Information</h2>
          {profile ? (
            <div className="space-y-2 text-sm">
              <div><strong>Full Name:</strong> {profile.full_name || 'Not set'}</div>
              <div><strong>Role:</strong> {profile.role || 'Not set'}</div>
              <div><strong>Is Superadmin:</strong> 
                <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                  isSuperadmin ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {isSuperadmin ? 'YES' : 'NO'}
                </span>
              </div>
              <div><strong>Designated Superadmin Email:</strong> {SUPERADMIN_EMAIL}</div>
              <div><strong>Workspace ID:</strong> {profile.workspace_id || 'None'}</div>
            </div>
          ) : (
            <div className="text-red-600">No profile found!</div>
          )}
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-3">What You Should See</h2>
          <div className="space-y-2 text-sm">
            <div>• If you're a superadmin, you should see a "Superadmin" link in the navigation</div>
            <div>• If you're a superadmin, visiting the home page should redirect to /superadmin</div>
            <div>• If you're not a superadmin, you'll see the regular appointments page</div>
          </div>
        </div>

        {isSuperadmin && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3 text-green-800">🎉 You are a Superadmin!</h2>
            <p className="text-green-700">
              You should see the enhanced superadmin interface. Try visiting the home page or clicking "Superadmin" in the navigation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
