import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000";
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

