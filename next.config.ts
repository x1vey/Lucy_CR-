import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // MUI + Emotion are fine with the App Router; nothing special needed here.
  // Server Actions body size bumped for form/CSV imports.
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
