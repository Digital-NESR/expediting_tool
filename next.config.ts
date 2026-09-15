import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '52mb',
    },
  },
  async headers() {
    return [
      {
        // The supplier portal is reached with a write-capable token in the query string,
        // and the page embeds a third-party (SharePoint) help video. Suppress the Referer
        // entirely so that token cannot leak to any outbound origin.
        source: '/supplier-update/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/supplier-update',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default nextConfig;
