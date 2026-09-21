import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const upstream =
      process.env.API_UPSTREAM_URL ||
      (process.env.NEXT_PUBLIC_API_BASE_URL?.startsWith('http')
        ? process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/api\/v1\/?$/, '')
        : 'https://api-production-9cb27.up.railway.app');

    return [
      {
        source: '/api/:path*',
        destination: `${upstream}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
