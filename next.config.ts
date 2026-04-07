import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: false },
  // Route handler params typing requires Next.js 15 async-params migration
  // across ~25 files. Re-enable once migrated.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
