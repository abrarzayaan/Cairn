import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/accounts/:path*",
        destination: `${backendUrl}/accounts/:path*`,
      },
      {
        source: "/admin-secret/:path*",
        destination: `${backendUrl}/admin-secret/:path*`,
      },
    ];
  },
};

export default nextConfig;

