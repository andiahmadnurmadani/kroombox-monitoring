import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ssh2 ships a native addon for crypto; keep it a real require() instead of
  // letting webpack try to bundle/parse the compiled .node binary.
  serverExternalPackages: ["ssh2"],
};

export default nextConfig;
