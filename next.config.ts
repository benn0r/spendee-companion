import type { NextConfig } from "next";

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@actual-app/api"],
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/@actual-app/api/dist/default-db.sqlite",
      "node_modules/@actual-app/api/dist/migrations/**/*",
    ],
  },
  generateBuildId: async () => appVersion,
  async headers() {
    const noStalePage = {
      key: "Cache-Control",
      value: "no-store, no-cache, max-age=0, must-revalidate",
    };
    return [
      { source: "/", headers: [noStalePage] },
      { source: "/monthly", headers: [noStalePage] },
      { source: "/splits", headers: [noStalePage] },
      { source: "/mcp", headers: [noStalePage] },
      { source: "/wallets/:path*", headers: [noStalePage] },
      { source: "/categories/:path*", headers: [noStalePage] },
    ];
  },
};

export default nextConfig;
