/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000';

const nextConfig = {
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
