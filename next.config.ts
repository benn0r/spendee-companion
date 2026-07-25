import type { NextConfig } from "next";

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

const nextConfig: NextConfig = {
  output: "standalone",
  generateBuildId: async () => appVersion,
  async headers() {
    const noStalePage = {
      key: "Cache-Control",
      value: "no-store, no-cache, max-age=0, must-revalidate",
    };
    return [
      { source: "/", headers: [noStalePage] },
      { source: "/monthly", headers: [noStalePage] },
      { source: "/wallets/:path*", headers: [noStalePage] },
      { source: "/categories/:path*", headers: [noStalePage] },
    ];
  },
};

export default nextConfig;
