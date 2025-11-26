"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function GigaAIClient() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to agents page for now
    router.push("/agents");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p>Loading...</p>
    </div>
  );
}
