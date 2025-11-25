"use client";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  return (
    <Button 
      onClick={handleSignOut}
      className="bg-gradient-to-r from-[#229CF3] to-[#60B2F5] hover:from-[#1E8CE8] hover:to-[#4DA8F4] text-white"
    >
      Sign Out
    </Button>
  );
}