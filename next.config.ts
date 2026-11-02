import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  // Parsers that rely on Node built-ins stay outside the bundle.
  serverExternalPackages: ["mammoth", "unpdf", "@prisma/client", "cheerio"],
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
