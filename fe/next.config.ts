import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Rewrite proxy: tất cả /api/* → BE (NestJS :4000)
  // Giúp cookie httpOnly hoạt động same-origin (không cần CORS phức tạp)
  async rewrites() {
    // In the container deployment Caddy routes /api directly to NestJS.
    if (process.env.API_PROXY_EXTERNAL === 'true') return [];
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
